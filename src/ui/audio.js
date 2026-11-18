// Web Audio square-wave beeper driven by the CHIP-8 sound timer.

export class Beeper {
  constructor() {
    this.ctx = null;
    this.osc = null;
    this.gain = null;
    this.muted = false;
    this.volume = 0.06;
    this.pitch = 440;
  }

  /** Must be called from a user gesture (browsers block autoplay). */
  unlock() {
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  set(on) {
    if (on && !this.muted && this.ctx && this.ctx.state === 'running') this.start();
    else this.stop();
  }

  start() {
    if (this.osc) return;
    const t = this.ctx.currentTime;
    this.osc = this.ctx.createOscillator();
    this.gain = this.ctx.createGain();
    this.osc.type = 'square';
    this.osc.frequency.value = this.pitch;
    this.gain.gain.setValueAtTime(0, t);
    this.gain.gain.linearRampToValueAtTime(this.volume, t + 0.005);
    this.osc.connect(this.gain).connect(this.ctx.destination);
    this.osc.start(t);
  }

  stop() {
    if (!this.osc) return;
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(this.gain.gain.value, t);
    this.gain.gain.linearRampToValueAtTime(0, t + 0.01);
    this.osc.stop(t + 0.02);
    this.osc = null;
    this.gain = null;
  }
}
