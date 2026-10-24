import type { TTSSettings, TTSEngineType, Chapter } from '../../types';
import { getApiBase } from '../apiConfig';
import { db } from '../db';
import { pronunciationService } from './pronunciation';
import { shakeDetector } from './shakeDetector';
import { ambientAudioService } from './ambientAudio';
import { analyzeSentenceRole } from './dialogueDetector';

export type TTSState = 'idle' | 'playing' | 'paused';

export interface TTSListener {
  onStateChange?: (state: TTSState) => void;
  onSentenceChange?: (sentenceIndex: number, sentenceText: string) => void;
  onChapterChange?: (chapterNumber: number, chapterTitle: string) => void;
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

export const CURATED_VOICES: VoiceOption[] = [];

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
  private lastPauseTimestamp = 0;

  // Metadata for Native Notification & MediaSession
  private currentBookTitle = '';
  private currentAuthor = '';
  private currentChapterTitle = '';
  private currentCoverUrl = '';
  private currentStoryId = '';
  private currentChapterNumber = 0;
  private shakeCleanup: (() => void) | null = null;

  private settings: TTSSettings = {
    voiceURI: 'native:android',
    engine: 'native',
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
        const initVoices = () => {
          this.getVietnameseVoices();
        };
        if (this.synth) {
          this.synth.onvoiceschanged = initVoices;
        }
        window.speechSynthesis.addEventListener?.('voiceschanged', initVoices);
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
    if (!v) return false;
    const lower = v.toLowerCase().trim();
    return lower.startsWith('edge:') || lower.startsWith('google:');
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
    // Sort Google voices to the top so that Chrome's "Google tiếng Việt" (exact Android TTS voice) is prioritized
    vi.sort((a, b) => {
      const aG = a.name.toLowerCase().includes('google') || a.voiceURI.toLowerCase().includes('google');
      const bG = b.name.toLowerCase().includes('google') || b.voiceURI.toLowerCase().includes('google');
      if (aG && !bG) return -1;
      if (!aG && bG) return 1;
      return 0;
    });
    return vi;
  }

  public getBrowserVietnameseVoice(preferredVoiceURI?: string): SpeechSynthesisVoice | undefined {
    const voices = this.getVoices();
    if (!voices || voices.length === 0) return undefined;

    const viVoices = this.getVietnameseVoices();

    // 1. If preferredVoiceURI is specified and not the generic 'native:android'
    if (preferredVoiceURI && preferredVoiceURI !== 'native:android') {
      const rawURI = preferredVoiceURI.startsWith('native:') ? preferredVoiceURI.substring(7) : preferredVoiceURI;
      const exact = voices.find(v => 
        v.voiceURI === preferredVoiceURI || 
        v.voiceURI === rawURI || 
        v.name === preferredVoiceURI || 
        v.name === rawURI
      );
      if (exact) return exact;
    }

    // 2. Look for Google Vietnamese voice first (identically matching Android's default Google TTS)
    const googleVi = viVoices.find(v => 
      v.name.toLowerCase().includes('google') || 
      v.voiceURI.toLowerCase().includes('google')
    );
    if (googleVi) return googleVi;

    // 3. Fallback to any available Vietnamese voice in browser
    if (viVoices.length > 0) {
      return viVoices[0];
    }

    return undefined;
  }

