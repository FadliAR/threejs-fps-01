// Harbour Line — synthesized sound. Every effect is built with WebAudio
// oscillators and filtered noise: no audio files, no network requests.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return true;
  }

  // Short burst of white noise through a bandpass: the body of a gunshot.
  _noise(dur, filterType, freq, gain, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = filterType; filt.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  _tone(freq, dur, type, gain, slideTo = 0, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  shot(kind, dist = 0) {
    if (!this.ensure()) return;
    const atten = 1 / (1 + dist * 0.09);
    if (kind === 'pistol') { this._noise(0.09, 'bandpass', 1800, 0.5 * atten); this._tone(160, 0.08, 'square', 0.22 * atten, 70); }
    else if (kind === 'smg') { this._noise(0.07, 'bandpass', 2400, 0.38 * atten); this._tone(190, 0.06, 'square', 0.16 * atten, 90); }
    else { this._noise(0.12, 'bandpass', 1300, 0.55 * atten); this._tone(120, 0.11, 'square', 0.3 * atten, 55); }
  }

  dryFire() { this._tone(1400, 0.04, 'square', 0.12); }
  reload() { this._tone(900, 0.05, 'square', 0.1); this._tone(600, 0.05, 'square', 0.12, 0, 0.18); }
  hit() { this._tone(2200, 0.05, 'sine', 0.2); }
  headshot() { this._tone(2900, 0.07, 'sine', 0.25); this._tone(3600, 0.05, 'sine', 0.15, 0, 0.05); }
  hurt() { this._tone(110, 0.16, 'sawtooth', 0.25, 60); }
  step(run) { this._noise(0.05, 'lowpass', 420, run ? 0.1 : 0.06); }
  throwPin() { this._tone(1800, 0.03, 'square', 0.1); }
  explosion(dist = 0) {
    const atten = 1 / (1 + dist * 0.05);
    this._noise(0.7, 'lowpass', 300, 0.9 * atten);
    this._tone(70, 0.6, 'sine', 0.7 * atten, 32);
  }
  beep(final = false) { this._tone(final ? 1500 : 1050, final ? 0.3 : 0.09, 'sine', 0.22); }
  plant() { this.beep(); this._tone(700, 0.2, 'sine', 0.15, 0, 0.12); }
  buy() { this._tone(880, 0.07, 'sine', 0.18); this._tone(1320, 0.1, 'sine', 0.18, 0, 0.08); }
  denied() { this._tone(220, 0.16, 'square', 0.16, 160); }
  roundWin() { [523, 659, 784].forEach((f, i) => this._tone(f, 0.22, 'triangle', 0.2, 0, i * 0.13)); }
  roundLose() { [392, 330, 262].forEach((f, i) => this._tone(f, 0.26, 'triangle', 0.2, 0, i * 0.15)); }
  defuseTick() { this._tone(1250, 0.04, 'sine', 0.14); }
}
