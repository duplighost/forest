// Procedural ambient soundscape — no assets, no words. A soft wind bed, an
// occasional bird, a quiet magical pad, water when you swim, and a wind-rush
// that swells with glide speed. Starts only after the first user gesture.
export class Ambience {
  constructor() {
    this.ctx = null;
    this.started = false;
    this._birdT = 0;
  }

  start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.started = true;
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0;
    this.master.connect(ctx.destination);
    // gentle fade-in
    this.master.gain.linearRampToValueAtTime(0.32, ctx.currentTime + 3);

    // --- looping noise source for wind / water ---
    const len = 2 * ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02; // brownish noise
      d[i] = last * 3.2;
    }
    this.noise = ctx.createBufferSource();
    this.noise.buffer = buf;
    this.noise.loop = true;

    // wind: noise → lowpass → gain, with slow LFO swells
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 480;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.5;
    this.noise.connect(this.windFilter).connect(this.windGain).connect(this.master);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.28;
    lfo.connect(lfoG).connect(this.windGain.gain);
    lfo.start();
    this.noise.start();

    // water: a second branch, opened up only while swimming
    this.waterFilter = ctx.createBiquadFilter();
    this.waterFilter.type = 'bandpass';
    this.waterFilter.frequency.value = 900;
    this.waterFilter.Q.value = 0.7;
    this.waterGain = ctx.createGain();
    this.waterGain.gain.value = 0.0;
    this.noise.connect(this.waterFilter).connect(this.waterGain).connect(this.master);

    // rain: a brighter hiss branch, opened by wetness
    this.rainFilter = ctx.createBiquadFilter();
    this.rainFilter.type = 'highpass';
    this.rainFilter.frequency.value = 1100;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0.0;
    this.noise.connect(this.rainFilter).connect(this.rainGain).connect(this.master);

    // soft evolving pad — a quiet, warm chord
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.06;
    this.padGain.connect(this.master);
    const freqs = [146.83, 220.0, 293.66, 440.0]; // D3 A3 D4 A4
    this.padOscs = freqs.map((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.25 / (i + 1);
      const det = ctx.createOscillator();
      det.frequency.value = 0.05 + i * 0.013;
      const detG = ctx.createGain();
      detG.gain.value = 1.5;
      det.connect(detG).connect(o.detune);
      det.start();
      o.connect(g).connect(this.padGain);
      o.start();
      return o;
    });
  }

  // A soft bell note from a warm pentatonic scale (used for glide chimes).
  _bell(vol, freq) {
    const ctx = this.ctx, t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = Math.random() * 1.4 - 0.7; out.connect(pan).connect(this.master); }
    else out.connect(this.master);
    [1, 2, 3].forEach((h, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * h;
      const g = ctx.createGain();
      g.gain.value = (i === 0 ? 1 : 0.28 / i);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + 2.2);
    });
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(vol, t + 0.02);
    out.gain.exponentialRampToValueAtTime(0.0008, t + 1.8 + Math.random());
  }

  // Called each frame while airborne; chimes get more frequent and louder the
  // faster you glide, so a big swooping glide rings out.
  glide(dt, airborne, speed) {
    if (!this.started || !this.ctx) return;
    const amt = airborne ? Math.min(1, Math.max(0, (speed - 11) / 18)) : 0;
    this._chimeT = (this._chimeT || 0) - dt;
    if (amt > 0.12 && this._chimeT <= 0) {
      this._chimeT = 0.25 + Math.random() * (1.6 - amt * 1.2);
      const scale = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3]; // C pentatonic-ish
      const f = scale[(Math.random() * scale.length) | 0] * (Math.random() < 0.3 ? 2 : 1);
      this._bell(0.05 + amt * 0.14, f);
    }
  }

  _chirp() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const g = ctx.createGain();
    g.gain.value = 0;
    (pan ? pan.connect(this.master) : g.connect(this.master));
    if (pan) { g.connect(pan); pan.pan.value = Math.random() * 1.6 - 0.8; }
    const notes = 2 + (Math.random() * 3 | 0);
    const base = 1800 + Math.random() * 1600;
    for (let n = 0; n < notes; n++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      const t0 = t + n * (0.07 + Math.random() * 0.05);
      const f = base * (1 + (Math.random() - 0.5) * 0.3);
      o.frequency.setValueAtTime(f * 0.8, t0);
      o.frequency.exponentialRampToValueAtTime(f, t0 + 0.04);
      o.frequency.exponentialRampToValueAtTime(f * 0.9, t0 + 0.09);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0, t0);
      og.gain.linearRampToValueAtTime(0.18, t0 + 0.01);
      og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.11);
      o.connect(og).connect(g);
      o.start(t0); o.stop(t0 + 0.13);
    }
    g.gain.setValueAtTime(0.5, t);
  }

  update(dt, state, speed, wetness = 0) {
    if (!this.started || !this.ctx) return;
    const ctx = this.ctx;
    this.rainGain.gain.setTargetAtTime(wetness * 0.5, ctx.currentTime, 0.4);
    // glide wind-rush: open the filter and swell the wind with speed
    const rush = state === 'air' ? Math.min(1, Math.max(0, (speed - 8) / 22)) : 0;
    const targetWind = 0.5 + rush * 1.1;
    this.windGain.gain.setTargetAtTime(targetWind, ctx.currentTime, 0.3);
    this.windFilter.frequency.setTargetAtTime(480 + rush * 1400, ctx.currentTime, 0.3);
    // water while swimming
    this.waterGain.gain.setTargetAtTime(state === 'swim' ? 0.5 : 0.0, ctx.currentTime, 0.25);

    // schedule birds when calm (not mid-glide)
    this._birdT -= dt;
    if (this._birdT <= 0) {
      this._birdT = 2.5 + Math.random() * 6;
      if (rush < 0.3 && Math.random() < 0.7) this._chirp();
    }
  }
}
