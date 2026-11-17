/**
 * The dangers of the open sea, worst out in the Tempest Reach:
 *  - weather: clear, rain, fog and storms (rougher waves, lightning strikes),
 *    which change every few minutes and turn foul more often in the Reach;
 *  - sirens on rocks in the Reach: their song drags your ship toward them and
 *    lures your crew overboard until you blast them;
 *  - the Gnashjaw, a sea serpent that hunts ships in the Reach, surfacing to
 *    lash out and diving again;
 *  - Mount Cindermaw, the volcano, which erupts and rains fire around itself.
 */
import type { Sim, Ball } from "./sim";
import { VOLCANO, hillProfile, inReach, islandAt, waveState, REACH_X, REACH_EAST, WORLD_HALF, STORMWALL } from "./world";

export type WeatherKind = "clear" | "rain" | "fog" | "storm";

export interface Siren {
  id: number;
  x: number;
  z: number;
  hp: number;
  /** Back on her rock at this time after being driven off. */
  respawnAt: number;
  /** Singing to you right now. */
  singing: boolean;
}

export interface Monster {
  x: number;
  z: number;
  heading: number;
  hp: number;
  maxHp: number;
  /** Hunting below, up and attacking, or diving away. */
  state: "hunt" | "surface" | "dive" | "dead";
  timer: number;
  /** 0 (under) .. 1 (fully up), for the picture. */
  rise: number;
  respawnAt: number;
}

const SIREN_HP = 260;
const SIREN_SONG = 750;
const SIREN_LURE = 450;
const MONSTER_HP = 2600;
const MONSTER_SIGHT = 2600;
const MONSTER_REACH = 240;
const ERUPT_RANGE = 3600;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Where the sirens' rocks are: open water in the Reach, clear of islands. */
function placeSirens(): Siren[] {
  const r = rng(9137);
  const out: Siren[] = [];
  for (let tries = 0; out.length < 9 && tries < 2000; tries++) {
    const x = REACH_X + STORMWALL + 1200 + r() * (REACH_EAST - REACH_X - STORMWALL - 2400);
    const z = (r() * 2 - 1) * (WORLD_HALF - 1200);
    if (islandAt(x, z, 700)) continue;
    if (out.some((s) => Math.hypot(s.x - x, s.z - z) < 2500)) continue;
    out.push({ id: out.length, x, z, hp: SIREN_HP, respawnAt: 0, singing: false });
  }
  return out;
}

export class Hazards {
  weather: WeatherKind = "clear";
  /** How strongly the weather has set in, 0..1 (it fades in and out). */
  weatherAmount = 0;
  private weatherUntil = 120;
  private nextStrike = 0;
  sirens = placeSirens();
  private nextLure = 0;
  monster: Monster = { x: REACH_X + 6000, z: 3000, heading: 0, hp: MONSTER_HP, maxHp: MONSTER_HP, state: "hunt", timer: 0, rise: 0, respawnAt: 0 };
  private nextErupt = 20;
  private warned = false;

  constructor(private sim: Sim) {}

  step(dt: number) {
    this.updateWeather(dt);
    this.updateSirens(dt);
    this.updateMonster(dt);
    this.updateVolcano();
  }

  // ---------------------------------------------------------------- weather

  private updateWeather(dt: number) {
    const sim = this.sim;
    const t = sim.time;
    if (t > this.weatherUntil) {
      const reach = inReach(sim.player.x);
      const roll = Math.random();
      // The Reach is foul far more often.
      const odds = reach ? { storm: 0.32, rain: 0.25, fog: 0.15 } : { storm: 0.08, rain: 0.2, fog: 0.12 };
      this.weather = roll < odds.storm ? "storm" : roll < odds.storm + odds.rain ? "rain" : roll < odds.storm + odds.rain + odds.fog ? "fog" : "clear";
      this.weatherUntil = t + 90 + Math.random() * 120;
      if (this.weather !== "clear") sim.events.push({ k: "weather", kind: this.weather });
    }
    const want = this.weather === "clear" ? 0 : 1;
    this.weatherAmount += Math.sign(want - this.weatherAmount) * Math.min(Math.abs(want - this.weatherAmount), dt / 8);
    // Storms whip the sea up.
    waveState.scale = 1 + (this.weather === "storm" ? 0.9 : this.weather === "rain" ? 0.25 : 0) * this.weatherAmount;
    // Lightning, now and then, sometimes right on a ship.
    if (this.weather === "storm" && this.weatherAmount > 0.6 && t > this.nextStrike) {
      this.nextStrike = t + 5 + Math.random() * 8;
      const p = sim.player;
      const a = Math.random() * Math.PI * 2;
      const d = 150 + Math.random() * 900;
      let x = p.x + Math.cos(a) * d;
      let z = p.z + Math.sin(a) * d;
      // One strike in five finds a mast.
      const ship = Math.random() < 0.2 ? sim.ships[Math.floor(Math.random() * sim.ships.length)] : null;
      if (ship && ship.sinking < 0 && Math.hypot(ship.x - p.x, ship.z - p.z) < 1500) {
        x = ship.x;
        z = ship.z;
        sim.strikeShip(ship, 45);
      }
      sim.events.push({ k: "lightning", x, z });
    }
  }

