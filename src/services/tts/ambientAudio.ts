export type AmbientSoundType = 'off' | 'rain' | 'campfire' | 'wind' | 'stream' | 'meditation' | 'library';

export interface AmbientSoundOption {
  id: AmbientSoundType;
  name: string;
  icon: string;
  description: string;
}

export const AMBIENT_SOUND_OPTIONS: AmbientSoundOption[] = [
  { id: 'off', name: 'Tắt âm nền', icon: 'VolumeX', description: 'Chỉ nghe giọng đọc truyện' },
  { id: 'rain', name: 'Mưa đêm', icon: 'CloudRain', description: 'Tiếng mưa rơi êm dịu trên mái ngói' },
  { id: 'campfire', name: 'Lửa trại', icon: 'Flame', description: 'Tiếng củi tí tách, ấm áp đêm khuya' },
  { id: 'wind', name: 'Gió rừng trúc', icon: 'Wind', description: 'Tiếng gió thoảng qua rặng tre trúc kiếm hiệp' },
  { id: 'stream', name: 'Suối nước', icon: 'Waves', description: 'Tiếng suối róc rách, thiên nhiên thư thái' },
  { id: 'meditation', name: 'Thiền định & Chuông', icon: 'Sparkles', description: 'Chuông xoay Tây Tạng & hòa âm 432Hz tĩnh tâm tu luyện' },
  { id: 'library', name: 'Thư viện cổ', icon: 'BookOpen', description: 'Tiếng lật sách cổ & đồng hồ tích tắc yên bình' }
];

class AmbientAudioService {
  private audioCtx: AudioContext | null = null;
  private currentType: AmbientSoundType = 'off';
  private volume: number = 0.25; // 0.0 to 1.0
  private masterGain: GainNode | null = null;
  private activeNodes: (AudioNode | number)[] = [];
  private isRunning = false;
  private autoContext = false;
  private lastContextChangeTimestamp = 0;

  private initContext() {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  }

  public getType(): AmbientSoundType {
    return this.currentType;
  }

  public getVolume(): number {
    return this.volume;
  }

  public isAutoContextEnabled(): boolean {
    return this.autoContext;
  }

  public setAutoContext(enabled: boolean) {
    this.autoContext = enabled;
  }

  /**
   * Analyze sentence content and dynamically transition ambient background sound
   */
  public analyzeAndApplyContext(sentenceText: string) {
    if (!this.autoContext) return;
    const now = Date.now();
    // Debounce scene transitions by at least 15 seconds to prevent jarring audio jumps
    if (now - this.lastContextChangeTimestamp < 15000) return;

    const lower = sentenceText.toLowerCase();

    // 1. Rain / Storm cues
    if (/mưa|bão|sấm|chớp|lôi kiếp|giông|tầm tã/.test(lower)) {
      if (this.currentType !== 'rain') {
        this.setSound('rain');
        this.lastContextChangeTimestamp = now;
      }
      return;
    }

    // 2. Campfire / Flame / Night cues
    if (/lửa trại|đống lửa|củi|tí tách|bếp than|thiêu đốt|dương viêm|hỏa diễm/.test(lower)) {
      if (this.currentType !== 'campfire') {
        this.setSound('campfire');
        this.lastContextChangeTimestamp = now;
      }
      return;
    }

    // 3. Wind / Peak / Bamboo cues
    if (/gió rít|cuồng phong|rừng trúc|vách đá|đỉnh núi|kiếm khí vi vút|bão tuyết/.test(lower)) {
      if (this.currentType !== 'wind') {
        this.setSound('wind');
        this.lastContextChangeTimestamp = now;
      }
      return;
    }

    // 4. Stream / Water cues
    if (/con suối|dòng suối|thác nước|bờ sông|chèo thuyền|róc rách|hồ nước/.test(lower)) {
      if (this.currentType !== 'stream') {
        this.setSound('stream');
        this.lastContextChangeTimestamp = now;
      }
      return;
    }

    // 5. Meditation / Cultivation / Temple cues
    if (/đả tọa|thiền định|đột phá|tâm cảnh|cổ tự|thanh tịnh|kinh văn|phật quang|linh khí/.test(lower)) {
      if (this.currentType !== 'meditation') {
        this.setSound('meditation');
        this.lastContextChangeTimestamp = now;
      }
      return;
    }

    // 6. Library / Academy / Ancient Scroll cues
    if (/thư các|tàng kinh các|học viện|thư phòng|sách cổ|cuộn tranh|bút nghiên|tàng thư/.test(lower)) {
      if (this.currentType !== 'library') {
        this.setSound('library');
        this.lastContextChangeTimestamp = now;
      }
      return;
    }
  }

