import type { TTSSettings, TTSEngineType } from '../../types';
import { getApiBase } from '../apiConfig';
import { db } from '../db';
import { pronunciationService } from './pronunciation';
import { shakeDetector } from './shakeDetector';
import { ambientAudioService } from './ambientAudio';

export type TTSState = 'idle' | 'playing' | 'paused';

export interface TTSListener {
  onStateChange?: (state: TTSState) => void;
  onSentenceChange?: (sentenceIndex: number, sentenceText: string) => void;
  onChapterComplete?: () => void;
  onTimeRemainingUpdate?: (secondsLeft: number | null) => void;
}

export interface VoiceOption {
  id: string;
  name: string;
  category: TTSEngineType;
  gender: 'male' | 'female' | 'neutral';
  badge: string;
  description: string;
  isOnline: boolean;
}

export const CURATED_VOICES: VoiceOption[] = [
  {
    id: 'edge:vi-VN-NamMinhNeural',
    name: 'Nam Minh (AI Neural)',
    category: 'ai',
    gender: 'male',
    badge: 'Hào Hùng · Kiếm Hiệp',
    description: 'Giọng Nam trầm ấm, hào hùng, đọc truyện Kiếm hiệp, Tiên hiệp cực kỳ lôi cuốn',
    isOnline: true
  },
  {
    id: 'edge:vi-VN-HoaiMyNeural',
    name: 'Hoài My (AI Neural)',
    category: 'ai',
    gender: 'female',
    badge: 'Truyền Cảm · Ngôn Tình',
    description: 'Giọng Nữ truyền cảm, ngọt ngào, phù hợp Ngôn tình, Đô thị, Huyền huyễn',
    isOnline: true
  },
  {
    id: 'google:vi',
    name: 'Google Tiếng Việt',
    category: 'google',
    gender: 'female',
    badge: 'Chuẩn Mực · Rõ Ràng',
    description: 'Giọng đọc Google chuẩn xác, rõ từng chữ, dễ nghe',
    isOnline: true
  }
];

const getTtsApiBase = () => getApiBase();

class TTSEngine {
  private synth: SpeechSynthesis | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private sentences: string[] = [];
  private currentSentenceIndex = 0;
  private state: TTSState = 'idle';
  private listeners: Set<TTSListener> = new Set();
  private sleepTimerId: number | null = null;
  private sleepTimerSeconds: number | null = null;
  private sleepCountdownInterval: number | null = null;

  // Double-buffering audio players for zero-latency gapless playback
  private audioPlayers: [HTMLAudioElement | null, HTMLAudioElement | null] = [null, null];
  private activePlayerIndex: 0 | 1 = 0;
  private playerLoadedSentenceIndex: [number, number] = [-1, -1];

  private testAudio: HTMLAudioElement | null = null;
  private silentAudio: HTMLAudioElement | null = null;

  // Blob cache maps sentence index -> object URL
  private audioBlobCache: Map<number, string> = new Map();
  private fetchingSentences: Set<number> = new Set();

  // Guard against race conditions and obsolete callbacks
  private playbackToken = 0;
  private consecutiveErrors = 0;

  // Metadata for Native Notification & MediaSession
  private currentBookTitle = '';
  private currentAuthor = '';
  private currentChapterTitle = '';
  private currentCoverUrl = '';
  private currentStoryId = '';
  private currentChapterNumber = 0;
  private shakeCleanup: (() => void) | null = null;

  private settings: TTSSettings = {
    voiceURI: 'edge:vi-VN-NamMinhNeural',
    engine: 'ai',
    rate: 1.0,
    pitch: 1.0,
    sleepTimerMinutes: null,
    highlightSentence: true,
    autoNextChapter: true,
    playAlongOtherApps: true
  };