  public getAllAvailableVoices(): VoiceOption[] {
    const list: VoiceOption[] = [];

    const isNativeAndroidApp = typeof window !== 'undefined' && Boolean((window as any).AndroidMedia);

    list.push({
      id: 'native:android',
      name: isNativeAndroidApp 
        ? 'Giọng đọc Máy Android (100% Offline Mặc định)'
        : 'Google Tiếng Việt (Giọng chuẩn máy Android)',
      category: 'native',
      gender: 'neutral',
      badge: isNativeAndroidApp ? '100% Offline · Không mạng' : 'Chuẩn giọng Android · Chrome/Web',
      description: isNativeAndroidApp
        ? 'Giọng đọc ngoại tuyến có sẵn trên điện thoại, đọc mượt mà không cần mạng Internet'
        : 'Giọng đọc Google chuẩn giống hệt trên điện thoại Android, chạy tối ưu trên Chrome/Web',
      isOnline: false
    });

    const isAndroid = typeof window !== 'undefined' && (
      Boolean((window as any).AndroidMedia) || 
      /android/i.test(navigator.userAgent)
    );

    if (isAndroid) {
      const androidMedia = (window as any).AndroidMedia;
      if (androidMedia && typeof androidMedia.getNativeVoicesJson === 'function') {
        try {
          const raw = androidMedia.getNativeVoicesJson();
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            parsed.forEach((nv: any, idx: number) => {
              const lower = (nv.name || '').toLowerCase();
              const isMale = lower.includes('vic') || lower.includes('male') || lower.includes('nam') || lower.includes('vid');
              const isOffline = !nv.requiresNetwork;
              if (isOffline) {
                list.push({
                  id: nv.id || `native:${nv.name}`,
                  name: `Giọng máy ${isMale ? 'Nam' : 'Nữ'} #${idx + 1} (${nv.name})`,
                  category: 'native',
                  gender: isMale ? 'male' : 'female',
                  badge: '100% Offline · Máy',
                  description: `Gói giọng đọc Tiếng Việt offline trên máy (${nv.name})`,
                  isOnline: false
                });
              }
            });
          }
        } catch (e) {
          console.warn('Failed to parse native voices JSON:', e);
        }
      }
    }