  /** Fog and storms hide you from far-off Marines. */
  get sightScale() {
    return this.weather === "fog" || this.weather === "storm" ? 1 - 0.45 * this.weatherAmount : 1;
  }

  // ---------------------------------------------------------------- sirens

  private updateSirens(dt: number) {
    const sim = this.sim;
    const p = sim.player;
    const t = sim.time;
    let pull: Siren | null = null;
    for (const s of this.sirens) {
      if (s.hp <= 0) {
        if (t > s.respawnAt) s.hp = SIREN_HP;
        s.singing = false;
        continue;
      }
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      const singing = sim.mode === "ship" && p.sinking < 0 && d < SIREN_SONG;
      if (singing && !s.singing) sim.events.push({ k: "sirenSong", x: s.x, z: s.z });
      s.singing = singing;
      if (singing && (!pull || d < Math.hypot(pull.x - p.x, pull.z - p.z))) pull = s;
    }
    if (!pull) return;
    const d = Math.hypot(pull.x - p.x, pull.z - p.z);
    // Her song drags you in: your ship drifts toward the rock.
    const strength = (1 - d / SIREN_SONG) * 55;
    p.x += ((pull.x - p.x) / d) * strength * dt;
    p.z += ((pull.z - p.z) / d) * strength * dt;
    // Close in, she lures your crew over the side one by one.
    if (d < SIREN_LURE && t > this.nextLure && sim.save.crew > 0) {
      this.nextLure = t + 6;
      sim.save.crew--;
      sim.refreshPlayerStats();
      sim.events.push({ k: "lured" });
    }
    // Run onto her rock and it tears the hull.
    if (d < 70) sim.strikeShip(p, 18 * dt, true);
  }

  // ---------------------------------------------------------------- the Gnashjaw

  private updateMonster(dt: number) {
    const sim = this.sim;
    const m = this.monster;
    const p = sim.player;
    const t = sim.time;
    if (m.state === "dead") {
      m.rise = Math.max(0, m.rise - dt);
      if (t > m.respawnAt) Object.assign(m, { state: "hunt", hp: MONSTER_HP, x: REACH_X + 6000 + Math.random() * 5000, z: (Math.random() * 2 - 1) * 8000 });
      return;
    }
    const d = Math.hypot(p.x - m.x, p.z - m.z);
    const prey = sim.mode === "ship" && p.sinking < 0 && inReach(p.x) && d < MONSTER_SIGHT;
    m.timer -= dt;
    if (m.state === "hunt") {
      m.rise = Math.max(0, m.rise - dt);
      if (prey) {
        // Swims fast under the water, straight for you.
        m.heading = Math.atan2(p.z - m.z, p.x - m.x);
        const step = Math.min(d - 160, 130 * dt);
        if (step > 0) {
          m.x += Math.cos(m.heading) * step;
          m.z += Math.sin(m.heading) * step;
        }
        if (d < 320) {
          m.state = "surface";
          m.timer = 7;
          sim.events.push({ k: "monster", what: "surface", x: m.x, z: m.z });
        }
      } else {
        // Wanders the deep.
        m.heading += (Math.random() - 0.5) * dt;
        const nx = m.x + Math.cos(m.heading) * 40 * dt;
        if (inReach(nx)) m.x = nx;
        m.z = Math.max(-WORLD_HALF + 800, Math.min(WORLD_HALF - 800, m.z + Math.sin(m.heading) * 40 * dt));
      }
      return;
    }
    if (m.state === "surface") {
      m.rise = Math.min(1, m.rise + dt * 1.5);
      m.heading = Math.atan2(p.z - m.z, p.x - m.x);
      // Every couple of seconds, a lash of its tail.
      if (m.rise >= 1 && Math.floor((m.timer + dt) / 2) !== Math.floor(m.timer / 2) && prey && d < MONSTER_REACH + p.cls.length * 0.4) {
        sim.strikeShip(p, 70);
        sim.events.push({ k: "monster", what: "lash", x: p.x, z: p.z });
      }
      if (m.timer <= 0) {
        m.state = "dive";
        m.timer = 4;
      }
      return;
    }
    // Diving: down, then hunting again somewhere else.
    m.rise = Math.max(0, m.rise - dt * 0.8);
    m.x += Math.cos(m.heading + Math.PI) * 80 * dt;
    m.z += Math.sin(m.heading + Math.PI) * 80 * dt;
    if (m.timer <= 0) m.state = "hunt";
  }

