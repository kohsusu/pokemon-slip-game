// Web Audio API — BGM + SFX manager

export class AudioManager {
  constructor() {
    this._ctx        = null;
    this._bgm        = null;
    this._sfx        = null;
    this._started    = false;
    this._timer      = null;
    this._tenseTimer = null;
    this._musicOn    = true;
    this._tense      = false;   // true while tsunami wave is active
  }

  toggleMusic() {
    this._musicOn = !this._musicOn;
    if (this._bgm) {
      this._bgm.gain.setTargetAtTime(
        this._musicOn ? 0.20 : 0,
        this._ctx.currentTime, 0.08,
      );
    }
    return this._musicOn;
  }

  // Call once on first user gesture
  start() {
    if (this._started) return;
    this._started = true;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this._ctx = ctx;

    this._bgm = ctx.createGain();
    this._bgm.gain.value = this._musicOn ? 0.20 : 0;
    this._bgm.connect(ctx.destination);

    this._sfx = ctx.createGain();
    this._sfx.gain.value = 0.55;
    this._sfx.connect(ctx.destination);

    this._loopBGM(ctx.currentTime);
  }

  // ── Low-level helpers ─────────────────────────────────────────────────────
  _tone(freq, t, dur, vol, type, dest) {
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const atk = Math.min(0.015, dur * 0.1);
    const rel = Math.min(0.05,  dur * 0.2);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + atk);
    g.gain.setValueAtTime(vol, t + dur - rel);
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _noise(t, dur, vol, hipass, dest) {
    const ctx  = this._ctx;
    const len  = Math.ceil(ctx.sampleRate * dur);
    const buf  = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hpf = ctx.createBiquadFilter();
    hpf.type  = 'highpass';
    hpf.frequency.value = hipass;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(hpf); hpf.connect(g); g.connect(dest);
    src.start(t);
  }