    const browserVoices = this.getVietnameseVoices();
    browserVoices.forEach(bv => {
      const rawId = bv.voiceURI || bv.name;
      const voiceId = rawId.startsWith('native:') ? rawId : `native:${rawId}`;
      if (list.some(item => item.id === voiceId || item.id === rawId)) return;
      const lower = bv.name.toLowerCase();
      const isMale = lower.includes('male') || lower.includes('nam') || lower.includes('an');
      const isGoogle = lower.includes('google');
      list.push({
        id: voiceId,
        name: isGoogle ? `Google Tiếng Việt (${bv.name})` : bv.name,
        category: 'browser',
        gender: isMale ? 'male' : 'female',
        badge: isGoogle ? 'Chuẩn Android · Trình duyệt' : 'Offline · Thiết bị',
        description: `Giọng đọc có sẵn trên máy (${bv.lang})`,
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
    } else {
      const androidMedia = (window as any).AndroidMedia;
      if (androidMedia && typeof androidMedia.speakNative === 'function') {
        androidMedia.speakNative(sampleText, this.settings.rate || 1.0, this.settings.pitch || 1.0, 'test_sample');
      } else {
        const browserVoice = this.getBrowserVietnameseVoice(voiceURI);
        if (browserVoice && this.synth) {
          const utterance = new SpeechSynthesisUtterance(sampleText);
          this.currentUtterance = utterance;
          utterance.voice = browserVoice;
          utterance.lang = browserVoice.lang || 'vi-VN';
          utterance.rate = this.settings.rate;
          utterance.pitch = this.settings.pitch;
          if (this.synth.paused) {
            this.synth.resume();
          }
          this.synth.speak(utterance);
        } else {
          // If no local Vietnamese voice installed, fallback to Google Vietnamese TTS audio
          const url = `${getTtsApiBase()}/api/tts?voice=google:vi&rate=1.0&pitch=${this.settings.pitch}&text=${encodeURIComponent(sampleText)}`;
          this.testAudio = new Audio(url);
          await this.testAudio.play().catch(() => {});
        }
      }
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
    if (!this.settings.voiceURI || this.settings.voiceURI.startsWith('edge:') || this.settings.voiceURI.startsWith('google:')) {
      this.settings.voiceURI = 'native:android';
      this.settings.engine = 'native';
    }

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

        if (this.isNativeVoice()) {
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
    startFromSentenceIndex: number = 0,
    keepPlaying: boolean = false
  ) {
    const wasPlaying = keepPlaying || this.state === 'playing';
    this.playbackToken++;
    this.playerLoadedSentenceIndex = [-1, -1];
    this.clearAudioBlobCache();

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
    if (this.synth) {
      if (this.currentUtterance) {
        this.currentUtterance.onend = null;
        this.currentUtterance.onerror = null;
      }
      this.synth.cancel();
    }

    if (!wasPlaying) {
      const androidMedia = (window as any).AndroidMedia;
      if (androidMedia && typeof androidMedia.stopNative === 'function') {
        androidMedia.stopNative();
      }
      this.notifyState('idle');
      this.clearNativeNotification();
    }

    this.currentBookTitle = metadata.title;
    this.currentAuthor = metadata.author;
    this.currentChapterTitle = metadata.chapterTitle;
    this.currentCoverUrl = metadata.coverUrl || '';
    this.currentStoryId = metadata.storyId || '';
    this.currentChapterNumber = metadata.chapterNumber ?? 0;

    this.sentences = this.splitIntoSentences(content);
    this.currentSentenceIndex = Math.max(0, Math.min(startFromSentenceIndex, Math.max(0, this.sentences.length - 1)));
    this.updateMediaSessionMetadata();
    if (this.currentStoryId && this.currentChapterNumber) {
      this.preloadOfflineAudioForChapter(this.currentStoryId, this.currentChapterNumber).catch(() => {});
    }
    this.listeners.forEach(l => l.onChapterChange?.(this.currentChapterNumber, this.currentChapterTitle));
  }

  public play() {
    if (this.sentences.length === 0) return;
    if (this.sleepTimerSeconds === null || this.sleepTimerSeconds > 30) {
      this.setAudioVolume(1.0);
    }

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

    const androidMedia = (window as any).AndroidMedia;
    const hasNativeBridge = Boolean(androidMedia && typeof androidMedia.startNativeChapterPlayback === 'function');

    if (hasNativeBridge || this.isNativeVoice()) {
      this.stopBackgroundAudioContext();
      this.silentAudio?.pause();
    } else {
      this.startBackgroundAudioContext();
      this.silentAudio?.play().catch(() => {});
    }

    if (this.state === 'paused') {
      const now = Date.now();
      // Smart resume rewind: if paused for >= 20 seconds, rewind 1 sentence to restore context
      if (this.lastPauseTimestamp > 0 && now - this.lastPauseTimestamp >= 20000) {
        if (this.currentSentenceIndex > 0) {
          this.currentSentenceIndex = Math.max(0, this.currentSentenceIndex - 1);
          if (hasNativeBridge && typeof androidMedia.jumpNativeSentence === 'function') {
            androidMedia.jumpNativeSentence(this.currentSentenceIndex);
          }
        }
      }
      this.lastPauseTimestamp = 0;

      if (hasNativeBridge && typeof androidMedia.resumeNative === 'function') {
        androidMedia.resumeNative();
      } else if (this.isOnlineVoice() && this.activePlayer && this.activePlayer.src) {
        this.activePlayer.play().catch(() => {});
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

    if (hasNativeBridge) {
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

    this.notifyState('playing');
    this.speakCurrentSentence();
  }

  public pause() {
    this.playbackToken++; // Invalidate pending async transitions
    this.lastPauseTimestamp = Date.now();
    this.stopBackgroundAudioContext();
    const androidMedia = (window as any).AndroidMedia;
    if (androidMedia && typeof androidMedia.pauseNative === 'function') {
      androidMedia.pauseNative();
    } else if (this.isOnlineVoice()) {
      if (this.audioPlayers[0]) this.audioPlayers[0].pause();
      if (this.audioPlayers[1]) this.audioPlayers[1].pause();
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

    const androidMedia = (window as any).AndroidMedia;
    if (androidMedia && typeof androidMedia.stopNative === 'function') {
      androidMedia.stopNative();
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

    const androidMedia = (window as any).AndroidMedia;
    if (androidMedia && typeof androidMedia.jumpNativeSentence === 'function') {
      androidMedia.jumpNativeSentence(index);
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

  public async nextSentence() {
    if (this.currentSentenceIndex < this.sentences.length - 1) {
      this.jumpToSentence(this.currentSentenceIndex + 1);
    } else {
      // Reached the end of the chapter
      if (this.settings.autoNextChapter !== false) {
        const advanced = await this.advanceToNextChapter();
        if (advanced) {
          return;
        }
      }
      this.stop();
      this.listeners.forEach(l => l.onChapterComplete?.());
    }
  }

  private getAudioUrl(sentenceText: string, index?: number): string {
    const processedText = pronunciationService.applyRules(sentenceText);
    let voice = this.settings.voiceURI || 'native:android';
    if (voice === 'native:android' || voice.startsWith('native:')) {
      voice = 'google:vi';
    }

    // Multi-Voice AI Drama: Dialogue character voice detection
    if (this.settings.multiVoiceDrama) {
      const prevSentence = (typeof index === 'number' && index > 0) ? this.sentences[index - 1] : undefined;
      const roleAnalysis = analyzeSentenceRole(sentenceText, prevSentence);
      if (roleAnalysis.isDialogue) {
        if (roleAnalysis.role === 'female') {
          voice = this.settings.femaleVoiceURI || 'edge:vi-VN-HoaiMyNeural';
        } else {
          voice = this.settings.maleVoiceURI || 'native:android';
        }
      }
    }

    const isGoogle = voice.startsWith('google');
    const serverRate = isGoogle ? 1.0 : Math.min(2.0, Math.max(0.5, this.settings.rate));
    return `${getTtsApiBase()}/api/tts?voice=${encodeURIComponent(voice)}&rate=${serverRate}&pitch=${this.settings.pitch}&text=${encodeURIComponent(processedText)}`;
  }

  public bridgeBlobToNativeDisk(voice: string, rate: number, pitch: number, text: string, blob: Blob) {
    try {
      const androidMedia = (window as any).AndroidMedia;
      if (!androidMedia || typeof androidMedia.saveCachedSentenceAudio !== 'function') return;
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = (reader.result as string)?.split(',')[1];
        if (base64data) {
          androidMedia.saveCachedSentenceAudio(voice, rate, pitch, text, base64data);
        }
      };
      reader.readAsDataURL(blob);
    } catch {}
  }

  /**
   * Preload all offline audio records for a chapter into in-memory Blob URL cache
   */
  public async preloadOfflineAudioForChapter(storyId: string, chapterNumber: number): Promise<void> {
    try {
      const records = await db.offlineAudioCache
        .where('storyId')
        .equals(storyId)
        .and(r => r.chapterNumber === chapterNumber)
        .toArray();

      for (const rec of records) {
        if (!this.audioBlobCache.has(rec.sentenceIndex)) {
          this.audioBlobCache.set(rec.sentenceIndex, URL.createObjectURL(rec.audioBlob));
        }
        if (this.sentences[rec.sentenceIndex]) {
          const rawText = this.sentences[rec.sentenceIndex];
          const processedText = pronunciationService.applyRules(rawText);
          this.bridgeBlobToNativeDisk(
            this.settings.voiceURI || 'native:android',
            this.settings.rate || 1.0,
            this.settings.pitch || 1.0,
            rawText,
            rec.audioBlob
          );
          if (processedText !== rawText) {
            this.bridgeBlobToNativeDisk(
              this.settings.voiceURI || 'native:android',
              this.settings.rate || 1.0,
              this.settings.pitch || 1.0,
              processedText,
              rec.audioBlob
            );
          }
        }
      }
    } catch (e) {
      console.warn('Failed to preload offline chapter audio:', e);
    }
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
    const url = this.getAudioUrl(text, index);

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();

      // Save to offline cache asynchronously
      if (this.currentStoryId) {
        db.saveOfflineAudio(this.currentStoryId, this.currentChapterNumber, index, blob).catch(() => {});
        const processedText = pronunciationService.applyRules(text);
        this.bridgeBlobToNativeDisk(
          this.settings.voiceURI || 'native:android',
          this.settings.rate || 1.0,
          this.settings.pitch || 1.0,
          text,
          blob
        );
        if (processedText !== text) {
          this.bridgeBlobToNativeDisk(
            this.settings.voiceURI || 'native:android',
            this.settings.rate || 1.0,
            this.settings.pitch || 1.0,
            processedText,
            blob
          );
        }
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
    onProgress?: (done: number, total: number) => void,
    customSentences?: string[],
    signal?: AbortSignal
  ): Promise<{ success: boolean; total: number; downloaded: number }> {
    const list = customSentences || this.sentences;
    if (list.length === 0) {
      return { success: false, total: 0, downloaded: 0 };
    }

    const total = list.length;
    let downloaded = 0;

    for (let i = 0; i < total; i++) {
      if (signal?.aborted) {
        return { success: false, total, downloaded };
      }
      try {
        const existing = await db.getOfflineAudio(storyId, chapterNumber, i);
        if (existing) {
          downloaded++;
          onProgress?.(downloaded, total);
          const rawText = list[i];
          const processedText = pronunciationService.applyRules(rawText);
          this.bridgeBlobToNativeDisk(
            this.settings.voiceURI || 'native:android',
            this.settings.rate || 1.0,
            this.settings.pitch || 1.0,
            rawText,
            existing
          );
          if (processedText !== rawText) {
            this.bridgeBlobToNativeDisk(
              this.settings.voiceURI || 'native:android',
              this.settings.rate || 1.0,
              this.settings.pitch || 1.0,
              processedText,
              existing
            );
          }
          continue;
        }

        const text = list[i];
        const url = this.getAudioUrl(text, i);
        const res = await fetch(url, { signal });
        if (res.ok) {
          const blob = await res.blob();
          await db.saveOfflineAudio(storyId, chapterNumber, i, blob);
          const rawText = text;
          const processedText = pronunciationService.applyRules(rawText);
          this.bridgeBlobToNativeDisk(
            this.settings.voiceURI || 'native:android',
            this.settings.rate || 1.0,
            this.settings.pitch || 1.0,
            rawText,
            blob
          );
          if (processedText !== rawText) {
            this.bridgeBlobToNativeDisk(
              this.settings.voiceURI || 'native:android',
              this.settings.rate || 1.0,
              this.settings.pitch || 1.0,
              processedText,
              blob
            );
          }
        }
      } catch (e: any) {
        if (signal?.aborted || e?.name === 'AbortError') {
          return { success: false, total, downloaded };
        }
        console.warn(`Failed to cache sentence ${i}:`, e);
      }
      downloaded++;
      onProgress?.(downloaded, total);
    }

    return { success: true, total, downloaded };
  }

  /**
   * Pre-download audio for a batch of multiple chapters
   */
  public async downloadChaptersBatch(
    storyId: string,
    chapters: { chapterNumber: number; content: string }[],
    onProgress?: (progress: {
      chapterIndex: number;
      totalChapters: number;
      currentChapterNumber: number;
      sentenceDone: number;
      sentenceTotal: number;
      overallPercent: number;
    }) => void,
    signal?: AbortSignal
  ): Promise<{ success: boolean; downloadedChapters: number }> {
    let downloadedChapters = 0;
    const totalChapters = chapters.length;

    for (let cIdx = 0; cIdx < totalChapters; cIdx++) {
      if (signal?.aborted) break;
      const ch = chapters[cIdx];
      const sentences = this.splitIntoSentences(ch.content);
      if (sentences.length === 0) continue;

      await this.downloadChapterAudio(
        storyId,
        ch.chapterNumber,
        (sDone, sTotal) => {
          const basePercent = (cIdx / totalChapters) * 100;
          const chapterPercent = (sDone / sTotal) * (100 / totalChapters);
          const overallPercent = Math.min(100, Math.round(basePercent + chapterPercent));
          onProgress?.({
            chapterIndex: cIdx + 1,
            totalChapters,
            currentChapterNumber: ch.chapterNumber,
            sentenceDone: sDone,
            sentenceTotal: sTotal,
            overallPercent
          });
        },
        sentences,
        signal
      );

      downloadedChapters++;
    }

    return { success: !signal?.aborted, downloadedChapters };
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
          setupNext(this.getAudioUrl(this.sentences[nextIdx], nextIdx));
        }
      });
    }
  }

  private async speakCurrentSentence() {
    if (this.state !== 'playing') return;

    // Check if we reached the end of the chapter
    if (this.currentSentenceIndex >= this.sentences.length) {
      if (this.settings.autoNextChapter !== false) {
        const advanced = await this.advanceToNextChapter();
        if (advanced) {
          return;
        }
      }
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

    // Dynamic Contextual Ambient Sound
    if (this.settings.autoContextAmbient) {
      ambientAudioService.setAutoContext(true);
      ambientAudioService.analyzeAndApplyContext(sentence);
    }

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
        let cachedBlob = this.audioBlobCache.get(sentenceIdx);
        if (!cachedBlob && this.currentStoryId && this.currentChapterNumber) {
          try {
            const dbBlob = await db.getOfflineAudio(this.currentStoryId, this.currentChapterNumber, sentenceIdx);
            if (dbBlob && currentToken === this.playbackToken) {
              cachedBlob = URL.createObjectURL(dbBlob);
              this.audioBlobCache.set(sentenceIdx, cachedBlob);
            }
          } catch (e) {
            console.warn('Error reading from offline audio cache:', e);
          }
        }

        if (currentToken !== this.playbackToken || this.state !== 'playing') return;

        if (cachedBlob) {
          player.src = cachedBlob;
        } else {
          player.src = this.getAudioUrl(sentence, sentenceIdx);
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

  public async advanceToNextChapter(): Promise<boolean> {
    if (!this.currentStoryId) return false;
    try {
      const chapters = await db.getStoryChapters(this.currentStoryId);
      if (!chapters || chapters.length === 0) return false;

      const currentNum = Number(this.currentChapterNumber) || 1;
      const currentIdx = chapters.findIndex(c => Number(c.chapterNumber) === currentNum);

      let nextChapter: Chapter | undefined;
      if (currentIdx >= 0 && currentIdx < chapters.length - 1) {
        nextChapter = chapters[currentIdx + 1];
      } else {
        // Fallback: search for first chapter with chapterNumber > currentNum
        nextChapter = chapters.find(c => Number(c.chapterNumber) > currentNum);
      }

      if (!nextChapter) {
        console.log('Reached the final chapter of the story');
        return false;
      }

      // Ensure content is loaded (check db.getChapter if content is missing)
      let fullChapter = nextChapter;
      if (!fullChapter.content || !fullChapter.content.trim()) {
        const fromDb = await db.getChapter(this.currentStoryId, Number(nextChapter.chapterNumber));
        if (fromDb && fromDb.content && fromDb.content.trim()) {
          fullChapter = fromDb;
        }
      }

      if (!fullChapter.content || !fullChapter.content.trim()) {
        console.warn('Next chapter has no readable text content:', nextChapter.chapterNumber);
        return false;
      }

      const nextNum = Number(fullChapter.chapterNumber);
      const progressPercent = Math.round((nextNum / chapters.length) * 100);

      // Persist progress to DB
      await db.stories.update(this.currentStoryId, {
        currentChapterNumber: nextNum,
        currentProgressPercent: progressPercent,
        currentSentenceIndex: 0,
        lastReadAt: Date.now()
      });

      // Load chapter with keepPlaying = true
      this.loadChapter(
        fullChapter.content,
        {
          title: this.currentBookTitle,
          author: this.currentAuthor,
          chapterTitle: fullChapter.title,
          coverUrl: this.currentCoverUrl,
          storyId: this.currentStoryId,
          chapterNumber: nextNum
        },
        0,
        true
      );
      this.play();
      return true;
    } catch (err) {
      console.warn('Failed to advance to next chapter:', err);
      return false;
    }
  }

  public async advanceToPreviousChapter(): Promise<boolean> {
    if (!this.currentStoryId) return false;
    try {
      const chapters = await db.getStoryChapters(this.currentStoryId);
      if (!chapters || chapters.length === 0) return false;

      const currentNum = Number(this.currentChapterNumber) || 1;
      const currentIdx = chapters.findIndex(c => Number(c.chapterNumber) === currentNum);

      let prevChapter: Chapter | undefined;
      if (currentIdx > 0) {
        prevChapter = chapters[currentIdx - 1];
      } else {
        prevChapter = chapters.find(c => Number(c.chapterNumber) < currentNum);
      }

      if (!prevChapter) return false;

      let fullChapter = prevChapter;
      if (!fullChapter.content || !fullChapter.content.trim()) {
        const fromDb = await db.getChapter(this.currentStoryId, Number(prevChapter.chapterNumber));
        if (fromDb && fromDb.content && fromDb.content.trim()) {
          fullChapter = fromDb;
        }
      }

      if (!fullChapter.content || !fullChapter.content.trim()) return false;

      const prevNum = Number(fullChapter.chapterNumber);
      const progressPercent = Math.round((prevNum / chapters.length) * 100);

      await db.stories.update(this.currentStoryId, {
        currentChapterNumber: prevNum,
        currentProgressPercent: progressPercent,
        currentSentenceIndex: 0,
        lastReadAt: Date.now()
      });

      this.loadChapter(
        fullChapter.content,
        {
          title: this.currentBookTitle,
          author: this.currentAuthor,
          chapterTitle: fullChapter.title,
          coverUrl: this.currentCoverUrl,
          storyId: this.currentStoryId,
          chapterNumber: prevNum
        },
        0,
        true
      );
      this.play();
      return true;
    } catch (err) {
      console.warn('Failed to advance to previous chapter:', err);
      return false;
    }
  }

  public async onNativeChapterComplete() {
    if (this.settings.autoNextChapter !== false) {
      const advanced = await this.advanceToNextChapter();
      if (advanced) {
        return;
      }
    }
    this.notifyState('idle');
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
    const androidMedia = (window as any).AndroidMedia;
    if (androidMedia && typeof androidMedia.getNativePlaybackIndex === 'function' && this.state === 'playing') {
      const idx = androidMedia.getNativePlaybackIndex();
      if (typeof idx === 'number' && idx >= 0 && idx < this.sentences.length) {
        this.currentSentenceIndex = idx;
        this.notifySentence(idx, this.sentences[idx]);
      }
    }
  }

  private playGoogleAudioStream(sentence: string, currentToken: number) {
    const player = this.activePlayer;
    player.onended = null;
    player.onerror = null;

    player.onended = () => {
      if (currentToken !== this.playbackToken || this.state !== 'playing') return;
      this.consecutiveErrors = 0;
      this.activePlayerIndex = this.activePlayerIndex === 0 ? 1 : 0;
      this.currentSentenceIndex++;
      this.speakCurrentSentence();
    };

    player.onerror = (e) => {
      if (currentToken !== this.playbackToken || this.state !== 'playing') return;
      console.warn('Google TTS audio player error:', e);
      if (this.consecutiveErrors === 0) {
        this.consecutiveErrors++;
        const processedText = pronunciationService.applyRules(sentence);
        player.src = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(processedText)}`;
        this.applyPlaybackRate(player);
        const p = player.play();
        if (p) p.catch(() => {});
        return;
      }
      this.consecutiveErrors = 0;
      this.activePlayerIndex = this.activePlayerIndex === 0 ? 1 : 0;
      this.currentSentenceIndex++;
      this.speakCurrentSentence();
    };

    const processedText = pronunciationService.applyRules(sentence);
    player.src = `${getTtsApiBase()}/api/tts?voice=google:vi&rate=1.0&pitch=${this.settings.pitch}&text=${encodeURIComponent(processedText)}`;
    this.applyPlaybackRate(player);
    const p = player.play();
    if (p) p.catch(() => {});
  }

  private playBrowserTTS(sentence: string, currentToken: number) {
    if (!this.synth) {
      this.playGoogleAudioStream(sentence, currentToken);
      return;
    }

    if (this.currentUtterance) {
      this.currentUtterance.onend = null;
      this.currentUtterance.onerror = null;
    }
    this.synth.cancel();

    const selectedVoice = this.getBrowserVietnameseVoice(this.settings.voiceURI);

    // If browser has no Vietnamese voice at all, fallback to Google Vietnamese TTS streaming audio
    if (!selectedVoice && this.getVietnameseVoices().length === 0) {
      this.playGoogleAudioStream(sentence, currentToken);
      return;
    }

    const processedText = pronunciationService.applyRules(sentence);
    const utterance = new SpeechSynthesisUtterance(processedText);
    this.currentUtterance = utterance;
    utterance.rate = this.settings.rate;
    utterance.pitch = this.settings.pitch;

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang || 'vi-VN';
    } else {
      utterance.lang = 'vi-VN';
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
      if (this.consecutiveErrors === 0) {
        this.consecutiveErrors++;
        this.playGoogleAudioStream(sentence, currentToken);
        return;
      }
      this.currentSentenceIndex++;
      this.speakCurrentSentence();
    };

    if (this.synth.paused) {
      this.synth.resume();
    }
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

  private setAudioVolume(volume: number) {
    const clamped = Math.max(0, Math.min(1, volume));
    if (this.audioPlayers[0]) this.audioPlayers[0].volume = clamped;
    if (this.audioPlayers[1]) this.audioPlayers[1].volume = clamped;
  }

  /**
   * Sleep Timer Management with Smooth Audio Fade-Out
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
      this.setAudioVolume(1.0);
      if (this.shakeCleanup) {
        this.shakeCleanup();
        this.shakeCleanup = null;
      }
      return;
    }

    this.sleepTimerSeconds = minutes * 60;
    this.notifyCountdown(this.sleepTimerSeconds);
    this.setAudioVolume(1.0);

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

        // Smooth Audio Fade-Out: gradually scale volume from 1.0 down to 0 in the last 30 seconds
        if (this.sleepTimerSeconds <= 30) {
          const fadeRatio = Math.max(0.05, this.sleepTimerSeconds / 30);
          this.setAudioVolume(fadeRatio);
        } else {
          this.setAudioVolume(1.0);
        }
      }
    }, 1000);

    this.sleepTimerId = window.setTimeout(() => {
      this.pause();
      this.setAudioVolume(1.0); // Reset volume to 100% for next play session
      this.setSleepTimer(null);
    }, minutes * 60 * 1000);
  }

  public extendSleepTimer(extraMinutes: number = 15) {
    if (this.sleepTimerSeconds === null) return;
    const newSeconds = this.sleepTimerSeconds + extraMinutes * 60;
    this.sleepTimerSeconds = newSeconds;
    this.notifyCountdown(newSeconds);
    this.setAudioVolume(1.0); // Instantly restore full volume when timer is extended

    if (this.sleepTimerId) {
      window.clearTimeout(this.sleepTimerId);
    }
    this.sleepTimerId = window.setTimeout(() => {
      this.pause();
      this.setAudioVolume(1.0);
      this.setSleepTimer(null);
    }, newSeconds * 1000);
  }

  /**
   * Native Android Media Notification Integration
   * Communicates with MainActivity.java via JavascriptInterface 'AndroidMedia'
   */
  private updateNativeNotification(isPlaying: boolean) {
    if (Boolean((window as any).AndroidMedia)) return; // Native MediaPlaybackService handles its own notification natively
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

  public getCurrentStoryId(): string {
    return this.currentStoryId;
  }

  public getCurrentChapterNumber(): number {
    return this.currentChapterNumber;
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
