/** Synthesized sounds for Wrathwater (no audio files): cannons, hits, splashes, coins, and the sea. */
export class SeaAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private ambience: GainNode | null = null;

  /** Must be called from a click or key press before sound can play. */
  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(ctx.destination);
      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startAmbience();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  dispose() {
    void this.ctx?.close();
    this.ctx = null;
  }

  /** Rolling waves: low-passed noise that swells slowly. */
  private startAmbience() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0.12;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain).connect(gain.gain);
    src.connect(lp).connect(gain).connect(this.master!);
    src.start();
    lfo.start();
    this.ambience = gain;
  }

  setAmbience(volume: number) {
    if (this.ambience && this.ctx) this.ambience.gain.setTargetAtTime(volume * 0.12, this.ctx.currentTime, 0.5);
  }

  private burst(volume: number, freq: number, q: number, duration: number, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise || volume < 0.01) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random(), duration + 0.05);
  }

  private tone(volume: number, from: number, to: number, duration: number, type: OscillatorType = "sine", delay = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.master || volume < 0.01) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + duration + 0.02);
  }

  /** A broadside: one boom per cannon, slightly staggered. */
  cannon(volume: number, count: number) {
    for (let i = 0; i < Math.min(count, 8); i++) {
      const d = i * 0.07 + Math.random() * 0.03;
      this.burst(volume * 0.9, 900, 0.7, 0.55, d);
      this.tone(volume * 0.8, 120, 38, 0.45, "sine", d);
    }
  }

  hit(volume: number) {
    this.burst(volume * 0.7, 2600, 1.5, 0.18);
    this.tone(volume * 0.35, 300, 90, 0.15, "triangle");
  }

  splash(volume: number) {
    this.burst(volume * 0.35, 1400, 0.6, 0.35);
  }

  sink(volume: number) {
    this.burst(volume, 500, 0.5, 2.2);
    this.tone(volume * 0.6, 90, 30, 2, "sine");
  }

  coin() {
    this.tone(0.18, 1320, 1320, 0.09, "square");
    this.tone(0.18, 1760, 1760, 0.16, "square", 0.08);
  }

  fanfare() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(0.16, f, f, 0.28, "triangle", i * 0.14));
  }

  step() {
    this.burst(0.12, 600, 0.5, 0.06);
  }

  swing(volume: number) {
    this.burst(volume * 0.35, 3200, 0.4, 0.14);
  }

  gun(volume: number, heavy: boolean) {
    this.burst(volume * (heavy ? 1 : 0.8), heavy ? 1800 : 2600, 0.6, heavy ? 0.4 : 0.22);
    this.tone(volume * 0.4, heavy ? 160 : 220, 50, 0.18, "sine");
  }

  thud(volume: number) {
    this.tone(volume * 0.5, 140, 60, 0.12, "sine");
    this.burst(volume * 0.25, 900, 0.5, 0.08);
  }

  /** The sound of each Devil Fruit power. */
  power(fruit: string) {
    switch (fruit) {
      case "mera":
        this.burst(0.6, 1200, 0.3, 0.7);
        this.tone(0.2, 200, 80, 0.6, "sawtooth");
        break;
      case "goro":
        this.burst(0.9, 5000, 0.2, 0.25);
        this.burst(0.8, 300, 0.5, 1.6, 0.12);
        break;
      case "gomu":
        this.tone(0.3, 180, 900, 0.18, "triangle");
        this.tone(0.3, 900, 120, 0.2, "triangle", 0.18);
        break;
      case "moku":
        this.burst(0.5, 700, 0.3, 1.2);
        break;
      case "gura":
        this.tone(0.7, 50, 25, 1.6, "sine");
        this.burst(0.8, 220, 0.5, 1.8);
        break;
    }
  }

  alarm() {
    this.tone(0.14, 880, 660, 0.25, "sawtooth");
    this.tone(0.14, 880, 660, 0.25, "sawtooth", 0.3);
  }
}