  /**
   * Play realistic acoustic paper page turn sound effect
   */
  public playPageTurnSound(volumeMultiplier: number = 0.35) {
    try {
      // If TTS is currently playing, NEVER play WebAudio page turn sound
      // Because WebAudio output causes Android AudioManager to issue AUDIOFOCUS_LOSS and pause TTS!
      if (typeof window !== 'undefined') {
        const tts = (window as any).ttsEngine;
        if (tts && typeof tts.getState === 'function' && tts.getState() === 'playing') {
          return;
        }
      }

      this.initContext();
      if (!this.audioCtx) return;
      const ctx = this.audioCtx;

      const duration = 0.22;
      const bufferSize = Math.floor(ctx.sampleRate * duration);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = buffer.getChannelData(0);

      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        const pink = b0 + b1 + b2 + white * 0.5362;
        const envelope = Math.sin((i / bufferSize) * Math.PI);
        output[i] = pink * 0.22 * envelope;
      }

      const noiseNode = ctx.createBufferSource();
      noiseNode.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1600, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(750, ctx.currentTime + duration);
      filter.Q.value = 1.6;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.4 * volumeMultiplier, ctx.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      noiseNode.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noiseNode.start();
    } catch {
      // AudioContext may be restricted until first user interaction
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.audioCtx.currentTime);
    }
  }

  public setSound(type: AmbientSoundType) {
    this.currentType = type;
    this.stop();
    if (type !== 'off') {
      this.start(type);
    }
  }

  private stop() {
    this.isRunning = false;
    for (const item of this.activeNodes) {
      if (typeof item === 'number') {
        window.clearInterval(item);
      } else {
        try {
          if ('stop' in item && typeof (item as any).stop === 'function') {
            (item as any).stop();
          }
          item.disconnect();
        } catch {}
      }
    }
    this.activeNodes = [];
  }

  private start(type: AmbientSoundType) {
    try {
      this.initContext();
      if (!this.audioCtx) return;

      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.audioCtx.currentTime);
      this.masterGain.connect(this.audioCtx.destination);
      this.activeNodes.push(this.masterGain);
      this.isRunning = true;

      switch (type) {
        case 'rain':
          this.createRainSound();
          break;
        case 'campfire':
          this.createCampfireSound();
          break;
        case 'wind':
          this.createWindSound();
          break;
        case 'stream':
          this.createStreamSound();
          break;
        case 'meditation':
          this.createMeditationSound();
          break;
        case 'library':
          this.createLibrarySound();
          break;
      }
    } catch (e) {
      console.warn('Ambient audio error:', e);
    }
  }

  // --- Rain Sound: Pink noise with soft low-pass filter ---
  private createRainSound() {
    if (!this.audioCtx || !this.masterGain) return;
    const bufferSize = this.audioCtx.sampleRate * 2;
    const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
      b6 = white * 0.115926;
    }

    const whiteNoise = this.audioCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, this.audioCtx.currentTime);

    whiteNoise.connect(filter);
    filter.connect(this.masterGain);
    whiteNoise.start();

    this.activeNodes.push(whiteNoise, filter);
  }

  // --- Wind Sound: Bandpass filtered noise with LFO modulation ---
  private createWindSound() {
    if (!this.audioCtx || !this.masterGain) return;
    const bufferSize = this.audioCtx.sampleRate * 2;
    const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * 0.08;
    }

    const noise = this.audioCtx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(450, this.audioCtx.currentTime);
    filter.Q.setValueAtTime(3.0, this.audioCtx.currentTime);

    // LFO to modulate wind gusts
    const lfo = this.audioCtx.createOscillator();
    lfo.frequency.setValueAtTime(0.2, this.audioCtx.currentTime); // slow wave
    const lfoGain = this.audioCtx.createGain();
    lfoGain.gain.setValueAtTime(250, this.audioCtx.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    noise.connect(filter);
    filter.connect(this.masterGain);
    noise.start();

    this.activeNodes.push(noise, filter, lfo, lfoGain);
  }

  // --- Campfire Sound: Low rumble + crackle pops ---
  private createCampfireSound() {
    if (!this.audioCtx || !this.masterGain) return;
    // 1. Soft fire rumble
    this.createRainSound();

    // 2. Crackling pops
    const intervalId = window.setInterval(() => {
      if (!this.audioCtx || !this.masterGain || !this.isRunning) return;
      if (Math.random() > 0.4) {
        try {
          const popOsc = this.audioCtx.createOscillator();
          const popGain = this.audioCtx.createGain();
          popOsc.type = 'triangle';
          popOsc.frequency.setValueAtTime(150 + Math.random() * 400, this.audioCtx.currentTime);

          popGain.gain.setValueAtTime(0.08 + Math.random() * 0.07, this.audioCtx.currentTime);
          popGain.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + 0.04);

          popOsc.connect(popGain);
          popGain.connect(this.masterGain);
          popOsc.start();
          popOsc.stop(this.audioCtx.currentTime + 0.05);
        } catch {}
      }
    }, 120);

    this.activeNodes.push(intervalId);
  }

  // --- Stream Sound: Water flow bubbling ---
  private createStreamSound() {
    if (!this.audioCtx || !this.masterGain) return;
    const bufferSize = this.audioCtx.sampleRate * 2;
    const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * 0.06;
    }

    const noise = this.audioCtx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(650, this.audioCtx.currentTime);
    filter.Q.setValueAtTime(1.5, this.audioCtx.currentTime);

    // Subtle gentle ripples
    const lfo = this.audioCtx.createOscillator();
    lfo.frequency.setValueAtTime(0.7, this.audioCtx.currentTime);
    const lfoGain = this.audioCtx.createGain();
    lfoGain.gain.setValueAtTime(150, this.audioCtx.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    noise.connect(filter);
    filter.connect(this.masterGain);
    noise.start();

    this.activeNodes.push(noise, filter, lfo, lfoGain);
  }

  // --- Meditation Sound: Harmonious singing bowl / zen tone with slow breathing envelope ---
  private createMeditationSound() {
    if (!this.audioCtx || !this.masterGain) return;
    const freqs = [216, 432, 528];
    const gains: GainNode[] = [];

    freqs.forEach((freq, idx) => {
      if (!this.audioCtx || !this.masterGain) return;
      const osc = this.audioCtx.createOscillator();
      const oscGain = this.audioCtx.createGain();
      osc.type = idx === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

      const baseVol = idx === 0 ? 0.08 : 0.03;
      oscGain.gain.setValueAtTime(baseVol, this.audioCtx.currentTime);

      osc.connect(oscGain);
      oscGain.connect(this.masterGain);
      osc.start();

      this.activeNodes.push(osc, oscGain);
      gains.push(oscGain);
    });

    // Slow ambient breathing LFO
    const breathLfo = this.audioCtx.createOscillator();
    breathLfo.frequency.setValueAtTime(0.12, this.audioCtx.currentTime); // ~8s cycle
    const breathGain = this.audioCtx.createGain();
    breathGain.gain.setValueAtTime(0.02, this.audioCtx.currentTime);
    breathLfo.connect(breathGain);
    gains.forEach((g) => breathGain.connect(g.gain));
    breathLfo.start();
    this.activeNodes.push(breathLfo, breathGain);
  }

  // --- Library Sound: Soft room resonance + antique clock pendulum ticks ---
  private createLibrarySound() {
    if (!this.audioCtx || !this.masterGain) return;
    // 1. Faint room ambience
    const bufferSize = this.audioCtx.sampleRate * 2;
    const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * 0.02;
    }
    const noise = this.audioCtx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, this.audioCtx.currentTime);
    noise.connect(filter);
    filter.connect(this.masterGain);
    noise.start();
    this.activeNodes.push(noise, filter);

    // 2. Slow ticking clock (1 tick per second)
    const tickInterval = window.setInterval(() => {
      if (!this.audioCtx || !this.masterGain || !this.isRunning) return;
      try {
        const tickOsc = this.audioCtx.createOscillator();
        const tickGain = this.audioCtx.createGain();
        tickOsc.type = 'sine';
        tickOsc.frequency.setValueAtTime(1100, this.audioCtx.currentTime);
        tickGain.gain.setValueAtTime(0.04, this.audioCtx.currentTime);
        tickGain.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + 0.025);
        tickOsc.connect(tickGain);
        tickGain.connect(this.masterGain);
        tickOsc.start();
        tickOsc.stop(this.audioCtx.currentTime + 0.03);
      } catch {}
    }, 1000);
    this.activeNodes.push(tickInterval);
  }
}

export const ambientAudioService = new AmbientAudioService();
