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
  meatball: { freq: 450, q: 0.6, duration: 0.2, gain: 0.6, thump: 70 },
  pie: { freq: 800, q: 0.5, duration: 0.22, gain: 0.55, thump: 90 },
  tackle: { freq: 200, q: 0.5, duration: 0.35, gain: 0.8, thump: 45 },
  paintbomb: { freq: 550, q: 0.4, duration: 0.4, gain: 0.8, thump: 60 },
  berry: { freq: 1300, q: 1.2, duration: 0.06, gain: 0.32, thump: 170 },
  bigberry: { freq: 380, q: 0.6, duration: 0.18, gain: 0.7, thump: 58 },
  berryblast: { freq: 900, q: 0.8, duration: 0.2, gain: 0.6, thump: 90 },
  rollout: { freq: 220, q: 0.5, duration: 0.35, gain: 0.8, thump: 45 },
  jam: { freq: 420, q: 0.4, duration: 0.35, gain: 0.7, thump: 60 },
  seeds: { freq: 3000, q: 3, duration: 0.04, gain: 0.3, thump: 320 },
  wedge: { freq: 650, q: 0.7, duration: 0.12, gain: 0.5, thump: 100 },
  squirt: { freq: 1600, q: 0.5, duration: 0.25, gain: 0.55, thump: 120 },
  peel: { freq: 700, q: 1, duration: 0.15, gain: 0.5, thump: 110 },
  bigorange: { freq: 330, q: 0.5, duration: 0.3, gain: 0.75, thump: 55 },
  segment: { freq: 800, q: 0.7, duration: 0.1, gain: 0.45, thump: 100 },
  // Band and orchestra: pitched roughly like the instrument.
  tuba: { freq: 180, q: 4, duration: 0.3, gain: 0.7, thump: 55 },
  trombone: { freq: 320, q: 5, duration: 0.12, gain: 0.45, thump: 120 },
  drumsticks: { freq: 2600, q: 2, duration: 0.04, gain: 0.35, thump: 280 },
  cymbal: { freq: 6000, q: 0.5, duration: 0.45, gain: 0.55, thump: 90 },
  trumpet: { freq: 880, q: 6, duration: 0.1, gain: 0.45, thump: 200 },
  fanfare: { freq: 660, q: 4, duration: 0.25, gain: 0.6, thump: 120 },
  reed: { freq: 1200, q: 6, duration: 0.08, gain: 0.4, thump: 220 },
  piccolo: { freq: 3000, q: 8, duration: 0.04, gain: 0.3, thump: 350 },
  violin: { freq: 1400, q: 7, duration: 0.06, gain: 0.32, thump: 260 },
  pizzicato: { freq: 700, q: 6, duration: 0.12, gain: 0.45, thump: 150 },
  viola: { freq: 900, q: 7, duration: 0.08, gain: 0.36, thump: 220 },
  tremolo: { freq: 1100, q: 8, duration: 0.03, gain: 0.25, thump: 300 },
  cello: { freq: 330, q: 6, duration: 0.18, gain: 0.55, thump: 90 },
  spiccato: { freq: 520, q: 6, duration: 0.08, gain: 0.45, thump: 130 },
  doublebass: { freq: 110, q: 4, duration: 0.4, gain: 0.85, thump: 45 },
  slap: { freq: 160, q: 2, duration: 0.12, gain: 0.6, thump: 70 },
  note: { freq: 990, q: 8, duration: 0.3, gain: 0.55, thump: 130 },
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

  /** The TARDIS dematerializing: a wheezing "vworp, vworp" over a low grinding hum. */
  tardis(volume: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise || volume <= 0.01) return;
    const t = ctx.currentTime;
    const len = 2.4;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 6;
    // Three rising-and-falling wheezes.
    for (let i = 0; i < 3; i++) {
      filter.frequency.setValueAtTime(300, t + i * 0.8);
      filter.frequency.exponentialRampToValueAtTime(1400, t + i * 0.8 + 0.45);
      filter.frequency.exponentialRampToValueAtTime(300, t + i * 0.8 + 0.8);
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.7 * volume, t + 0.3);
    gain.gain.setValueAtTime(0.7 * volume, t + len - 0.6);
    gain.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + len);
    const hum = ctx.createOscillator();
    hum.type = "sawtooth";
    hum.frequency.setValueAtTime(70, t);
    hum.frequency.linearRampToValueAtTime(55, t + len);
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.001, t);
    hg.gain.exponentialRampToValueAtTime(0.12 * volume, t + 0.3);
    hg.gain.exponentialRampToValueAtTime(0.001, t + len);
    hum.connect(hg).connect(this.master);
    hum.start(t);
    hum.stop(t + len);
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
