import type { WeaponId } from "@/shared/archetypes";

interface ShotSound {
  freq: number;
  q: number;
  duration: number;
  gain: number;
  thump: number;
}

const SHOT_SOUNDS: Record<WeaponId, ShotSound> = {
  chalk: { freq: 3200, q: 2, duration: 0.06, gain: 0.3, thump: 220 },
  stapler: { freq: 4200, q: 3, duration: 0.04, gain: 0.3, thump: 400 },
  food: { freq: 700, q: 0.8, duration: 0.1, gain: 0.4, thump: 120 },
  tots: { freq: 900, q: 1, duration: 0.06, gain: 0.32, thump: 160 },
  dodgeball: { freq: 400, q: 0.6, duration: 0.18, gain: 0.7, thump: 60 },
  tennis: { freq: 1200, q: 1.5, duration: 0.07, gain: 0.45, thump: 180 },
  paint: { freq: 600, q: 0.5, duration: 0.25, gain: 0.6, thump: 80 },
  crayon: { freq: 2400, q: 2, duration: 0.08, gain: 0.4, thump: 200 },
  rubberband: { freq: 2800, q: 4, duration: 0.05, gain: 0.3, thump: 300 },
  pencil: { freq: 2000, q: 2, duration: 0.06, gain: 0.35, thump: 250 },
  spitball: { freq: 1500, q: 0.8, duration: 0.2, gain: 0.55, thump: 90 },
  peashooter: { freq: 1800, q: 1.5, duration: 0.07, gain: 0.35, thump: 200 },
  eraser: { freq: 500, q: 0.7, duration: 0.12, gain: 0.55, thump: 90 },
  redpen: { freq: 3600, q: 3, duration: 0.04, gain: 0.3, thump: 350 },
  quiz: { freq: 1100, q: 0.6, duration: 0.3, gain: 0.6, thump: 100 },
  lecture: { freq: 300, q: 0.5, duration: 0.4, gain: 0.8, thump: 50 },
};

/** Tiny synthesized sound effects, so the game needs no audio files. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  volume = 0.5;

  /** Must be called from a user gesture before sounds can play. */
  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  dispose() {
    void this.ctx?.close();
    this.ctx = null;
  }

  shot(weapon: WeaponId, volume: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise || volume <= 0.01) return;
    const s = SHOT_SOUNDS[weapon];
    const t = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = s.freq;
    filter.Q.value = s.q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(s.gain * volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + s.duration);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t, Math.random() * 0.3, s.duration + 0.02);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(s.thump * 2, t);
    osc.frequency.exponentialRampToValueAtTime(s.thump, t + 0.06);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.5 * s.gain * volume, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(og).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  blip(freq: number, duration: number, volume: number, type: OscillatorType = "square") {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.01);
  }

  hit() {
    this.blip(1250, 0.05, 0.12);
  }

  kill() {
    this.blip(880, 0.08, 0.12);
    setTimeout(() => this.blip(1320, 0.12, 0.12), 70);
  }

  hurt() {
    this.blip(160, 0.12, 0.2, "sawtooth");
  }
}