  constructor() {
    if (typeof window !== 'undefined') {
      if ('speechSynthesis' in window) {
        this.synth = window.speechSynthesis;
      }
      this.setupSilentAudio();
      this.setupAudioPlayers();

      // Initialize custom pronunciation dictionary
      pronunciationService.init().catch(() => {});

      // Sync native playback index when app regains focus/visibility
      window.addEventListener('focus', () => this.syncNativePlaybackIndex());
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          this.syncNativePlaybackIndex();
        }
      });

      // Sync background audio focus coexistence with Android system
      setTimeout(() => {
        this.syncPlayAlongOtherApps(this.settings.playAlongOtherApps !== false);
      }, 500);

      // Expose globally for Android WebView Bridge callbacks
      (window as any).ttsEngine = this;
    }
  }

  private audioContext: AudioContext | null = null;
  private silentSource: AudioBufferSourceNode | null = null;

  private setupSilentAudio() {
    // Generate valid 2-second silent WAV so browser audio engine keeps mobile audio pipeline alive
    try {
      const sampleRate = 8000;
      const numSamples = sampleRate * 2;
      const buffer = new ArrayBuffer(44 + numSamples);
      const view = new DataView(buffer);
      const writeStr = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
      };
      writeStr(0, 'RIFF');
      view.setUint32(4, 36 + numSamples, true);
      writeStr(8, 'WAVE');
      writeStr(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true); // PCM
      view.setUint16(22, 1, true); // mono
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate, true);
      view.setUint16(32, 1, true);
      view.setUint16(34, 8, true);
      writeStr(36, 'data');
      view.setUint32(40, numSamples, true);
      new Uint8Array(buffer).fill(128, 44);

      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      this.silentAudio = new Audio('data:audio/wav;base64,' + btoa(binary));
      this.silentAudio.loop = true;
      this.silentAudio.volume = 0.01;
    } catch {
      // Fallback 1-sample wav
      this.silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
      this.silentAudio.loop = true;
      this.silentAudio.volume = 0.01;
    }
  }

  private startBackgroundAudioContext() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.audioContext) {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }
      if (!this.silentSource) {
        const buffer = this.audioContext.createBuffer(1, this.audioContext.sampleRate * 2, this.audioContext.sampleRate);
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const gain = this.audioContext.createGain();
        gain.gain.value = 0.0001; // Inaudible, holds AudioTrack pipeline open
        source.connect(gain);
        gain.connect(this.audioContext.destination);
        source.start(0);
        this.silentSource = source;
      }
    } catch (e) {
      console.warn('Silent AudioContext start error:', e);
    }
  }

  private stopBackgroundAudioContext() {
    try {
      if (this.silentSource) {
        this.silentSource.stop();
        this.silentSource.disconnect();
        this.silentSource = null;
      }
      if (this.audioContext && this.audioContext.state === 'running') {
        this.audioContext.suspend().catch(() => {});
      }
    } catch {}
  }

  public getEffectivePlaybackRate(): number {
    const voice = this.settings.voiceURI || '';
    const isGoogle = voice.startsWith('google');
    const requestedRate = typeof this.settings.rate === 'number' && !isNaN(this.settings.rate)
      ? this.settings.rate
      : 1.0;
    const clamped = Math.max(0.5, Math.min(4.0, requestedRate));

    if (isGoogle) {
      // Google TTS API on server returns 1.0x audio.
      // Client HTML5 audio element speeds it up to the exact requested rate!
      return clamped;
    }

    // For Edge TTS, server synthesizes with rate up to 2.0x.
    // For speeds > 2.0x, the client player handles the multiplier (e.g. 3.0 / 2.0 = 1.5).
    if (clamped > 2.0) {
      return clamped / 2.0;
    }

    return 1.0;
  }

  public applyPlaybackRate(audio: HTMLAudioElement | null) {
    if (!audio) return;
    try {
      const effRate = this.getEffectivePlaybackRate();
      if ('preservesPitch' in audio) {
        (audio as any).preservesPitch = true;
      }
      audio.playbackRate = effRate;
      audio.defaultPlaybackRate = effRate;
    } catch (e) {
      console.warn('Failed to apply playbackRate:', e);
    }
  }

  private createAudioElement(): HTMLAudioElement {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.loop = false;
    this.applyPlaybackRate(audio);
    return audio;
  }

  private setupAudioPlayers() {
    this.audioPlayers = [this.createAudioElement(), this.createAudioElement()];
    this.activePlayerIndex = 0;
    this.playerLoadedSentenceIndex = [-1, -1];
    this.applyPlaybackRate(this.audioPlayers[0]);
    this.applyPlaybackRate(this.audioPlayers[1]);
  }

  private get activePlayer(): HTMLAudioElement {
    if (!this.audioPlayers[this.activePlayerIndex]) {
      this.audioPlayers[this.activePlayerIndex] = this.createAudioElement();
    }
    return this.audioPlayers[this.activePlayerIndex]!;
  }

  private get nextPlayer(): HTMLAudioElement {
    const nextIdx = this.activePlayerIndex === 0 ? 1 : 0;
    if (!this.audioPlayers[nextIdx]) {
      this.audioPlayers[nextIdx] = this.createAudioElement();
    }
    return this.audioPlayers[nextIdx]!;
  }

  public isOnlineVoice(voiceURI?: string): boolean {
    const v = voiceURI !== undefined ? voiceURI : this.settings.voiceURI;
    if (!v) return true;
    if (v.startsWith('native:')) return false;
    return v.startsWith('edge:') || v.startsWith('google:');
  }

  public isNativeVoice(voiceURI?: string): boolean {
    const v = voiceURI !== undefined ? voiceURI : this.settings.voiceURI;
    if (!v) return false;
    if (v.startsWith('native:')) return true;
    const isAndroid = typeof window !== 'undefined' && Boolean((window as any).AndroidMedia);
    if (isAndroid && !this.isOnlineVoice(v)) {
      return true;
    }
    return false;
  }

  public getVoices(): SpeechSynthesisVoice[] {
    if (!this.synth) return [];
    return this.synth.getVoices();
  }

  public getVietnameseVoices(): SpeechSynthesisVoice[] {
    const all = this.getVoices();
    const vi = all.filter(v => 
      v.lang.toLowerCase().startsWith('vi') || 
      v.name.toLowerCase().includes('vietnam') || 
      v.name.toLowerCase().includes('tiếng việt')
    );
    return vi.length > 0 ? vi : all;
  }

  public getAllAvailableVoices(): VoiceOption[] {
    const list: VoiceOption[] = [...CURATED_VOICES];

    const isAndroid = typeof window !== 'undefined' && (
      Boolean((window as any).AndroidMedia) || 
      /android/i.test(navigator.userAgent)
    );

    if (isAndroid) {
      list.push({
        id: 'native:android',
        name: 'Giọng máy Android (100% Offline)',
        category: 'native',
        gender: 'neutral',
        badge: '100% Offline · Không mạng',
        description: 'Giọng đọc gốc của điện thoại Android (Google/Samsung TTS), đọc mượt mà không cần mạng Internet',
        isOnline: false
      });
    }

    const browserVoices = this.getVietnameseVoices();
    browserVoices.forEach(bv => {
      const lower = bv.name.toLowerCase();
      const isMale = lower.includes('male') || lower.includes('nam') || lower.includes('an');
      list.push({
        id: bv.voiceURI,
        name: bv.name,
        category: 'browser',
        gender: isMale ? 'male' : 'female',
        badge: 'Offline · Thiết bị',
        description: `Giọng đọc có sẵn trên máy (${bv.lang}) - Hoạt động khi không có mạng`,
        isOnline: false
      });
    });

    return list;
  }

  public async testVoice(
    voiceURI: string, 
    sampleText = 'Xin chào, bạn đang nghe thử giọng đọc trên ứng dụng Chill Reader.'
  ): Promise<void> {
    // If story was playing, pause it so voices don't clash
    if (this.state === 'playing') {
      this.pause();
    }

    if (this.testAudio) {
      this.testAudio.pause();
      this.testAudio.src = '';
      this.testAudio = null;
    }
    if (this.synth) {
      if (this.currentUtterance) {
        this.currentUtterance.onend = null;
        this.currentUtterance.onerror = null;
      }
      this.synth.cancel();
    }

    if (this.isOnlineVoice(voiceURI)) {
      const isGoogle = voiceURI.startsWith('google');
      const serverRate = isGoogle ? 1.0 : Math.min(2.0, Math.max(0.5, this.settings.rate));
      const url = `${getTtsApiBase()}/api/tts?voice=${encodeURIComponent(voiceURI)}&rate=${serverRate}&pitch=${this.settings.pitch}&text=${encodeURIComponent(sampleText)}`;
      this.testAudio = new Audio(url);
      const effRate = isGoogle
        ? Math.max(0.5, Math.min(4.0, this.settings.rate))
        : (this.settings.rate > 2.0 ? this.settings.rate / 2.0 : 1.0);
      if ('preservesPitch' in this.testAudio) {
        (this.testAudio as any).preservesPitch = true;
      }
      this.testAudio.playbackRate = effRate;
      this.testAudio.defaultPlaybackRate = effRate;
      await this.testAudio.play();
    } else if (this.isNativeVoice(voiceURI)) {
      const androidMedia = (window as any).AndroidMedia;
      if (androidMedia && typeof androidMedia.speakNative === 'function') {
        androidMedia.speakNative(sampleText, this.settings.rate || 1.0, this.settings.pitch || 1.0, 'test_sample');
      }
    } else {
      if (!this.synth) return;
      const utterance = new SpeechSynthesisUtterance(sampleText);
      this.currentUtterance = utterance;
      utterance.rate = this.settings.rate;
      utterance.pitch = this.settings.pitch;
      const voice = this.getVoices().find(v => v.voiceURI === voiceURI);
      if (voice) utterance.voice = voice;
      this.synth.speak(utterance);
    }
  }

  /**
   * Update settings with instant, seamless voice and speed handover
   */
  public updateSettings(newSettings: Partial<TTSSettings>) {
    const voiceChanged = newSettings.voiceURI !== undefined && newSettings.voiceURI !== this.settings.voiceURI;
    const rateChanged = newSettings.rate !== undefined && newSettings.rate !== this.settings.rate;
    const pitchChanged = newSettings.pitch !== undefined && newSettings.pitch !== this.settings.pitch;

    this.settings = { ...this.settings, ...newSettings };

    if (newSettings.sleepTimerMinutes !== undefined) {
      this.setSleepTimer(newSettings.sleepTimerMinutes);
    }

    if (newSettings.playAlongOtherApps !== undefined) {
      this.syncPlayAlongOtherApps(newSettings.playAlongOtherApps);
    }

    // Immediately update live playbackRate on all players
    this.applyPlaybackRate(this.audioPlayers[0]);
    this.applyPlaybackRate(this.audioPlayers[1]);
    this.applyPlaybackRate(this.testAudio);

    const isGoogle = (this.settings.voiceURI || '').startsWith('google');

    // For Google TTS, playbackRate change is 100% real-time and doesn't require restarting sentence!
    if (voiceChanged || pitchChanged || (rateChanged && !isGoogle)) {
      this.clearAudioBlobCache();
      this.playerLoadedSentenceIndex = [-1, -1];

      // If currently playing, immediately switch to the new voice on the current sentence
      if (this.state === 'playing') {
        this.playbackToken++; // Invalidate pending callbacks

        if (this.audioPlayers[0]) {
          this.audioPlayers[0].pause();
          this.audioPlayers[0].onended = null;
          this.audioPlayers[0].onerror = null;
          this.audioPlayers[0].src = '';
        }
        if (this.audioPlayers[1]) {
          this.audioPlayers[1].pause();
          this.audioPlayers[1].onended = null;
          this.audioPlayers[1].onerror = null;
          this.audioPlayers[1].src = '';
        }
        if (this.synth) {
          if (this.currentUtterance) {
            this.currentUtterance.onend = null;
            this.currentUtterance.onerror = null;
          }
          this.synth.cancel();
        }
        if (this.isNativeVoice()) {
          const androidMedia = (window as any).AndroidMedia;
          if (androidMedia && typeof androidMedia.stopNative === 'function') {
            androidMedia.stopNative();
          }
        }

        // Restart speaking the current sentence with the new voice instantly
        this.speakCurrentSentence();
      }
    }
  }

  public getSettings(): TTSSettings {
    return this.settings;
  }

  public addListener(listener: TTSListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyState(state: TTSState) {
    this.state = state;
    this.listeners.forEach(l => l.onStateChange?.(state));
    this.updateMediaSessionPlaybackState();
    if (state === 'playing') {
      this.updateNativeNotification(true);
    } else if (state === 'paused') {
      this.updateNativeNotification(false);
    } else if (state === 'idle') {
      this.clearNativeNotification();
    }
  }

  private notifySentence(index: number, text: string) {
    this.currentSentenceIndex = index;
    this.listeners.forEach(l => l.onSentenceChange?.(index, text));
  }

  private notifyCountdown(seconds: number | null) {
    this.listeners.forEach(l => l.onTimeRemainingUpdate?.(seconds));
  }

  private clearAudioBlobCache() {
    this.audioBlobCache.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    });
    this.audioBlobCache.clear();
    this.fetchingSentences.clear();
  }

  /**
   * Set chapter text and start or jump
   */
  public loadChapter(
    content: string, 
    metadata: { 
      title: string; 
      author: string; 
      chapterTitle: string; 
      coverUrl?: string;
      storyId?: string;
      chapterNumber?: number;
    },
    startFromSentenceIndex: number = 0
  ) {
    this.stop();
    this.clearAudioBlobCache();

    this.currentBookTitle = metadata.title;
    this.currentAuthor = metadata.author;
    this.currentChapterTitle = metadata.chapterTitle;
    this.currentCoverUrl = metadata.coverUrl || '';
    this.currentStoryId = metadata.storyId || '';
    this.currentChapterNumber = metadata.chapterNumber ?? 0;

    this.sentences = this.splitIntoSentences(content);
    this.currentSentenceIndex = Math.max(0, Math.min(startFromSentenceIndex, Math.max(0, this.sentences.length - 1)));
    this.updateMediaSessionMetadata();
  }

  public play() {
    if (this.sentences.length === 0) return;

    // One-time prompt on Android to request Battery Optimization Exemption so screen-off audio runs indefinitely
    try {
      const androidMedia = (window as any).AndroidMedia;
      if (androidMedia && typeof androidMedia.isBatteryOptimizationIgnored === 'function') {
        const isIgnored = androidMedia.isBatteryOptimizationIgnored();
        if (!isIgnored && !(window as any).__hasPromptedBatteryExemption) {
          (window as any).__hasPromptedBatteryExemption = true;
          setTimeout(() => {
            androidMedia.requestBatteryOptimizationExemption?.();
          }, 1200);
        }
      }
    } catch {}

    if (this.isNativeVoice()) {
      this.stopBackgroundAudioContext();
      this.silentAudio?.pause();
    } else {
      this.startBackgroundAudioContext();
      this.silentAudio?.play().catch(() => {});
    }

    if (this.state === 'paused') {
      if (this.isOnlineVoice() && this.activePlayer && this.activePlayer.src) {
        this.activePlayer.play().catch(() => {});
      } else if (this.isNativeVoice()) {
        const androidMedia = (window as any).AndroidMedia;
        if (androidMedia && typeof androidMedia.resumeNative === 'function') {
          androidMedia.resumeNative();
        } else {
          this.speakCurrentSentence();
        }
      } else if (this.synth) {
        this.synth.resume();
      }
      this.notifyState('playing');
      return;
    }

    this.consecutiveErrors = 0;
    if (ambientAudioService.getType() !== 'off') {
      ambientAudioService.setSound(ambientAudioService.getType());
    }

    if (this.isNativeVoice()) {
      const androidMedia = (window as any).AndroidMedia;
      if (androidMedia && typeof androidMedia.startNativeChapterPlayback === 'function') {
        const processedSentences = this.sentences.map(s => pronunciationService.applyRules(s));
        androidMedia.startNativeChapterPlayback(
          this.currentChapterTitle || 'Đang nghe truyện',
          this.currentBookTitle || 'Chill Reader',
          this.currentAuthor || '',
          this.currentCoverUrl || '',
          JSON.stringify(processedSentences),
          this.currentSentenceIndex,
          this.settings.rate || 1.0,
          this.settings.pitch || 1.0,
          this.settings.voiceURI || ''
        );
        this.notifyState('playing');
        return;
      }
    }

    this.notifyState('playing');
    this.speakCurrentSentence();
  }

  public pause() {
    this.playbackToken++; // Invalidate pending async transitions
    this.stopBackgroundAudioContext();
    if (this.isOnlineVoice()) {
      if (this.audioPlayers[0]) this.audioPlayers[0].pause();
      if (this.audioPlayers[1]) this.audioPlayers[1].pause();
    } else if (this.isNativeVoice()) {
      const androidMedia = (window as any).AndroidMedia;
      if (androidMedia && typeof androidMedia.pauseNative === 'function') {
        androidMedia.pauseNative();
      } else if (androidMedia && typeof androidMedia.stopNative === 'function') {
        androidMedia.stopNative();
      }
    } else if (this.synth) {
      this.synth.pause();
    }
    this.silentAudio?.pause();
    this.notifyState('paused');
  }

  public stop() {
    this.playbackToken++; // Invalidate pending async transitions
    this.playerLoadedSentenceIndex = [-1, -1];
    this.stopBackgroundAudioContext();

    if (ambientAudioService.getType() !== 'off') {
      ambientAudioService.setSound('off');
    }

    if (this.audioPlayers[0]) {
      this.audioPlayers[0].onended = null;
      this.audioPlayers[0].onerror = null;
      this.audioPlayers[0].pause();
      this.audioPlayers[0].src = '';
    }
    if (this.audioPlayers[1]) {
      this.audioPlayers[1].onended = null;
      this.audioPlayers[1].onerror = null;
      this.audioPlayers[1].pause();
      this.audioPlayers[1].src = '';
    }
    if (this.isNativeVoice()) {
      const androidMedia = (window as any).AndroidMedia;
      if (androidMedia && typeof androidMedia.stopNative === 'function') {
        androidMedia.stopNative();
      }
    }
    if (this.synth) {
      if (this.currentUtterance) {
        this.currentUtterance.onend = null;
        this.currentUtterance.onerror = null;
      }
      this.synth.cancel();
    }
    this.silentAudio?.pause();
    this.notifyState('idle');
    this.clearNativeNotification();
  }

  public togglePlayPause() {
    if (this.state === 'playing') {
      this.pause();
    } else {
      this.play();
    }
  }

  public jumpToSentence(index: number) {
    if (index < 0 || index >= this.sentences.length) return;
    const wasPlaying = this.state === 'playing';
    this.playbackToken++;
    this.playerLoadedSentenceIndex = [-1, -1];

    if (this.isNativeVoice()) {
      const androidMedia = (window as any).AndroidMedia;
      if (androidMedia && typeof androidMedia.jumpNativeSentence === 'function') {
        androidMedia.jumpNativeSentence(index);
      }
      this.currentSentenceIndex = index;
      this.notifySentence(index, this.sentences[index]);
      return;
    }

    if (this.audioPlayers[0]) {
      this.audioPlayers[0].pause();
      this.audioPlayers[0].onended = null;
      this.audioPlayers[0].onerror = null;
      this.audioPlayers[0].src = '';
    }
    if (this.audioPlayers[1]) {
      this.audioPlayers[1].pause();
      this.audioPlayers[1].onended = null;
      this.audioPlayers[1].onerror = null;
      this.audioPlayers[1].src = '';
    }

    this.currentSentenceIndex = index;
    if (wasPlaying) {
      this.notifySentence(index, this.sentences[index]);
      this.speakCurrentSentence();
    } else {
      this.notifySentence(index, this.sentences[index]);
    }
  }

  public previousSentence() {
    if (this.currentSentenceIndex > 0) {
      this.jumpToSentence(this.currentSentenceIndex - 1);
    }
  }

  public nextSentence() {
    if (this.currentSentenceIndex < this.sentences.length - 1) {
      this.jumpToSentence(this.currentSentenceIndex + 1);
    } else {
      // Reached the end of the chapter
      this.stop();
      this.listeners.forEach(l => l.onChapterComplete?.());
    }
  }

  private getAudioUrl(sentenceText: string): string {
    const processedText = pronunciationService.applyRules(sentenceText);
    const voice = this.settings.voiceURI || 'edge:vi-VN-NamMinhNeural';
    const isGoogle = voice.startsWith('google');
    const serverRate = isGoogle ? 1.0 : Math.min(2.0, Math.max(0.5, this.settings.rate));
    return `${getTtsApiBase()}/api/tts?voice=${encodeURIComponent(voice)}&rate=${serverRate}&pitch=${this.settings.pitch}&text=${encodeURIComponent(processedText)}`;
  }

  /**
   * Fetch audio blob for a sentence and return its object URL
   */
  private async fetchSentenceBlob(index: number): Promise<string | null> {
    if (index < 0 || index >= this.sentences.length) return null;
    if (this.audioBlobCache.has(index)) return this.audioBlobCache.get(index)!;
    if (this.fetchingSentences.has(index)) return null;

    this.fetchingSentences.add(index);

    // 1. Check offline IndexedDB cache first
    if (this.currentStoryId) {
      try {
        const cachedBlob = await db.getOfflineAudio(this.currentStoryId, this.currentChapterNumber, index);
        if (cachedBlob) {
          const objectUrl = URL.createObjectURL(cachedBlob);
          this.audioBlobCache.set(index, objectUrl);
          this.fetchingSentences.delete(index);
          return objectUrl;
        }
      } catch (e) {
        console.warn('Error reading offline audio cache:', e);
      }
    }

    const text = this.sentences[index];
    const url = this.getAudioUrl(text);

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();

      // Save to offline cache asynchronously
      if (this.currentStoryId) {
        db.saveOfflineAudio(this.currentStoryId, this.currentChapterNumber, index, blob).catch(() => {});
      }

      const objectUrl = URL.createObjectURL(blob);
      this.audioBlobCache.set(index, objectUrl);
      return objectUrl;
    } catch {
      return null;
    } finally {
      this.fetchingSentences.delete(index);
    }
  }

  /**
   * Pre-download all audio sentences for the current chapter into Dexie offline cache
   */
  public async downloadChapterAudio(
    storyId: string,
    chapterNumber: number,
    onProgress?: (done: number, total: number) => void
  ): Promise<{ success: boolean; total: number; downloaded: number }> {
    if (this.sentences.length === 0) {
      return { success: false, total: 0, downloaded: 0 };
    }

    const total = this.sentences.length;
    let downloaded = 0;

    for (let i = 0; i < total; i++) {
      try {
        const existing = await db.getOfflineAudio(storyId, chapterNumber, i);
        if (existing) {
          downloaded++;
          onProgress?.(downloaded, total);
          continue;
        }

        const text = this.sentences[i];
        const url = this.getAudioUrl(text);
        const res = await fetch(url);
        if (res.ok) {
          const blob = await res.blob();
          await db.saveOfflineAudio(storyId, chapterNumber, i, blob);
        }
      } catch (e) {
        console.warn(`Failed to cache sentence ${i}:`, e);
      }
      downloaded++;
      onProgress?.(downloaded, total);
    }

    return { success: true, total, downloaded };
  }

  /**
   * Prefetch audio blob in the background
   */
  private prefetchSentenceAudio(index: number) {
    if (index < 0 || index >= this.sentences.length) return;
    if (this.audioBlobCache.has(index) || this.fetchingSentences.has(index)) return;
    this.fetchSentenceBlob(index);
  }

  /**
   * Pre-load the next sentence into the secondary audio player for instant gapless handover
   */
  private prepareNextSentenceAudio(nextIdx: number, currentToken: number) {
    if (nextIdx >= this.sentences.length) return;

    const nextP = this.nextPlayer;
    const nextIdxP = this.activePlayerIndex === 0 ? 1 : 0;

    const setupNext = (blobOrUrl: string) => {
      if (currentToken !== this.playbackToken || this.state !== 'playing') return;
      if (this.playerLoadedSentenceIndex[nextIdxP] === nextIdx) {
        this.applyPlaybackRate(nextP);
        return;
      }

      nextP.onended = null;
      nextP.onerror = null;
      nextP.src = blobOrUrl;
      nextP.preload = 'auto';
      this.applyPlaybackRate(nextP);
      this.playerLoadedSentenceIndex[nextIdxP] = nextIdx;
      nextP.load();
    };

    if (this.audioBlobCache.has(nextIdx)) {
      setupNext(this.audioBlobCache.get(nextIdx)!);
    } else {
      this.fetchSentenceBlob(nextIdx).then((blobUrl) => {
        if (blobUrl) {
          setupNext(blobUrl);
        } else {
          // Fallback to direct URL preloading
          setupNext(this.getAudioUrl(this.sentences[nextIdx]));
        }
      });
    }
  }

  private speakCurrentSentence() {
    if (this.state !== 'playing') return;

    // Check if we reached the end of the chapter
    if (this.currentSentenceIndex >= this.sentences.length) {
      this.stop();
      this.clearAudioBlobCache();
      this.listeners.forEach(l => l.onChapterComplete?.());
      return;
    }

    const currentToken = ++this.playbackToken;
    const sentenceIdx = this.currentSentenceIndex;
    const sentence = this.sentences[sentenceIdx];
    this.notifySentence(sentenceIdx, sentence);
    this.updateNativeNotification(true);

    // 1. Online AI Neural / Google TTS playback with gapless double buffering
    if (this.isOnlineVoice()) {
      if (this.synth) {
        if (this.currentUtterance) {
          this.currentUtterance.onend = null;
          this.currentUtterance.onerror = null;
        }
        this.synth.cancel();
      }

      const player = this.activePlayer;
      const activeIdx = this.activePlayerIndex;
      player.onended = null;
      player.onerror = null;

      // Handle when audio finishes playing: immediate gapless switch to next player
      player.onended = () => {
        if (currentToken !== this.playbackToken || this.state !== 'playing') return;
        this.consecutiveErrors = 0;
        this.activePlayerIndex = this.activePlayerIndex === 0 ? 1 : 0;
        this.currentSentenceIndex++;
        this.speakCurrentSentence();
      };

      // Handle playback error: retry sentence once, never skip aggressively
      player.onerror = (e) => {
        if (currentToken !== this.playbackToken || this.state !== 'playing') return;
        console.warn('Audio player error on sentence:', sentenceIdx, e);

        // If offline or network stalled, and native Android TTS is ready, automatically fallback to Native TTS
        if ((!navigator.onLine || this.consecutiveErrors >= 2) && (window as any).AndroidMedia?.isNativeTtsReady?.()) {
          console.log('Network stall or device offline: seamlessly reading via Native Android TTS');
          this.playNativeAndroidTTS(sentence, currentToken);
          return;
        }

        // Retry the exact same sentence once after 500ms
        if (this.consecutiveErrors === 0) {
          this.consecutiveErrors++;
          setTimeout(() => {
            if (currentToken === this.playbackToken && this.state === 'playing') {
              this.playerLoadedSentenceIndex[activeIdx] = -1;
              this.speakCurrentSentence();
            }
          }, 500);
          return;
        }

        // If it still fails, advance cleanly to next sentence
        this.consecutiveErrors = 0;
        this.activePlayerIndex = this.activePlayerIndex === 0 ? 1 : 0;
        this.currentSentenceIndex++;
        this.speakCurrentSentence();
      };

      // Check if current player already has this exact sentence loaded
      if (this.playerLoadedSentenceIndex[activeIdx] !== sentenceIdx) {
        const cachedBlob = this.audioBlobCache.get(sentenceIdx);
        if (cachedBlob) {
          player.src = cachedBlob;
        } else {
          player.src = this.getAudioUrl(sentence);
        }
        this.playerLoadedSentenceIndex[activeIdx] = sentenceIdx;
      }

      // Always guarantee correct effective playbackRate is applied before play()
      this.applyPlaybackRate(player);

      // Safe play without triggering cascading errors on standard AbortError
      const playPromise = player.play();
      if (playPromise) {
        playPromise.catch(err => {
          if (currentToken !== this.playbackToken || this.state !== 'playing') return;
          // AbortError is normal when stopping or seeking; do not advance sentence!
          if (err.name === 'AbortError') return;
          console.warn('Audio play rejection:', err);
        });
      }

      // Prepare next player and prefetch upcoming window (3 sentences ahead)
      this.prepareNextSentenceAudio(sentenceIdx + 1, currentToken);
      this.prefetchSentenceAudio(sentenceIdx + 2);
      this.prefetchSentenceAudio(sentenceIdx + 3);

      // Clean up older blobs to keep memory lean
      for (const key of this.audioBlobCache.keys()) {
        if (key < sentenceIdx - 2 || key > sentenceIdx + 6) {
          try {
            URL.revokeObjectURL(this.audioBlobCache.get(key)!);
          } catch {}
          this.audioBlobCache.delete(key);
        }
      }

      return;
    }

    // 2. Native Android Offline Speech Synthesis (direct android.speech.tts.TextToSpeech)
    if (this.isNativeVoice()) {
      this.playNativeAndroidTTS(sentence, currentToken);
      return;
    }

    // 3. Local Browser Offline Speech Synthesis
    this.playBrowserTTS(sentence, currentToken);
  }

  private playNativeAndroidTTS(sentence: string, currentToken: number) {
    const androidMedia = (window as any).AndroidMedia;
    if (androidMedia && typeof androidMedia.startNativeChapterPlayback === 'function') {
      const processedSentences = this.sentences.map(s => pronunciationService.applyRules(s));
      androidMedia.startNativeChapterPlayback(
        this.currentChapterTitle || 'Đang nghe truyện',
        this.currentBookTitle || 'Chill Reader',
        this.currentAuthor || '',
        this.currentCoverUrl || '',
        JSON.stringify(processedSentences),
        this.currentSentenceIndex,
        this.settings.rate || 1.0,
        this.settings.pitch || 1.0,
        this.settings.voiceURI || ''
      );
      return;
    }
    if (androidMedia && typeof androidMedia.speakNative === 'function') {
      const processedText = pronunciationService.applyRules(sentence);
      const utteranceId = `utt_${currentToken}_${this.currentSentenceIndex}`;
      androidMedia.speakNative(
        processedText,
        this.settings.rate || 1.0,
        this.settings.pitch || 1.0,
        utteranceId
      );
    } else {
      // Fallback to browser TTS if native bridge isn't connected
      this.playBrowserTTS(sentence, currentToken);
    }
  }

  public onNativeUtteranceStart(_utteranceId: string) {
    // Hook for native speech start
  }

  public onNativeUtteranceDone(utteranceId: string) {
    if (this.state !== 'playing' || !this.isNativeVoice()) return;
    const parts = utteranceId.split('_');
    const token = parseInt(parts[1], 10);
    if (!isNaN(token) && token !== this.playbackToken) return;

    this.consecutiveErrors = 0;
    this.currentSentenceIndex++;
    this.speakCurrentSentence();
  }

  public onNativeUtteranceError(utteranceId: string) {
    if (this.state !== 'playing' || !this.isNativeVoice()) return;
    const parts = utteranceId.split('_');
    const token = parseInt(parts[1], 10);
    if (!isNaN(token) && token !== this.playbackToken) return;

    console.warn('Native TTS error on utterance:', utteranceId);
    this.currentSentenceIndex++;
    this.speakCurrentSentence();
  }

  public onNativeSentenceIndex(index: number) {
    if (index >= 0 && index < this.sentences.length) {
      this.currentSentenceIndex = index;
      this.notifySentence(index, this.sentences[index]);
    }
  }

  public onNativeChapterComplete() {
    this.stop();
    this.listeners.forEach(l => l.onChapterComplete?.());
  }

  public onNativeStateChange(state: TTSState) {
    if (this.state !== state) {
      this.state = state;
      this.listeners.forEach(l => l.onStateChange?.(state));
      this.updateMediaSessionPlaybackState();
    }
  }

  public syncNativePlaybackIndex() {
    if (this.isNativeVoice() && this.state === 'playing') {
      const androidMedia = (window as any).AndroidMedia;
      if (androidMedia && typeof androidMedia.getNativePlaybackIndex === 'function') {
        const idx = androidMedia.getNativePlaybackIndex();
        if (typeof idx === 'number' && idx >= 0 && idx < this.sentences.length) {
          this.currentSentenceIndex = idx;
          this.notifySentence(idx, this.sentences[idx]);
        }
      }
    }
  }

  private playBrowserTTS(sentence: string, currentToken: number) {
    if (!this.synth) return;

    if (this.currentUtterance) {
      this.currentUtterance.onend = null;
      this.currentUtterance.onerror = null;
    }
    this.synth.cancel();

    const processedText = pronunciationService.applyRules(sentence);
    const utterance = new SpeechSynthesisUtterance(processedText);
    this.currentUtterance = utterance;
    utterance.rate = this.settings.rate;
    utterance.pitch = this.settings.pitch;

    const voices = this.getVoices();
    if (this.settings.voiceURI) {
      const selectedVoice = voices.find(v => v.voiceURI === this.settings.voiceURI);
      if (selectedVoice) utterance.voice = selectedVoice;
    } else {
      const viVoice = this.getVietnameseVoices()[0];
      if (viVoice) utterance.voice = viVoice;
    }

    utterance.onend = () => {
      if (currentToken !== this.playbackToken || this.state !== 'playing') return;
      this.consecutiveErrors = 0;
      this.currentSentenceIndex++;
      this.speakCurrentSentence();
    };

    utterance.onerror = (e) => {
      if (currentToken !== this.playbackToken || this.state !== 'playing') return;
      if (e.error === 'canceled' || e.error === 'interrupted') return;
      console.warn('SpeechSynthesis error:', e);
      this.currentSentenceIndex++;
      this.speakCurrentSentence();
    };

    this.synth.speak(utterance);
  }

  /**
   * Smart clause-aware sentence segmentation:
   * 1. Breaks text by sentence punctuation (. ! ? …).
   * 2. If a sentence is long (> 140 chars), breaks at natural clause pauses (commas, semicolons).
   * 3. Merges tiny fragments (< 25 chars, quotes, dialogue markers) with subsequent clauses.
   * Ensures every audio segment is 40–140 chars (~8–25 words): fast to synthesize, never fails Google TTS limits,
   * highlights cleanly on screen, and switches voices instantly without long paragraph replays.
   */
  public splitIntoSentences(text: string): string[] {
    if (!text) return [];
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rawParagraphs = normalized.split(/\n+/);
    const result: string[] = [];

    for (const para of rawParagraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;

      // Initial split by full stop, exclamation, question mark, ellipsis
      const rawMatches = trimmed.match(/[^.!?…\n]+(?:[.!?…]+|(?=$))/g) || [trimmed];

      for (const raw of rawMatches) {
        const s = raw.trim();
        if (!s || !/[a-zA-Z0-9\u00C0-\u1EF9]/.test(s)) continue;

        // If a sentence is long (> 140 chars), break at natural pause points (commas, semicolons, dashes)
        if (s.length > 140) {
          const clauses = s.match(/[^,;—–]+(?:[,;—–]+|(?=$))/g) || [s];
          let currentChunk = '';

          for (const clause of clauses) {
            const c = clause.trim();
            if (!c) continue;

            if (!currentChunk) {
              currentChunk = c;
            } else if (currentChunk.length + c.length + 1 <= 140) {
              currentChunk = currentChunk + ' ' + c;
            } else {
              result.push(currentChunk);
              currentChunk = c;
            }
          }
          if (currentChunk) {
            result.push(currentChunk);
          }
        } else {
          result.push(s);
        }
      }
    }

    // Post-process: merge tiny fragments (< 25 chars or ending in dialogue punctuation) with next clause
    const finalResult: string[] = [];
    for (let i = 0; i < result.length; i++) {
      let cur = result[i];
      while (
        i + 1 < result.length &&
        (cur.length < 25 || /[:;、“"'\-–—]$/.test(cur) || /^[a-z\u00E0-\u1EF9]/.test(result[i + 1])) &&
        (cur.length + result[i + 1].length + 1 <= 140)
      ) {
        cur = cur + ' ' + result[i + 1];
        i++;
      }
      finalResult.push(cur);
    }

    return finalResult.length > 0 ? finalResult : [text.trim()].filter(Boolean);
  }

  /**
   * Sleep Timer Management
   */
  public setSleepTimer(minutes: number | null) {
    if (this.sleepTimerId) {
      window.clearTimeout(this.sleepTimerId);
      this.sleepTimerId = null;
    }
    if (this.sleepCountdownInterval) {
      window.clearInterval(this.sleepCountdownInterval);
      this.sleepCountdownInterval = null;
    }

    if (!minutes || minutes <= 0) {
      this.sleepTimerSeconds = null;
      this.notifyCountdown(null);
      if (this.shakeCleanup) {
        this.shakeCleanup();
        this.shakeCleanup = null;
      }
      return;
    }

    this.sleepTimerSeconds = minutes * 60;
    this.notifyCountdown(this.sleepTimerSeconds);

    // Auto-extend sleep timer by 15 mins when user shakes the phone
    if (!this.shakeCleanup) {
      this.shakeCleanup = shakeDetector.addListener(() => {
        if (this.sleepTimerSeconds !== null && this.sleepTimerSeconds > 0) {
          this.extendSleepTimer(15);
        }
      });
    }

    this.sleepCountdownInterval = window.setInterval(() => {
      if (this.sleepTimerSeconds !== null && this.sleepTimerSeconds > 0) {
        this.sleepTimerSeconds--;
        this.notifyCountdown(this.sleepTimerSeconds);
      }
    }, 1000);

    this.sleepTimerId = window.setTimeout(() => {
      this.pause();
      this.setSleepTimer(null);
    }, minutes * 60 * 1000);
  }

  public extendSleepTimer(extraMinutes: number = 15) {
    if (this.sleepTimerSeconds === null) return;
    const newSeconds = this.sleepTimerSeconds + extraMinutes * 60;
    this.sleepTimerSeconds = newSeconds;
    this.notifyCountdown(newSeconds);

    if (this.sleepTimerId) {
      window.clearTimeout(this.sleepTimerId);
    }
    this.sleepTimerId = window.setTimeout(() => {
      this.pause();
      this.setSleepTimer(null);
    }, newSeconds * 1000);
  }

  /**
   * Native Android Media Notification Integration
   * Communicates with MainActivity.java via JavascriptInterface 'AndroidMedia'
   */
  private updateNativeNotification(isPlaying: boolean) {
    if (this.isNativeVoice()) return;
    if (this.state === 'idle' && !isPlaying) return;
    try {
      const androidMedia = (window as any).AndroidMedia;
      if (androidMedia && typeof androidMedia.updateMedia === 'function') {
        androidMedia.updateMedia(
          this.currentChapterTitle || 'Đang nghe truyện',
          this.currentBookTitle || 'Chill Reader',
          this.currentAuthor || '',
          isPlaying,
          this.currentCoverUrl || '',
          Math.floor(this.currentSentenceIndex || 0),
          Math.floor(this.sentences.length || 0)
        );
      }
    } catch (e) {
      console.warn('Native AndroidMedia update error:', e);
    }
  }

  private clearNativeNotification() {
    try {
      const androidMedia = (window as any).AndroidMedia;
      if (androidMedia && typeof androidMedia.clearMedia === 'function') {
        androidMedia.clearMedia();
      }
    } catch (e) {
      console.warn('Native AndroidMedia clear error:', e);
    }
  }

  public syncPlayAlongOtherApps(enable: boolean) {
    try {
      const androidMedia = (window as any).AndroidMedia;
      if (androidMedia && typeof androidMedia.setPlayAlongOtherApps === 'function') {
        androidMedia.setPlayAlongOtherApps(enable);
      }
    } catch (e) {
      console.warn('Failed to sync playAlongOtherApps to AndroidMedia:', e);
    }
  }

  /**
   * MediaSession API for Headphone / Bluetooth and Web lockscreen controls
   */
  private updateMediaSessionMetadata() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: this.currentChapterTitle || 'Đang nghe truyện',
        artist: this.currentAuthor || 'Chill Reader',
        album: this.currentBookTitle || 'Thư viện truyện',
        artwork: this.currentCoverUrl ? [{ src: this.currentCoverUrl, sizes: '512x512', type: 'image/jpeg' }] : []
      });

      navigator.mediaSession.setActionHandler('play', () => this.play());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('stop', () => this.stop());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.previousSentence());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.nextSentence());
      navigator.mediaSession.setActionHandler('seekbackward', () => this.previousSentence());
      navigator.mediaSession.setActionHandler('seekforward', () => this.nextSentence());
    } catch (e) {
      console.warn('MediaSession metadata error:', e);
    }
  }

  private updateMediaSessionPlaybackState() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = this.state === 'playing' ? 'playing' : (this.state === 'paused' ? 'paused' : 'none');
    } catch {
      // ignore
    }
  }

  public getState(): TTSState {
    return this.state;
  }

  public getCurrentSentenceIndex(): number {
    return this.currentSentenceIndex;
  }

  public getTotalSentences(): number {
    return this.sentences.length;
  }

  public getSentences(): string[] {
    return this.sentences;
  }
}

export const ttsEngine = new TTSEngine();

if (typeof window !== 'undefined') {
  (window as any).ttsEngine = ttsEngine;
}