  // ---------------------------------------------------------------- Mount Cindermaw

  private updateVolcano() {
    const sim = this.sim;
    const t = sim.time;
    const me = sim.mode === "foot" && sim.shore.hero ? sim.shore.hero : sim.player;
    const d = Math.hypot(me.x - VOLCANO.x, me.z - VOLCANO.z);
    if (d > ERUPT_RANGE) {
      this.warned = false;
      return;
    }
    // A rumble first, then fire.
    if (!this.warned && t > this.nextErupt - 3) {
      this.warned = true;
      sim.events.push({ k: "rumble" });
    }
    if (t < this.nextErupt) return;
    this.nextErupt = t + 22 + Math.random() * 14;
    this.warned = false;
    const top = hillProfile(VOLCANO.hill.h, VOLCANO.hill.r, 0);
    sim.events.push({ k: "eruption", x: VOLCANO.x, z: VOLCANO.z });
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2;
      // Some land near you, the rest all around the island.
      const near = i < 3;
      const tx = near ? me.x + (Math.random() - 0.5) * 220 : VOLCANO.x + Math.cos(a) * (VOLCANO.radius * 0.4 + Math.random() * (VOLCANO.radius + 700));
      const tz = near ? me.z + (Math.random() - 0.5) * 220 : VOLCANO.z + Math.sin(a) * (VOLCANO.radius * 0.4 + Math.random() * (VOLCANO.radius + 700));
      sim.lobFire(VOLCANO.hill.x, top + 10, VOLCANO.hill.z, tx, tz);
    }
  }

  // ---------------------------------------------------------------- your shots

  /** Your cannonball hitting a siren or the serpent. Returns true if it hit. */
  hitByBall(b: Ball) {
    const sim = this.sim;
    if (b.y > 60) return false;
    for (const s of this.sirens) {
      if (s.hp <= 0 || Math.hypot(b.x - s.x, b.z - s.z) > 34) continue;
      s.hp -= b.damage;
      sim.events.push({ k: "hit", x: b.x, y: b.y, z: b.z, onPlayer: false, byPlayer: true, damage: b.damage });
      if (s.hp <= 0) {
        s.respawnAt = sim.time + 600;
        sim.addBounty(5_000_000, 150, 0);
        sim.events.push({ k: "sirenSilenced", x: s.x, z: s.z });
      }
      return true;
    }
    const m = this.monster;
    if (m.state !== "dead" && m.rise > 0.5) {
      // Its body arcs behind the head: count a hit anywhere along it.
      for (let i = 0; i < 6; i++) {
        const bx = m.x - Math.cos(m.heading) * i * 50;
        const bz = m.z - Math.sin(m.heading) * i * 50;
        if (Math.hypot(b.x - bx, b.z - bz) > 50) continue;
        m.hp -= b.damage;
        sim.events.push({ k: "hit", x: b.x, y: b.y, z: b.z, onPlayer: false, byPlayer: true, damage: b.damage });
        if (m.hp <= 0) {
          m.state = "dead";
          m.respawnAt = sim.time + 900;
          sim.addBounty(400_000_000, 5000, 0);
          sim.events.push({ k: "monster", what: "slain", x: m.x, z: m.z });
        }
        return true;
      }
    }
    return false;
  }
}