  _kick(t) {
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.22);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(g); g.connect(this._bgm);
    osc.start(t); osc.stop(t + 0.28);
  }

  _snare(t) {
    this._noise(t, 0.18, 0.5, 1500, this._bgm);
    this._tone(220, t, 0.08, 0.3, 'square', this._bgm);
  }

  _hihat(t, vol = 0.18) {
    this._noise(t, 0.04, vol, 8000, this._bgm);
  }

  // ── Normal BGM loop ───────────────────────────────────────────────────────
  _loopBGM(t0) {
    if (!this._ctx || this._tense) return;
    const BPM = 134;
    const b   = 60 / BPM;

    const G3=196, D4=293.66, G4=392, A4=440, B4=493.88,
          C5=523.25, D5=587.33, E5=659.25, G5=784;
    const C3=130.81, E3=164.81, A3=220;

    const mel = [
      [D5, 0,    0.38], [D5, 0.5,  0.38],
      [E5, 1,    0.38], [E5, 1.5,  0.38],
      [D5, 2,    0.38], [B4, 2.5,  0.38],
      [G4, 3,    0.85],
      [A4, 4,    0.38], [A4, 4.5,  0.38],
      [B4, 5,    0.38], [B4, 5.5,  0.38],
      [A4, 6,    0.38], [G4, 6.5,  0.38],
      [E5, 7,    0.85],
      [G4, 8,    0.22], [A4, 8.25, 0.22],
      [B4, 8.5,  0.22], [C5, 8.75, 0.22],
      [D5, 9,    0.22], [E5, 9.25, 0.22],
      [D5, 9.5,  0.22], [B4, 9.75, 0.22],
      [C5, 10,   0.38], [B4, 10.5, 0.38],
      [A4, 11,   0.38], [G4, 11.5, 0.38],
      [B4, 12,   0.38], [C5, 12.5, 0.38],
      [D5, 13,   0.38], [E5, 13.5, 0.38],
      [G5, 14,   1.85],
    ];

    const bass = [
      [G3, 0,  0.65], [G3, 1,  0.65], [G3, 2,  0.65], [G3, 3,  0.65],
      [A3, 4,  0.65], [A3, 5,  0.65], [C3, 6,  0.65], [D4, 7,  0.65],
      [C3, 8,  0.65], [C3, 9,  0.65], [C3, 10, 0.65], [G3, 11, 0.65],
      [D4, 12, 0.65], [D4, 13, 0.65], [G3, 14, 0.65], [G3, 15, 0.65],
    ];

    const LOOP    = 16;
    const loopDur = LOOP * b;

    mel.forEach(([f, beat, dur]) =>
      this._tone(f, t0 + beat * b, dur * b, 0.42, 'square', this._bgm));
    bass.forEach(([f, beat, dur]) =>
      this._tone(f, t0 + beat * b, dur * b, 0.55, 'triangle', this._bgm));
    for (let i = 0; i < LOOP; i++) {
      const t = t0 + i * b;
      if (i % 4 === 0 || i % 4 === 2) this._kick(t);
      if (i % 4 === 1 || i % 4 === 3) this._snare(t);
    }
    for (let i = 0; i < LOOP * 2; i++) {
      this._hihat(t0 + i * b * 0.5, i % 2 === 0 ? 0.2 : 0.12);
    }

    // ── Fix: guard against late setTimeout on tablets (AudioContext drift) ──
    this._timer = setTimeout(() => {
      if (!this._ctx || this._tense) return;
      // If the callback fires late, clamp start time to ctx.currentTime
      const actualT0 = Math.max(t0 + loopDur, this._ctx.currentTime + 0.05);
      this._loopBGM(actualT0);
    }, (loopDur - 0.35) * 1000);
  }

  // ── Tense BGM (during tsunami wave) ──────────────────────────────────────
  _loopTenseBGM(t0) {
    if (!this._ctx || !this._tense) return;

    const BPM = 172;
    const b   = 60 / BPM;
    const LOOP    = 8;
    const loopDur = LOOP * b;

    // Urgent alarm melody — E5/D5 alternating, rising to A5
    const E5=659.25, D5=587.33, C5=523.25, B4=493.88, A4=440,
          G4=392, A5=880, G5=784;

    const mel = [
      [E5, 0, 0.45], [D5, 0.5, 0.45],
      [E5, 1, 0.45], [D5, 1.5, 0.45],
      [E5, 2, 0.45], [C5, 2.5, 0.45],
      [E5, 3, 0.9],
      [E5, 4, 0.45], [D5, 4.5, 0.45],
      [E5, 5, 0.45], [D5, 5.5, 0.45],
      [G5, 6, 0.45], [E5, 6.5, 0.45],
      [A5, 7, 0.9],
    ];
    mel.forEach(([f, beat, dur]) =>
      this._tone(f, t0 + beat * b, dur * b, 0.40, 'sawtooth', this._bgm));

    // Driving bass (every beat)
    const bassFreqs = [110, 110, 165, 110, 110, 165, 220, 165];
    bassFreqs.forEach((f, i) =>
      this._tone(f, t0 + i * b, b * 0.85, 0.55, 'square', this._bgm));

    // Double-time drums
    for (let i = 0; i < LOOP; i++) {
      const t = t0 + i * b;
      if (i % 2 === 0) this._kick(t);
      if (i % 2 === 1) this._snare(t);
      this._hihat(t, 0.28);
      this._hihat(t + b * 0.5, 0.18);
    }

    this._tenseTimer = setTimeout(() => {
      if (!this._ctx || !this._tense) return;
      const actualT0 = Math.max(t0 + loopDur, this._ctx.currentTime + 0.05);
      this._loopTenseBGM(actualT0);
    }, (loopDur - 0.2) * 1000);
  }

  /** Called when the tsunami wave spawns — switches to tense BGM. */
  startTenseMusic() {
    if (!this._ctx || this._tense) return;
    this._tense = true;
    clearTimeout(this._timer);
    // Slightly boost volume for drama
    this._bgm.gain.setTargetAtTime(this._musicOn ? 0.30 : 0, this._ctx.currentTime, 0.25);
    this._loopTenseBGM(this._ctx.currentTime + 0.05);
  }

  /** Called when the wave ends — restores normal BGM. */
  stopTenseMusic() {
    if (!this._ctx || !this._tense) return;
    this._tense = false;
    clearTimeout(this._tenseTimer);
    this._bgm.gain.setTargetAtTime(this._musicOn ? 0.20 : 0, this._ctx.currentTime, 0.5);
    this._loopBGM(this._ctx.currentTime + 0.05);
  }

  // ── SFX ──────────────────────────────────────────────────────────────────
  playPickup() {
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    this._tone(660,  t,      0.06, 0.8, 'sine', this._sfx);
    this._tone(880,  t+0.07, 0.06, 0.7, 'sine', this._sfx);
    this._tone(1100, t+0.14, 0.10, 0.6, 'sine', this._sfx);
  }

  playDeposit() {
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) =>
      this._tone(f, t + i * 0.09, 0.22, 0.55, 'sine', this._sfx));
  }

  playDrop() {
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    this._tone(440, t,      0.05, 0.5, 'sine', this._sfx);
    this._tone(330, t+0.06, 0.08, 0.4, 'sine', this._sfx);
  }

  playWaveWarning() {
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    for (let i = 0; i < 3; i++)
      this._tone(880, t + i * 0.38, 0.28, 0.7, 'sawtooth', this._sfx);
  }

  playWarp() {
    if (!this._ctx) return;
    const ctx = this._ctx;
    const t   = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.55);
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    osc.connect(g); g.connect(this._sfx);
    osc.start(t); osc.stop(t + 0.58);
    this._noise(t, 0.3, 0.4, 200, this._sfx);
  }

  playUpgrade() {
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    [392, 523, 659, 784, 1047].forEach((f, i) =>
      this._tone(f, t + i * 0.07, 0.18, 0.5, 'square', this._sfx));
  }

  playSell() {
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    this._tone(784, t,      0.06, 0.7, 'sine', this._sfx);
    this._tone(659, t+0.07, 0.06, 0.6, 'sine', this._sfx);
    this._tone(523, t+0.14, 0.18, 0.7, 'sine', this._sfx);
    this._tone(784, t+0.22, 0.20, 0.5, 'sine', this._sfx);
  }

  playWaveEnd() {
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    [523, 659, 784, 523, 1047].forEach((f, i) =>
      this._tone(f, t + i * 0.11, 0.20, 0.5, 'sine', this._sfx));
  }

  stop() {
    clearTimeout(this._timer);
    clearTimeout(this._tenseTimer);
    if (this._ctx) { this._ctx.close(); this._ctx = null; }
  }
}
