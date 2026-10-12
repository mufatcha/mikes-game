import {
  SAFE_ZONE_MAX_TIME,
  SAFE_ZONE_MAX_VISITS,
  SAFE_ZONE_VISIT_WINDOW,
  TEAM_COLORS,
  teamNamesFor,
  winScoreFor,
  type GameMode,
  type Team,
} from "@/shared/constants";
import {
  DECOR,
  HALLS,
  MAP_HEIGHT,
  MAP_WIDTH,
  ROOMS,
  SAFE_ZONE,
  SCHOOL_TABLES,
  WALLS,
  inSafeZone,
  type Decor,
  type FloorPattern,
  type Room,
  type WallKind,
} from "@/shared/map";
import type { BulletSnap, GameEvent, PlayerSnap, RosterEntry } from "@/shared/protocol";
import {
  abilitiesFor,
  EXTRA_CREDIT_RADIUS,
  PAINT_BOMB_RADIUS,
  STUDENT_LIVES,
  SUPERS,
  ARCHETYPES,
  DETENTION_RANGE,
  LECTURE_RADIUS,
  WEAPONS,
  radiusFor,
  weaponsOf,
} from "@/shared/archetypes";
import { abilitySlots } from "./layout";
import { ABILITY_ACTIONS, getKeybinds, keyLabel } from "@/lib/settings";
import type { Sfx } from "./audio";
import type { GameConnection } from "./connection";
import { drawFirstPerson } from "./firstperson";
import { drawFace } from "./skins";
import { CONE_HALF, FAR_SIGHT, FOG_SIGHT, NEAR_SIGHT, canSee, litAreasAt, sightPolygon } from "./vision";

const TEAM_TINTS = ["rgba(147,197,253,0.7)", "rgba(253,186,116,0.7)"] as const;
const PAINT_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#ec4899", "#a855f7"];
const BG = "#0b0d12";
const FOG = "rgba(4,6,10,0.86)";
const ASPHALT = "#3a3f47";
const STREET_WHITE = "#e5e7eb";
const STREET_BLUE = "#3b82f6";
const WALL_STYLES: Record<WallKind, { fill: string; top: string }> = {
  wall: { fill: "#64748b", top: "#e2e8f0" },
  desk: { fill: "#6b4f32", top: "#8a6a45" },
  table: { fill: "#5d6470", top: "#7a828f" },
  shelf: { fill: "#5a3d2b", top: "#7b5a42" },
  bleacher: { fill: "#6b5a3a", top: "#8c7750" },
  easel: { fill: "#7c5e3c", top: "#c084fc" },
  locker: { fill: "#2f5d9e", top: "#4f83c9" },
};
/** World area that fits on screen; bigger screens zoom in rather than see more. */
const VIEW_AREA = 1500 * 860;
const HEARING_RANGE = 1600;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  born: number;
}

interface FeedEntry {
  killer: RosterEntry | undefined;
  /** Shown instead of a player name when nobody got the kill. */
  killerLabel?: string;
  victim: RosterEntry | undefined;
  weapon: string;
  born: number;
}

export interface ViewInput {
  mouseX: number;
  mouseY: number;
  aim: number;
  /** 3D view: looking up (positive) or down, in radians. */
  pitch: number;
  scoreboard: boolean;
  /** Off on touch screens, where you aim with a thumbstick instead. */
  crosshair: boolean;
}

function lerp(a: number, b: number, f: number) {
  return a + (b - a) * f;
}

function lerpAngle(a: number, b: number, f: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * f;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private cw = 0;
  private ch = 0;
  private dpr = 1;
  private scale = 1;
  private camX = MAP_WIDTH / 2;
  private camY = MAP_HEIGHT / 2;
  private myX = MAP_WIDTH / 2;
  private myY = MAP_HEIGHT / 2;
  private lastFrame = 0;

  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private feed: FeedEntry[] = [];
  private muzzle = new Map<string, number>();
  private hitMarkerUntil = 0;
  private hurtFlash = 0;
  private shake = 0;
  /** Shown while we wait to respawn. */
  private deathMessage: string | null = null;
  private passedOut = false;
  private patterns = new Map<FloorPattern, CanvasPattern | null>();
  private killBanner: { text: string; until: number } | null = null;
  /** Offscreen layer for the line-of-sight darkness. */
  private fog = document.createElement("canvas");
  private fogCtx = this.fog.getContext("2d")!;

  constructor(
    private canvas: HTMLCanvasElement,
    private conn: GameConnection,
    private sfx: Sfx,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.resize();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cw = this.canvas.clientWidth;
    this.ch = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.cw * this.dpr);
    this.canvas.height = Math.round(this.ch * this.dpr);
    this.fog.width = this.canvas.width;
    this.fog.height = this.canvas.height;
    this.scale = Math.sqrt((this.cw * this.ch) / VIEW_AREA);
  }

  /** Where our player is on screen; the aim angle is measured from here. */
  aimFrom(mouseX: number, mouseY: number) {
    const sx = (this.myX - this.camX) * this.scale + this.cw / 2;
    const sy = (this.myY - this.camY) * this.scale + this.ch / 2;
    return Math.atan2(mouseY - sy, mouseX - sx);
  }

  /** Update the camera from our predicted position. Call before sampling aim. */
  updateCamera(now: number, mouseX: number, mouseY: number) {
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;

    const c = this.conn.correction;
    const decay = Math.exp(-dt * 12);
    c.x *= decay;
    c.y *= decay;

    const predicted = this.conn.predicted;
    if (predicted) {
      this.myX = predicted.x + c.x;
      this.myY = predicted.y + c.y;
    } else {
      const me = this.interpolatedPlayers(now).find((p) => p.id === this.conn.myId);
      if (me) {
        this.myX = me.x;
        this.myY = me.y;
      }
    }

    const lookX = Math.max(-1, Math.min(1, (mouseX - this.cw / 2) / (this.cw / 2)));
    const lookY = Math.max(-1, Math.min(1, (mouseY - this.ch / 2) / (this.ch / 2)));
    this.camX = this.myX + (lookX * this.cw * 0.18) / this.scale;
    this.camY = this.myY + (lookY * this.ch * 0.18) / this.scale;
    return dt;
  }

  draw(now: number, dt: number, view: ViewInput) {
    const { ctx } = this;
    const roster = new Map((this.conn.room?.roster ?? []).map((r) => [r.id, r]));
    const renderTick = this.conn.renderTick(now);
    const myId = this.conn.myId;
    const me = this.conn.me;

    this.processEvents(
      this.conn.takeEvents(renderTick, (e) => (e.k === "shot" || e.k === "hit") && e.by === myId),
      roster,
      now,
    );

    const players = this.interpolatedPlayers(now);
    const bullets = this.interpolatedBullets(renderTick);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, this.cw, this.ch);

    // World space.
    this.shake *= Math.exp(-dt * 14);
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    let revealed: PlayerSnap[] = [];
    if (this.view3d) {
      // First person: the 3D view replaces the top-down world; the HUD below stays the same.
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const seen = drawFirstPerson({
        ctx,
        w: this.cw,
        h: this.ch,
        x: this.myX,
        y: this.myY,
        yaw: view.aim,
        pitch: view.pitch,
        shakeX: sx,
        shakeY: sy,
        players,
        bullets,
        roster,
        myId,
        now,
        fogOfWar: this.mode === "fog",
        reveal: !!me?.reveal,
        detentionTarget: this.detentionTarget,
        alive: !!me?.alive,
      });
      this.targetable = seen;
      // The Intercom also marks every student on the minimap, as in the top-down view.
      const myTeam = roster.get(myId ?? "")?.team;
      revealed = me?.reveal ? players.filter((p) => p.alive && roster.get(p.id)?.team !== myTeam) : [];
      this.updateParticles(0);
    } else {
      const s = this.scale * this.dpr;
      ctx.setTransform(
        s,
        0,
        0,
        s,
        this.dpr * (this.cw / 2 - this.camX * this.scale + sx),
        this.dpr * (this.ch / 2 - this.camY * this.scale + sy),
      );
      this.drawFloor();
      this.drawBullets(bullets);
      // Teammates always show; enemies only when you can actually see them.
      const myTeam = roster.get(myId ?? "")?.team;
      const shown = players.filter(
        (p) =>
          p.alive &&
          (!me ||
            p.id === myId ||
            roster.get(p.id)?.team === myTeam ||
            canSee(this.myX, this.myY, view.aim, p.x, p.y, radiusFor(p.archetype), this.mode === "fog")),
      );
      // The Principal's Intercom shows every student, even through walls.
      revealed = me?.reveal ? players.filter((p) => p.alive && !shown.includes(p)) : [];
      this.targetable = [...shown, ...revealed].filter((p) => roster.get(p.id)?.team !== myTeam);
      for (const p of shown) {
        const isMe = p.id === myId;
        const pos = isMe ? { x: this.myX, y: this.myY } : p;
        this.drawPlayer(p, pos.x, pos.y, isMe ? view.aim : p.aim, roster.get(p.id), isMe, now);
      }
      this.updateParticles(dt);
      this.drawShockwaves(now);
      this.drawWalls();
      if (me) this.drawFog(view.aim);
      for (const p of revealed) {
        ctx.globalAlpha = 0.85;
        this.drawPlayer(p, p.x, p.y, p.aim, roster.get(p.id), false, now);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "rgba(248,113,113,0.9)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radiusFor(p.archetype) + 10, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const p of [...shown, ...revealed]) {
        const isMe = p.id === myId;
        this.drawNameplate(p, isMe ? this.myX : p.x, isMe ? this.myY : p.y, roster.get(p.id), isMe);
      }
      this.drawDetentionTarget(players, now);
      this.drawFloaters(now);
    }

    // Screen space.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawHurtVignette(dt);
    this.drawMinimap(players, roster, revealed, view.aim);
    if (this.mode === "boss") this.drawBossBar(players, roster);
    else this.drawScore();
    this.drawFeed(now);
    if (me) this.drawStatus(me, !view.crosshair);
    if (me?.cds) this.drawAbilityBar(me, !view.crosshair);
    else if (me && SUPERS[me.archetype]) this.drawSuperMeter(me, !view.crosshair);
    this.drawBanner(now);
    if (view.scoreboard) this.drawScoreboard(roster);
    if (view.crosshair) this.drawCrosshair(view.mouseX, view.mouseY, now, me);
  }

  private get mode(): GameMode {
    return this.conn.room?.mode ?? "teams";
  }

  /** The host picked the 3D first-person view for this match. */
  private get view3d(): boolean {
    return !!this.conn.room?.view3d;
  }

  // ---------------------------------------------------------------- Principal

  /** Set by the game view while the Principal does a Detention skill check. */
  detentionTarget: string | null = null;
  /** Enemies on screen last frame, for picking a Detention target. */
  private targetable: PlayerSnap[] = [];
  private shockwaves: { x: number; y: number; born: number; color: string; radius: number }[] = [];
  private banner: { text: string; color: string; until: number } | null = null;

  /**
   * The student to send to detention: the one you can see closest to the
   * cursor (or, on a touch screen, closest to where you're aiming), within range.
   */
  pickDetentionTarget(mouseX: number, mouseY: number, aim: number, touch: boolean): string | null {
    const wx = this.camX + (mouseX - this.cw / 2) / this.scale;
    const wy = this.camY + (mouseY - this.ch / 2) / this.scale;
    let best: string | null = null;
    let bestScore = Infinity;
    for (const p of this.targetable) {
      if (!p.alive || p.jailed > 0) continue;
      const d = Math.hypot(p.x - this.myX, p.y - this.myY);
      if (d > DETENTION_RANGE) continue;
      let score: number;
      // In 3D (and on touch screens) pick whoever is closest to straight ahead.
      if (touch || this.view3d) {
        let diff = Math.atan2(p.y - this.myY, p.x - this.myX) - aim;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        score = Math.abs(diff) * 400 + d * 0.2;
      } else {
        score = Math.hypot(p.x - wx, p.y - wy);
      }
      if (score < bestScore) {
        bestScore = score;
        best = p.id;
      }
    }
    return best;
  }

  private drawDetentionTarget(players: PlayerSnap[], now: number) {
    const p = this.detentionTarget ? players.find((q) => q.id === this.detentionTarget) : undefined;
    if (!p) return;
    const { ctx } = this;
    const r = radiusFor(p.archetype) + 14 + Math.sin(now / 80) * 3;
    ctx.strokeStyle = "#f87171";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.moveTo(p.x + Math.cos(a) * (r - 8), p.y + Math.sin(a) * (r - 8));
      ctx.lineTo(p.x + Math.cos(a) * (r + 8), p.y + Math.sin(a) * (r + 8));
    }
    ctx.stroke();
  }

  /** Expanding rings from a Stern Lecture. */
  private drawShockwaves(now: number) {
    const { ctx } = this;
    this.shockwaves = this.shockwaves.filter((w) => now - w.born < 500);
    for (const w of this.shockwaves) {
      const f = (now - w.born) / 500;
      ctx.strokeStyle = `rgba(${w.color},${0.8 * (1 - f)})`;
      ctx.lineWidth = 8 * (1 - f) + 2;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.radius * (0.2 + 0.8 * f), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private showBanner(text: string, color: string, ms: number) {
    this.banner = { text, color, until: performance.now() + ms };
  }

  private drawBanner(now: number) {
    if (!this.banner || now > this.banner.until) return;
    const { ctx } = this;
    ctx.font = "800 16px ui-sans-serif, system-ui, sans-serif";
    const w = ctx.measureText(this.banner.text).width + 32;
    this.panel(this.cw / 2 - w / 2, 128, w, 34);
    this.text(this.banner.text, this.cw / 2, 145, 16, this.banner.color, "center", 800);
  }

  /** Boss mode: the Principal's health bar and the clock, in place of the score. */
  private drawBossBar(players: PlayerSnap[], roster: Map<string, RosterEntry>) {
    const snap = this.conn.latest;
    if (!snap) return;
    const boss = snap.players.find((p) => p.archetype === "principal") ?? players.find((p) => p.archetype === "principal");
    const { ctx, cw } = this;
    const w = Math.min(520, cw - 420);
    const x = cw / 2 - w / 2;
    this.panel(x, 12, w, 62);
    const name = boss ? (roster.get(boss.id)?.name ?? "Principal") : "Principal";
    this.text(`👔 ${name.toUpperCase()}`, x + 14, 28, 12, "#fdba74", "left", 800);
    this.text(formatTime(snap.timeLeft), x + w - 14, 28, 14, "#e5e7eb", "right", 800);
    const frac = boss ? Math.max(0, boss.hp / boss.maxHp) : 0;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x + 14, 40, w - 28, 16);
    ctx.fillStyle = frac > 0.5 ? "#f97316" : frac > 0.25 ? "#facc15" : "#ef4444";
    ctx.fillRect(x + 14, 40, (w - 28) * frac, 16);
    this.text(boss ? `${boss.hp} / ${boss.maxHp}` : "", cw / 2, 48, 11, "#f9fafb", "center", 800);
    const left = snap.players.filter((p) => p.archetype !== "principal" && (p.alive || (p.lives ?? 1) > 0)).length;
    this.text(`Students left: ${left} · knockouts: ${snap.scores[1]}`, cw / 2, 66, 10, "#9ca3af", "center", 600);
  }

  /** Your super's charge, above the weapon panel; it glows when ready. */
  private drawSuperMeter(me: PlayerSnap, touch: boolean) {
    const def = SUPERS[me.archetype];
    if (!def) return;
    const { ctx, cw, ch } = this;
    const x = cw - 276;
    const y = ch - 76 - 36;
    const w = 260;
    const ready = me.sup >= 1;
    this.panel(x, y, w, 30);
    if (ready) {
      const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 150);
      ctx.strokeStyle = `rgba(251,191,36,${pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 1, w - 2, 28, 8);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x + 12, y + 20, w - 24, 5);
    ctx.fillStyle = ready ? "#fbbf24" : "#a16207";
    ctx.fillRect(x + 12, y + 20, (w - 24) * Math.min(1, me.sup), 5);
    this.text(`${def.emoji} ${def.name.toUpperCase()}`, x + 12, y + 10, 11, ready ? "#fde68a" : "#9ca3af", "left", 800);
    const key = touch ? "⭐" : keyLabel(getKeybinds().super);
    this.text(
      ready ? `READY · ${key}` : `${Math.floor(me.sup * 100)}%`,
      x + w - 12,
      y + 10,
      11,
      ready ? "#fde68a" : "#6b7280",
      "right",
      800,
    );
  }

  /** The Principal's four abilities with their keys and cooldowns. */
  private drawAbilityBar(me: PlayerSnap, touch: boolean) {
    const { ctx } = this;
    const binds = getKeybinds();
    const slots = abilitySlots(this.cw, this.ch);
    abilitiesFor(this.mode).forEach((a, i) => {
      const s = slots[i];
      const cd = me.cds?.[i] ?? 0;
      const ready = cd <= 0 && me.alive && !me.stunned;
      this.panel(s.x, s.y, s.w, s.h);
      if (ready) {
        ctx.strokeStyle = "rgba(251,191,36,0.8)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(s.x + 1, s.y + 1, s.w - 2, s.h - 2, 8);
        ctx.stroke();
      }
      ctx.globalAlpha = ready ? 1 : 0.4;
      this.text(a.emoji, s.x + s.w / 2, s.y + 24, 24, "#fff", "center", 400);
      ctx.globalAlpha = 1;
      if (cd > 0) this.text(`${Math.ceil(cd)}`, s.x + s.w / 2, s.y + 24, 18, "#f9fafb", "center", 800);
      const label = touch ? a.name.split(" ").pop()! : keyLabel(binds[ABILITY_ACTIONS[i]]);
      this.text(label, s.x + s.w / 2, s.y + s.h - 9, 10, "#d1d5db", "center", 700);
    });
  }

  /**
   * Darken everything you can't see: you see a little way all around you and
   * far in a cone where you're aiming, and walls block both.
   */
  private drawFog(aim: number) {
    const f = this.fogCtx;
    const { width, height } = this.fog;
    const x = this.myX;
    const y = this.myY;
    f.globalCompositeOperation = "source-over";
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.clearRect(0, 0, width, height);
    f.fillStyle = FOG;
    f.fillRect(0, 0, width, height);

    // Cut the visible area out of the fog, in world space.
    f.setTransform(this.ctx.getTransform());
    f.globalCompositeOperation = "destination-out";
    const fogMode = this.mode === "fog";
    // The room or hallways you're in, a little past the edges so their walls are lit too.
    f.fillStyle = "#000";
    for (const a of litAreasAt(x, y, fogMode)) f.fillRect(a.x - 12, a.y - 12, a.w + 24, a.h + 24);
    f.save();
    f.beginPath();
    for (const [px, py] of sightPolygon(x, y, fogMode ? FOG_SIGHT + 20 : undefined)) f.lineTo(px, py);
    f.closePath();
    f.clip();

    // Fog of War: just a soft circle around you, no cone.
    const near = fogMode ? FOG_SIGHT : NEAR_SIGHT;
    const ring = f.createRadialGradient(x, y, near * (fogMode ? 0.7 : 0.55), x, y, near);
    ring.addColorStop(0, "#000");
    ring.addColorStop(1, "rgba(0,0,0,0)");
    f.fillStyle = ring;
    f.beginPath();
    f.arc(x, y, near, 0, Math.PI * 2);
    f.fill();

    // The cone, with softened sides and a fade at the far end.
    const cone = f.createRadialGradient(x, y, 0, x, y, FAR_SIGHT);
    cone.addColorStop(0, "#000");
    cone.addColorStop(0.8, "#000");
    cone.addColorStop(1, "rgba(0,0,0,0)");
    f.fillStyle = cone;
    for (const [extra, alpha] of fogMode
      ? []
      : [
          [0, 1],
          [0.05, 0.5],
          [0.1, 0.25],
        ]) {
      f.globalAlpha = alpha;
      f.beginPath();
      f.moveTo(x, y);
      f.arc(x, y, FAR_SIGHT, aim - CONE_HALF - extra, aim + CONE_HALF + extra);
      f.closePath();
      f.fill();
    }
    f.globalAlpha = 1;
    f.restore();

    const { ctx } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.fog, 0, 0);
    ctx.restore();
  }

  // ---------------------------------------------------------------- state

  private interpolatedPlayers(now: number): PlayerSnap[] {
    const br = this.conn.bracket(this.conn.renderTick(now));
    if (!br) return [];
    const { a, b, f } = br;
    if (a === b) return b.players;
    const prev = new Map(a.players.map((p) => [p.id, p]));
    return b.players.map((pb) => {
      const pa = prev.get(pb.id);
      // Don't slide a player across the map when they respawn.
      if (!pa || !pa.alive || !pb.alive) return pb;
      return { ...pb, x: lerp(pa.x, pb.x, f), y: lerp(pa.y, pb.y, f), aim: lerpAngle(pa.aim, pb.aim, f) };
    });
  }

  private interpolatedBullets(tick: number): BulletSnap[] {
    const br = this.conn.bracket(tick);
    if (!br) return [];
    const { a, b, f } = br;
    if (a === b) return b.bullets;
    const prev = new Map(a.bullets.map((x) => [x.id, x]));
    const out: BulletSnap[] = [];
    for (const bb of b.bullets) {
      const ba = prev.get(bb.id);
      if (ba) out.push({ ...bb, x: lerp(ba.x, bb.x, f), y: lerp(ba.y, bb.y, f) });
    }
    return out;
  }

  private processEvents(events: GameEvent[], roster: Map<string, RosterEntry>, now: number) {
    const myId = this.conn.myId;
    for (const e of events) {
      switch (e.k) {
        case "shot": {
          this.muzzle.set(e.by, now + 60);
          const shooter = this.conn.latest?.players.find((p) => p.id === e.by);
          const dist = shooter ? Math.hypot(shooter.x - this.myX, shooter.y - this.myY) : 0;
          this.sfx.shot(e.weapon, e.by === myId ? 0.8 : Math.max(0, 1 - dist / HEARING_RANGE) * 0.6);
          if (e.by === myId) this.shake = Math.max(this.shake, WEAPONS[e.weapon].damage > 40 ? 6 : 2);
          break;
        }
        case "impact":
          this.burst(e.x, e.y, "#cbd5e1", 4, 120);
          break;
        case "hit": {
          const target = roster.get(e.target);
          this.burst(e.x, e.y, target ? TEAM_COLORS[target.team] : "#fff", 6, 160);
          if (e.by === myId) {
            this.hitMarkerUntil = now + 150;
            this.floaters.push({ x: e.x, y: e.y - 10, text: String(e.dmg), born: now });
            this.sfx.hit();
          }
          if (e.target === myId) {
            this.hurtFlash = Math.min(1, this.hurtFlash + e.dmg / 50);
            this.shake = Math.max(this.shake, 5);
            this.sfx.hurt();
          }
          break;
        }
        case "kill": {
          this.feed.push({
            killer: roster.get(e.killer),
            victim: roster.get(e.victim),
            weapon: WEAPONS[e.weapon].name,
            born: now,
          });
          if (this.feed.length > 6) this.feed.shift();
          if (e.killer === myId) {
            this.killBanner = { text: `Eliminated ${roster.get(e.victim)?.name ?? ""}`, until: now + 1800 };
            this.sfx.kill();
          }
          if (e.victim === myId) {
            const killer = roster.get(e.killer)?.name;
            this.deathMessage = killer ? `Eliminated by ${killer}` : "Eliminated";
            this.passedOut = false;
          }
          const victim = this.conn.latest?.players.find((p) => p.id === e.victim);
          const team = roster.get(e.victim)?.team;
          if (victim && team !== undefined) this.burst(victim.x, victim.y, TEAM_COLORS[team], 22, 260);
          break;
        }
        case "super": {
          const def = Object.values(SUPERS).find((s) => s?.id === e.super);
          const mine = e.by === myId;
          const dist = Math.hypot(e.x - this.myX, e.y - this.myY);
          const vol = mine ? 0.9 : Math.max(0, 1 - dist / HEARING_RANGE);
          this.burst(e.x, e.y, "#fde68a", 26, 300);
          if (e.super === "paintbomb") {
            this.shockwaves.push({ x: e.x, y: e.y, born: now, color: "236,72,153", radius: PAINT_BOMB_RADIUS });
            for (const c of PAINT_COLORS) this.burst(e.x, e.y, c, 8, 380);
            this.sfx.shot("paintbomb", vol);
          } else if (e.super === "extracredit") {
            this.shockwaves.push({ x: e.x, y: e.y, born: now, color: "74,222,128", radius: EXTRA_CREDIT_RADIUS });
            this.sfx.shot("lecture", vol * 0.6);
          } else if (e.super === "dash") {
            this.burst(e.x, e.y, "#dc2626", 20, 260);
            this.sfx.shot("tackle", vol);
          } else if (e.super === "overclock") {
            this.burst(e.x, e.y, "#22d3ee", 24, 260);
            this.sfx.shot("redpen", vol);
          }
          if (mine) {
            this.shake = Math.max(this.shake, 6);
            if (def) this.showBanner(`${def.emoji} ${def.name.toUpperCase()}!`, "#fde68a", 1500);
          }
          break;
        }
        case "jailed": {
          this.feed.push({
            killer: roster.get(e.by),
            victim: roster.get(e.target),
            weapon: `🔒 detention ${e.secs}s`,
            born: now,
          });
          if (this.feed.length > 6) this.feed.shift();
          if (e.target === myId) {
            this.showBanner(`🔒 Sent to detention for ${e.secs} seconds!`, "#f87171", 3000);
            this.sfx.hurt();
          } else if (e.by === myId) {
            this.showBanner(`🔒 ${roster.get(e.target)?.name ?? "Student"} is in detention for ${e.secs}s`, "#fde68a", 2500);
            this.sfx.kill();
          }
          break;
        }
        case "ability": {
          const mine = e.by === myId;
          if (e.ability === "lecture") {
            this.shockwaves.push({ x: e.x, y: e.y, born: now, color: "251,191,36", radius: LECTURE_RADIUS });
            const dist = Math.hypot(e.x - this.myX, e.y - this.myY);
            this.sfx.shot("lecture", mine ? 0.9 : Math.max(0, 1 - dist / HEARING_RANGE));
            if (dist < LECTURE_RADIUS + 60) this.shake = Math.max(this.shake, 8);
          } else if (e.ability === "intercom") {
            this.showBanner(
              mine ? "📢 Intercom: you can see every student" : "📢 INTERCOM: The Principal can see everyone!",
              mine ? "#fde68a" : "#f87171",
              4000,
            );
          } else if (e.ability === "hallpass") {
            // The dash happened on the server; puff where they left from.
            this.burst(e.x, e.y, "#e2e8f0", 18, 220);
          } else if (e.ability === "staffmeeting") {
            this.burst(e.x, e.y, "#fde047", 20, 200);
            if (mine) this.showBanner("🛡️ Staff Meeting: nothing can hurt you", "#fde68a", 2000);
          }
          break;
        }
        case "passout": {
          // A prank knockout stays secret: no feed entry, just a puzzled victim.
          if (e.reason === "prank") {
            if (e.victim === myId) {
              this.deathMessage = "👻 You mysteriously fainted…";
              this.passedOut = false;
            }
            break;
          }
          this.feed.push({
            killer: undefined,
            killerLabel: "🏥 Nurse's Office",
            victim: roster.get(e.victim),
            weapon: e.reason === "visits" ? "kept running in and out" : "stayed too long",
            born: now,
          });
          if (this.feed.length > 6) this.feed.shift();
          if (e.victim === myId) {
            this.deathMessage =
              e.reason === "visits"
                ? "You passed out running in and out of the Nurse's Office"
                : "You passed out in the Nurse's Office";
            this.passedOut = true;
          }
          break;
        }
      }
    }
  }

  private burst(x: number, y: number, color: string, count: number, speed: number) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      const life = 0.2 + Math.random() * 0.3;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life,
        maxLife: life,
        color,
        size: 2 + Math.random() * 2.5,
      });
    }
  }

  // ---------------------------------------------------------------- world

  private drawFloor() {
    const { ctx } = this;
    // Everything outside the rooms is asphalt.
    ctx.fillStyle = ASPHALT;
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    for (const hall of HALLS) this.drawStreet(hall);
    this.drawCrosswalks();

    // Rooms: patterned floors and a painted label.
    for (const room of ROOMS) {
      ctx.fillStyle = this.floorPattern(room) ?? room.floor;
      ctx.fillRect(room.x, room.y, room.w, room.h);
      if (room.pattern === "court") this.drawCourtLines(room);

      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.font = `900 44px ui-sans-serif, system-ui, sans-serif, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;
      ctx.fillText(`${ARCHETYPES[room.archetype].emoji} ${room.name.toUpperCase()}`, room.label.x, room.label.y);
      ctx.restore();
    }

    for (const d of DECOR) this.drawDecor(d);
    this.drawSafeZone();

    // Outer school wall.
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 10;
    ctx.strokeRect(-5, -5, MAP_WIDTH + 10, MAP_HEIGHT + 10);
  }

  private floorPattern(room: Room) {
    if (!this.patterns.has(room.pattern)) {
      this.patterns.set(room.pattern, this.ctx.createPattern(makeFloorTile(room.pattern, room.floor), "repeat"));
    }
    return this.patterns.get(room.pattern);
  }

  /** Basketball court markings on the gym floor. */
  private drawCourtLines(room: Room) {
    const { ctx } = this;
    const x0 = room.x + 60;
    const x1 = room.x + room.w - 60;
    const y0 = room.y + 150;
    const y1 = room.y + room.h - 40;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    ctx.fillStyle = "rgba(59,130,246,0.18)";
    ctx.fillRect(x0, cy - 80, 140, 160);
    ctx.fillRect(x1 - 140, cy - 80, 140, 160);
    ctx.strokeStyle = "rgba(226,232,240,0.28)";
    ctx.lineWidth = 4;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeRect(x0, cy - 80, 140, 160);
    ctx.strokeRect(x1 - 140, cy - 80, 140, 160);
    ctx.beginPath();
    ctx.moveTo(cx, y0);
    ctx.lineTo(cx, y1);
    ctx.moveTo(cx + 70, cy);
    ctx.arc(cx, cy, 70, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawDecor(d: Decor) {
    const { ctx } = this;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(d.x + 3, d.y + 4, d.w, d.h);
    ctx.fillStyle = d.kind === "bench" ? "#64748b" : "#475569";
    ctx.beginPath();
    ctx.roundRect(d.x, d.y, d.w, d.h, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#94a3b8";
    if (d.kind === "bench") ctx.fillRect(d.x + 2, d.y + 2, d.w - 4, 3);
    else ctx.fillRect(d.x + 2, d.y + d.h - 6, d.w - 4, 5); // chair back
  }

  private drawSafeZone() {
    const { ctx } = this;
    const z = SAFE_ZONE;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 350);
    const cx = z.x + z.w / 2;
    const cy = z.y + z.h / 2;
    ctx.fillStyle = `rgba(34,197,94,${0.12 + 0.08 * pulse})`;
    ctx.fillRect(z.x, z.y, z.w, z.h);
    ctx.setLineDash([16, 10]);
    ctx.strokeStyle = "#86efac";
    ctx.lineWidth = 4;
    ctx.strokeRect(z.x, z.y, z.w, z.h);
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(cx, cy, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(cx - 8, cy - 24, 16, 48);
    ctx.fillRect(cx - 24, cy - 8, 48, 16);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "800 16px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(z.name.toUpperCase(), cx, z.y + 18);
    ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText(`Heals · no throwing · ${SAFE_ZONE_MAX_TIME}s max`, cx, z.y + z.h - 16);
  }

  /** Road markings: blue edge lines and a dashed white center line. */
  private drawStreet(hall: { x: number; y: number; w: number; h: number }) {
    const { ctx } = this;
    const horizontal = hall.w > hall.h;
    const inset = 34;
    ctx.lineWidth = 6;
    ctx.strokeStyle = STREET_BLUE;
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(hall.x, hall.y + inset);
      ctx.lineTo(hall.x + hall.w, hall.y + inset);
      ctx.moveTo(hall.x, hall.y + hall.h - inset);
      ctx.lineTo(hall.x + hall.w, hall.y + hall.h - inset);
    } else {
      ctx.moveTo(hall.x + inset, hall.y);
      ctx.lineTo(hall.x + inset, hall.y + hall.h);
      ctx.moveTo(hall.x + hall.w - inset, hall.y);
      ctx.lineTo(hall.x + hall.w - inset, hall.y + hall.h);
    }
    ctx.stroke();

    ctx.setLineDash([40, 30]);
    ctx.strokeStyle = STREET_WHITE;
    ctx.lineWidth = 5;
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(hall.x, hall.y + hall.h / 2);
      ctx.lineTo(hall.x + hall.w, hall.y + hall.h / 2);
    } else {
      ctx.moveTo(hall.x + hall.w / 2, hall.y);
      ctx.lineTo(hall.x + hall.w / 2, hall.y + hall.h);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** Zebra crossings where each cross hall meets the main hall. */
  private drawCrosswalks() {
    const { ctx } = this;
    const main = HALLS[0];
    ctx.fillStyle = STREET_WHITE;
    for (const hall of HALLS.slice(1)) {
      const atTop = hall.y < main.y;
      const y0 = atTop ? main.y - 60 : main.y + main.h + 10;
      for (let x = hall.x + 14; x + 16 <= hall.x + hall.w - 10; x += 30) ctx.fillRect(x, y0, 16, 50);
    }
  }

  private drawWalls() {
    const { ctx } = this;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    for (const w of WALLS) ctx.fillRect(w.x + 5, w.y + 7, w.w, w.h);
    for (const w of WALLS) {
      const style = WALL_STYLES[w.kind];
      ctx.fillStyle = style.fill;
      ctx.fillRect(w.x, w.y, w.w, w.h);
      if (w.kind === "locker") {
        this.drawLockerDoors(w);
        continue;
      }
      ctx.fillStyle = style.top;
      ctx.fillRect(w.x, w.y, w.w, Math.min(5, w.h / 3));
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 2;
      ctx.strokeRect(w.x + 1, w.y + 1, w.w - 2, w.h - 2);
    }
    for (const t of SCHOOL_TABLES) this.drawSchoolTable(t);
  }

  /** A rival school's logo and name painted on a lunch table. */
  private drawSchoolTable(t: (typeof SCHOOL_TABLES)[number]) {
    const { ctx } = this;
    const cx = t.x + 28;
    const cy = t.y + t.h / 2 + 2;
    if (t.school === "blueberries") this.drawBlueberryLogo(cx, cy, 16);
    else this.drawOrangePeelLogo(cx, cy, 17);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "900 15px ui-sans-serif, system-ui, sans-serif";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.fillStyle = t.school === "blueberries" ? "#93c5fd" : "#fdba74";
    const name = t.school === "blueberries" ? "BLUEBERRIES" : "ORANGE PEELS";
    ctx.strokeText(name, t.x + 52, cy);
    ctx.fillText(name, t.x + 52, cy);
  }

  private drawLogoFace(cx: number, cy: number, r: number) {
    const { ctx } = this;
    for (const side of [-1, 1]) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(cx + side * r * 0.35, cy - r * 0.1, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(cx + side * r * 0.35, cy - r * 0.05, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.15, r * 0.35, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
  }

  /** A round blueberry with its little crown on top and a smiling face. */
  private drawBlueberryLogo(cx: number, cy: number, r: number) {
    const { ctx } = this;
    ctx.fillStyle = "#3b5bdb";
    ctx.strokeStyle = "#1e2a78";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.45, cy - r * 0.45, r * 0.22, r * 0.14, -0.7, 0, Math.PI * 2);
    ctx.fill();
    // Crown: a small five-pointed star at the top.
    ctx.fillStyle = "#1e2a78";
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? r * 0.32 : r * 0.13;
      const px = cx + Math.cos(a) * rr;
      const py = cy - r * 0.68 + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    this.drawLogoFace(cx, cy + r * 0.12, r);
  }

  /** A pile of curly orange peels with a smiling face on the front peel. */
  private drawOrangePeelLogo(cx: number, cy: number, r: number) {
    const { ctx } = this;
    ctx.lineCap = "round";
    // Curls in the back of the pile.
    for (const [dx, dy, rot] of [
      [-r * 0.55, -r * 0.35, -0.5],
      [r * 0.55, -r * 0.4, 0.6],
      [0, -r * 0.7, 0],
    ]) {
      ctx.save();
      ctx.translate(cx + dx, cy + dy);
      ctx.rotate(rot);
      ctx.strokeStyle = "#c2410c";
      ctx.lineWidth = r * 0.42;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.4, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      ctx.strokeStyle = "#f97316";
      ctx.lineWidth = r * 0.3;
      ctx.stroke();
      ctx.strokeStyle = "#fde68a";
      ctx.lineWidth = r * 0.08;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.28, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      ctx.restore();
    }
    // Front peel that wears the face.
    ctx.fillStyle = "#fb923c";
    ctx.strokeStyle = "#c2410c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.2, r * 0.95, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#fde68a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.2, r * 0.95, r * 0.7, 0, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    ctx.fillStyle = "rgba(194,65,12,0.6)";
    for (const [dx, dy] of [[-0.7, 0.1], [0.72, 0.05], [-0.5, 0.55], [0.55, 0.5]]) {
      ctx.fillRect(cx + dx * r - 1, cy + dy * r - 1, 2, 2);
    }
    this.drawLogoFace(cx, cy + r * 0.2, r * 0.8);
  }

  /** Individual locker doors with a vent slot, along the strip's long side. */
  private drawLockerDoors(w: { x: number; y: number; w: number; h: number }) {
    const { ctx } = this;
    const horizontal = w.w >= w.h;
    const len = horizontal ? w.w : w.h;
    const depth = horizontal ? w.h : w.w;
    const door = 22;
    ctx.strokeStyle = "#1e3a63";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let d = door; d < len; d += door) {
      if (horizontal) {
        ctx.moveTo(w.x + d, w.y);
        ctx.lineTo(w.x + d, w.y + w.h);
      } else {
        ctx.moveTo(w.x, w.y + d);
        ctx.lineTo(w.x + w.w, w.y + d);
      }
    }
    ctx.stroke();
    ctx.fillStyle = "#cbd5e1";
    for (let d = 0; d + door <= len; d += door) {
      const c = d + door / 2;
      if (horizontal) ctx.fillRect(w.x + c - 5, w.y + depth / 2 - 1, 10, 2);
      else ctx.fillRect(w.x + depth / 2 - 1, w.y + c - 5, 2, 10);
    }
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 2;
    ctx.strokeRect(w.x + 1, w.y + 1, w.w - 2, w.h - 2);
  }

  private drawBullets(bullets: BulletSnap[]) {
    const { ctx } = this;
    ctx.lineCap = "round";
    for (const b of bullets) {
      const w = WEAPONS[b.w];
      const color = w.color === "rainbow" ? PAINT_COLORS[b.id % PAINT_COLORS.length] : w.color;
      if (w.style === "streak") {
        const len = Math.hypot(b.vx, b.vy) || 1;
        const tail = Math.min(24, len * 0.014);
        ctx.strokeStyle = color;
        ctx.lineWidth = w.radius + 1.5;
        ctx.beginPath();
        ctx.moveTo(b.x - (b.vx / len) * tail, b.y - (b.vy / len) * tail);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, w.style === "blob" ? w.radius * 1.2 : w.radius, 0, Math.PI * 2);
        ctx.fill();
        if (w.radius >= 5) {
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.beginPath();
          ctx.arc(b.x - w.radius * 0.35, b.y - w.radius * 0.35, w.radius * 0.35, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Thin team-colored outline so you can tell whose shot it is.
      ctx.strokeStyle = TEAM_TINTS[b.team];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(b.x, b.y, w.radius + 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.lineCap = "butt";
  }

  private drawPlayer(
    p: PlayerSnap,
    x: number,
    y: number,
    aim: number,
    info: RosterEntry | undefined,
    isMe: boolean,
    now: number,
  ) {
    const { ctx } = this;
    const team: Team = info?.team ?? 0;
    const weapon = WEAPONS[p.weapon];
    const archetype = ARCHETYPES[p.archetype];
    const r = radiusFor(p.archetype);

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.arc(x + 4, y + 6, r, 0, Math.PI * 2);
    ctx.fill();

    // Held item: a hand holding the next projectile, pointing where we aim.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(aim);
    const hx = r + Math.max(4, weapon.radius) + 1;
    ctx.fillStyle = "#f1c27d";
    ctx.beginPath();
    ctx.arc(r - 1, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = weapon.color === "rainbow" ? PAINT_COLORS[Math.floor(now / 400) % PAINT_COLORS.length] : weapon.color;
    if (weapon.style === "streak") {
      ctx.fillRect(r - 2, -2, 16, 4);
    } else {
      ctx.beginPath();
      ctx.arc(hx, 0, Math.max(3, weapon.radius), 0, Math.PI * 2);
      ctx.fill();
    }
    const flashUntil = this.muzzle.get(p.id) ?? 0;
    if (now < flashUntil) {
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.beginPath();
      ctx.arc(hx + 10, 0, 5 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Body
    ctx.fillStyle = TEAM_COLORS[team];
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Thicker ring = tougher class.
    if (archetype.defense > 0) {
      const lw = 1 + archetype.defense * 10;
      ctx.strokeStyle = "rgba(226,232,240,0.85)";
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(x, y, r - lw / 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Class skin: a cartoon face with the class's look.
    drawFace(ctx, x, y, r * 0.66, p.archetype);

    if (isMe) {
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (p.protected) {
      ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.3 * Math.sin(now / 90)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r + 8, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (p.jailed > 0) this.drawJailBars(x, y, r, p.jailed);
    if (p.shielded) {
      // Staff Meeting: a golden bubble nothing gets through.
      ctx.fillStyle = "rgba(253,224,71,0.18)";
      ctx.strokeStyle = `rgba(253,224,71,${0.7 + 0.3 * Math.sin(now / 60)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r + 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (p.boosted) {
      // Overclock: a crackling cyan ring.
      ctx.strokeStyle = `rgba(34,211,238,${0.6 + 0.4 * Math.sin(now / 40)})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 5]);
      ctx.lineDashOffset = -now / 20;
      ctx.beginPath();
      ctx.arc(x, y, r + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (p.stunned) {
      // Little stars circling the head.
      ctx.font = `${r * 0.7}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
      for (let i = 0; i < 3; i++) {
        const a = now / 200 + (i * Math.PI * 2) / 3;
        ctx.fillText("⭐", x + Math.cos(a) * (r + 6), y - r * 0.6 + Math.sin(a) * 6);
      }
    }
  }

  /** A detention cage around a locked-up student, with the time left. */
  private drawJailBars(x: number, y: number, r: number, secs: number) {
    const { ctx } = this;
    const half = r + 12;
    ctx.fillStyle = "rgba(15,23,42,0.35)";
    ctx.fillRect(x - half, y - half, half * 2, half * 2);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 3;
    ctx.strokeRect(x - half, y - half, half * 2, half * 2);
    ctx.beginPath();
    for (let i = 1; i < 5; i++) {
      const bx = x - half + (i * half * 2) / 5;
      ctx.moveTo(bx, y - half);
      ctx.lineTo(bx, y + half);
    }
    ctx.stroke();
    const k = 1 / this.scale;
    ctx.font = `800 ${12 * k}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#fca5a5";
    ctx.fillText(`🔒 ${Math.ceil(secs)}s`, x, y + half + 3);
  }

  private drawNameplate(p: PlayerSnap, x: number, y: number, info: RosterEntry | undefined, isMe: boolean) {
    const { ctx } = this;
    const k = 1 / this.scale;
    const team: Team = info?.team ?? 0;
    const top = y - radiusFor(p.archetype) - 14 * k;
    const bw = (p.archetype === "principal" ? 70 : 44) * k;
    const bh = 5 * k;
    const frac = p.hp / p.maxHp;

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x - bw / 2, top, bw, bh);
    ctx.fillStyle = frac > 0.5 ? "#4ade80" : frac > 0.25 ? "#facc15" : "#ef4444";
    ctx.fillRect(x - bw / 2, top, bw * frac, bh);

    if (!isMe && info) {
      ctx.font = `600 ${12 * k}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      const label = info.level > 1 && p.archetype !== "principal" ? `${info.name} · Lv ${info.level}` : info.name;
      ctx.fillText(label, x + k, top - 3 * k + k);
      ctx.fillStyle = team === 0 ? "#bfdbfe" : "#fed7aa";
      ctx.fillText(label, x, top - 3 * k);
    }
  }

  private updateParticles(dt: number) {
    const { ctx } = this;
    const alive: Particle[] = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.9;
      p.vy *= 0.9;
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      alive.push(p);
    }
    ctx.globalAlpha = 1;
    this.particles = alive;
  }

  private drawFloaters(now: number) {
    const { ctx } = this;
    const k = 1 / this.scale;
    ctx.font = `800 ${15 * k}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    this.floaters = this.floaters.filter((f) => now - f.born < 700);
    for (const f of this.floaters) {
      const age = (now - f.born) / 700;
      ctx.globalAlpha = 1 - age;
      ctx.fillStyle = "#000";
      ctx.fillText(f.text, f.x + k, f.y - age * 40 + k);
      ctx.fillStyle = "#fef08a";
      ctx.fillText(f.text, f.x, f.y - age * 40);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- HUD

  private panel(x: number, y: number, w: number, h: number) {
    const { ctx } = this;
    ctx.fillStyle = "rgba(10,12,18,0.72)";
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private text(
    str: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align: CanvasTextAlign = "left",
    weight = 600,
  ) {
    const { ctx } = this;
    ctx.font = `${weight} ${size}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  private drawScore() {
    const snap = this.conn.latest;
    if (!snap) return;
    const cx = this.cw / 2;
    this.panel(cx - 140, 12, 280, 56);
    this.text(String(snap.scores[0]), cx - 85, 40, 28, TEAM_COLORS[0], "center", 800);
    this.text(String(snap.scores[1]), cx + 85, 40, 28, TEAM_COLORS[1], "center", 800);
    this.text(formatTime(snap.timeLeft), cx, 34, 18, "#e5e7eb", "center", 700);
    this.text(`FIRST TO ${winScoreFor(this.mode)}`, cx, 54, 10, "#9ca3af", "center", 600);
  }

  private drawFeed(now: number) {
    this.feed = this.feed.filter((f) => now - f.born < 6000);
    let y = 24;
    for (const f of this.feed) {
      const { ctx } = this;
      ctx.font = "600 13px ui-sans-serif, system-ui, sans-serif";
      const killer = f.killer?.name ?? f.killerLabel ?? "?";
      const victim = f.victim?.name ?? "?";
      const weapon = `  [${f.weapon}]  `;
      const wk = ctx.measureText(killer).width;
      const ww = ctx.measureText(weapon).width;
      const wv = ctx.measureText(victim).width;
      const total = wk + ww + wv + 20;
      const x = this.cw - 16 - total;
      this.panel(x, y - 12, total, 24);
      let cx = x + 10;
      this.text(killer, cx, y, 13, f.killer ? TEAM_COLORS[f.killer.team] : "#fff");
      cx += wk;
      this.text(weapon, cx, y, 13, "#9ca3af");
      cx += ww;
      this.text(victim, cx, y, 13, f.victim ? TEAM_COLORS[f.victim.team] : "#fff");
      y += 30;
    }
  }

  private drawStatus(me: PlayerSnap, touch: boolean) {
    const binds = getKeybinds();
    const { ctx, cw, ch } = this;
    const weapon = WEAPONS[me.weapon];

    // Health
    this.panel(16, ch - 76, 260, 60);
    const arch = ARCHETYPES[me.archetype];
    this.text(`${arch.emoji} ${arch.name.toUpperCase()}${arch.defense > 0 ? ` · ${Math.round(arch.defense * 100)}% DEF` : ""}`, 30, ch - 60, 11, "#9ca3af");
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(30, ch - 46, 180, 14);
    const hpFrac = me.hp / me.maxHp;
    ctx.fillStyle = hpFrac > 0.5 ? "#4ade80" : hpFrac > 0.25 ? "#facc15" : "#ef4444";
    ctx.fillRect(30, ch - 46, 180 * hpFrac, 14);
    this.text(String(me.hp), 262, ch - 39, 22, "#f9fafb", "right", 800);
    if (me.lives !== undefined) {
      // 7v1 lives as hearts.
      this.text("❤".repeat(me.lives) + "♡".repeat(Math.max(0, STUDENT_LIVES - me.lives)), 262, ch - 60, 13, "#f87171", "right", 800);
    }

    // Weapon
    this.panel(cw - 276, ch - 76, 260, 60);
    this.text(weapon.name.toUpperCase(), cw - 262, ch - 60, 11, "#9ca3af");
    const low = me.ammo <= Math.ceil(weapon.magSize * 0.25);
    this.text(`${me.ammo}`, cw - 262, ch - 36, 26, low ? "#f87171" : "#f9fafb", "left", 800);
    ctx.font = "800 26px ui-sans-serif, system-ui, sans-serif";
    const aw = ctx.measureText(`${me.ammo}`).width;
    this.text(`/ ${weapon.magSize}`, cw - 258 + aw, ch - 33, 14, "#9ca3af");
    const slots = weaponsOf(me.archetype);
    slots.forEach((id, i) => {
      const active = me.slot === i;
      this.text(
        `${i + 1} ${WEAPONS[id].name}`,
        cw - 30,
        ch - 58 + i * 18,
        11,
        active ? "#f9fafb" : "#6b7280",
        "right",
        active ? 700 : 500,
      );
    });
    if (me.reload >= 0) {
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.fillRect(cw - 262, ch - 22, 232, 4);
      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(cw - 262, ch - 22, 232 * Math.min(1, me.reload), 4);
    }

    // Center messages
    if (!me.alive) {
      this.panel(cw / 2 - 190, ch / 2 - 60, 380, 96);
      this.text(this.deathMessage ?? "Eliminated", cw / 2, ch / 2 - 32, 16, "#f87171", "center", 700);
      if (me.lives === 0) {
        // 7v1: out of lives, watching the rest of the match.
        this.text("Out of lives!", cw / 2, ch / 2 - 4, 20, "#f9fafb", "center", 800);
        this.text("Spectating until the match ends", cw / 2, ch / 2 + 22, 12, "#9ca3af", "center");
      } else {
        const lives = me.lives !== undefined ? ` · ${me.lives} ${me.lives === 1 ? "life" : "lives"} left` : "";
        this.text(
          `Respawning in ${me.respawn.toFixed(1)}${this.passedOut ? " · half health" : ""}${lives}`,
          cw / 2,
          ch / 2 - 4,
          20,
          "#f9fafb",
          "center",
          800,
        );
        this.text(touch ? "Tap ☰ to change class" : `Press ${keyLabel(binds.loadout)} to change class`, cw / 2, ch / 2 + 22, 12, "#9ca3af", "center");
      }
    } else {
      this.deathMessage = null;
      this.passedOut = false;
      if (me.archetype !== "principal") this.drawZoneTimer(me);
      if (me.jailed > 0) {
        this.panel(cw / 2 - 170, ch / 2 - 110, 340, 56);
        this.text(`🔒 IN DETENTION · ${Math.ceil(me.jailed)}s`, cw / 2, ch / 2 - 92, 18, "#f87171", "center", 800);
        this.text("You can't move or throw, but nobody can hurt you.", cw / 2, ch / 2 - 68, 11, "#9ca3af", "center");
      } else if (me.stunned) {
        this.text("😵 STUNNED", cw / 2, ch / 2 - 70, 16, "#fbbf24", "center", 800);
      }
      if (me.reload >= 0) this.text("RELOADING", cw / 2, ch / 2 + 70, 13, "#fbbf24", "center", 700);
      else if (me.ammo === 0) this.text(touch ? "TAP ↻ TO RELOAD" : `PRESS ${keyLabel(binds.reload)} TO RELOAD`, cw / 2, ch / 2 + 70, 13, "#f87171", "center", 700);
    }
    if (this.killBanner && performance.now() < this.killBanner.until) {
      this.text(this.killBanner.text, cw / 2, 100, 16, "#fde68a", "center", 800);
    }
  }

  /**
   * While in (or recently in) the Nurse's Office, show how long until you pass
   * out, and how many more times you can go in before running in and out knocks you out.
   */
  private drawZoneTimer(me: PlayerSnap) {
    const inside = inSafeZone(this.myX, this.myY);
    if (!inside && me.zone <= 0 && me.visits === 0) return;
    const { ctx, cw, ch } = this;
    const left = Math.max(0, SAFE_ZONE_MAX_TIME - me.zone);
    const frac = me.zone / SAFE_ZONE_MAX_TIME;
    const danger = left < 10;
    const w = 320;
    const x = cw / 2 - w / 2;
    const showVisits = me.visits > 0;
    const y = ch - (showVisits ? 148 : 130);
    this.panel(x, y, w, showVisits ? 64 : 46);
    if (showVisits) {
      const lastChance = me.visits >= SAFE_ZONE_MAX_VISITS - 1;
      this.text(
        lastChance
          ? `Visit ${me.visits}/${SAFE_ZONE_MAX_VISITS} · go back in within ${SAFE_ZONE_VISIT_WINDOW}s and you pass out`
          : `Visit ${me.visits}/${SAFE_ZONE_MAX_VISITS} · don't keep running in and out`,
        cw / 2,
        y + 52,
        11,
        lastChance ? "#f87171" : "#facc15",
        "center",
        700,
      );
    }
    this.text(
      inside ? "🏥 NURSE'S OFFICE · healing, can't throw" : "🏥 Nurse's Office timer cooling down",
      cw / 2,
      y + 14,
      11,
      inside ? "#86efac" : "#9ca3af",
      "center",
      700,
    );
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(x + 14, y + 28, w - 70, 8);
    ctx.fillStyle = danger ? "#ef4444" : frac > 0.5 ? "#facc15" : "#4ade80";
    ctx.fillRect(x + 14, y + 28, (w - 70) * Math.min(1, frac), 8);
    this.text(`${Math.ceil(left)}s`, x + w - 14, y + 32, 13, danger ? "#f87171" : "#f9fafb", "right", 800);
  }

  private drawMinimap(players: PlayerSnap[], roster: Map<string, RosterEntry>, revealed: PlayerSnap[], aim: number) {
    const { ctx } = this;
    const w = 180;
    const h = (w * MAP_HEIGHT) / MAP_WIDTH;
    const x0 = 16;
    const y0 = 16;
    const k = w / MAP_WIDTH;
    this.panel(x0 - 4, y0 - 4, w + 8, h + 8);
    ctx.fillStyle = "#1f2430";
    ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = "#4a5468";
    for (const wall of WALLS) ctx.fillRect(x0 + wall.x * k, y0 + wall.y * k, wall.w * k, wall.h * k);
    ctx.fillStyle = "rgba(74,222,128,0.6)";
    ctx.fillRect(x0 + SAFE_ZONE.x * k, y0 + SAFE_ZONE.y * k, SAFE_ZONE.w * k, SAFE_ZONE.h * k);
    const myTeam = roster.get(this.conn.myId ?? "")?.team;
    for (const p of players) {
      const info = roster.get(p.id);
      if (!p.alive || !info || info.team !== myTeam || p.id === this.conn.myId) continue;
      ctx.fillStyle = TEAM_COLORS[info.team];
      ctx.beginPath();
      ctx.arc(x0 + p.x * k, y0 + p.y * k, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Intercom: every student shows up in red.
    ctx.fillStyle = "#f87171";
    for (const p of revealed) {
      ctx.beginPath();
      ctx.arc(x0 + p.x * k, y0 + p.y * k, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x0 + this.myX * k, y0 + this.myY * k, 3.5, 0, Math.PI * 2);
    ctx.fill();
    if (this.view3d) {
      // First person: show which way you're facing.
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0 + this.myX * k, y0 + this.myY * k);
      ctx.lineTo(x0 + this.myX * k + Math.cos(aim) * 12, y0 + this.myY * k + Math.sin(aim) * 12);
      ctx.stroke();
    }
  }

  private drawScoreboard(roster: Map<string, RosterEntry>) {
    const snap = this.conn.latest;
    if (!snap) return;
    const w = Math.min(720, this.cw - 32);
    const colW = w / 2;
    const x0 = (this.cw - w) / 2;
    const y0 = 110;
    const maxRows = Math.max(4, ...([0, 1] as Team[]).map((t) => snap.players.filter((p) => roster.get(p.id)?.team === t).length));
    this.panel(x0, y0, w, 80 + maxRows * 44);
    const names = teamNamesFor(this.mode);
    for (const team of [0, 1] as Team[]) {
      const cx = x0 + team * colW + 20;
      this.text(`${names[team].toUpperCase()}  ${snap.scores[team]}`, cx, y0 + 24, 16, TEAM_COLORS[team], "left", 800);
      this.text("K", cx + colW - 90, y0 + 24, 12, "#9ca3af", "right");
      this.text("D", cx + colW - 50, y0 + 24, 12, "#9ca3af", "right");
      const rows = snap.players
        .filter((p) => roster.get(p.id)?.team === team)
        .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      rows.forEach((p, i) => {
        const y = y0 + 60 + i * 44;
        const info = roster.get(p.id)!;
        const isMe = p.id === this.conn.myId;
        if (isMe) {
          this.ctx.fillStyle = "rgba(255,255,255,0.06)";
          this.ctx.fillRect(cx - 10, y - 18, colW - 20, 36);
        }
        this.text(info.name, cx, y - 5, 14, isMe ? "#fff" : "#e5e7eb", "left", isMe ? 700 : 500);
        this.text(
          `${ARCHETYPES[p.archetype].emoji} ${ARCHETYPES[p.archetype].name}`,
          cx,
          y + 11,
          10,
          "#6b7280",
        );
        this.text(String(p.kills), cx + colW - 90, y, 14, "#f9fafb", "right", 700);
        this.text(String(p.deaths), cx + colW - 50, y, 14, "#9ca3af", "right");
      });
    }
  }

  private drawHurtVignette(dt: number) {
    if (this.hurtFlash <= 0.01) return;
    const { ctx, cw, ch } = this;
    const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.3, cw / 2, ch / 2, Math.max(cw, ch) * 0.7);
    g.addColorStop(0, "rgba(239,68,68,0)");
    g.addColorStop(1, `rgba(239,68,68,${0.45 * this.hurtFlash})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
    this.hurtFlash *= Math.exp(-dt * 3);
  }

  private drawCrosshair(x: number, y: number, now: number, me: PlayerSnap | undefined) {
    const { ctx } = this;
    const spread = me ? WEAPONS[me.weapon].spread : 0.04;
    const dist = Math.hypot(x - this.cw / 2, y - this.ch / 2);
    const gap = 5 + Math.min(30, spread * Math.max(120, dist) * 0.6);
    ctx.strokeStyle = "#f9fafb";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      ctx.moveTo(x + dx * gap, y + dy * gap);
      ctx.lineTo(x + dx * (gap + 8), y + dy * (gap + 8));
    }
    ctx.stroke();
    ctx.fillStyle = "#f9fafb";
    ctx.fillRect(x - 1, y - 1, 2, 2);

    if (now < this.hitMarkerUntil) {
      ctx.strokeStyle = "#fde68a";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (const [dx, dy] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ]) {
        ctx.moveTo(x + dx * 6, y + dy * 6);
        ctx.lineTo(x + dx * 13, y + dy * 13);
      }
      ctx.stroke();
    }
  }
}

/** Small repeating tile for a room's floor pattern, in the blue/white/grey palette. */
function makeFloorTile(kind: FloorPattern, base: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  const size = (w: number, h: number) => {
    c.width = w;
    c.height = h;
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
  };
  switch (kind) {
    case "court": {
      // Staggered floorboards.
      size(160, 80);
      g.strokeStyle = "rgba(0,0,0,0.25)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, 1);
      g.lineTo(160, 1);
      g.moveTo(0, 41);
      g.lineTo(160, 41);
      g.moveTo(1, 0);
      g.lineTo(1, 40);
      g.moveTo(81, 40);
      g.lineTo(81, 80);
      g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.04)";
      g.beginPath();
      for (const y of [14, 27, 54, 67]) {
        g.moveTo(8, y);
        g.lineTo(150, y);
      }
      g.stroke();
      break;
    }
    case "carpet": {
      // Diamond carpet.
      size(48, 48);
      g.strokeStyle = "rgba(147,197,253,0.13)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(24, 4);
      g.lineTo(44, 24);
      g.lineTo(24, 44);
      g.lineTo(4, 24);
      g.closePath();
      g.stroke();
      g.fillStyle = "rgba(255,255,255,0.1)";
      g.fillRect(22, 22, 4, 4);
      break;
    }
    case "checker": {
      size(100, 100);
      g.fillStyle = "rgba(148,163,184,0.1)";
      g.fillRect(0, 0, 50, 50);
      g.fillRect(50, 50, 50, 50);
      break;
    }
    case "tiles": {
      // Big cafeteria tiles with grout lines.
      size(140, 140);
      g.fillStyle = "rgba(226,232,240,0.09)";
      g.fillRect(0, 0, 70, 70);
      g.fillRect(70, 70, 70, 70);
      g.strokeStyle = "rgba(0,0,0,0.25)";
      g.lineWidth = 2;
      for (const [x, y] of [[1, 1], [71, 71], [71, 1], [1, 71]]) g.strokeRect(x, y, 69, 69);
      break;
    }
    case "stripes": {
      size(40, 40);
      g.strokeStyle = "rgba(148,163,184,0.09)";
      g.lineWidth = 10;
      g.beginPath();
      for (const o of [-40, 0, 40]) {
        g.moveTo(o, 40);
        g.lineTo(o + 40, 0);
      }
      g.stroke();
      break;
    }
    case "splatter": {
      // Paint drips; seeded so every client draws the same thing.
      size(160, 160);
      let seed = 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const colors = ["rgba(96,165,250,0.16)", "rgba(226,232,240,0.1)", "rgba(148,163,184,0.12)", "rgba(59,130,246,0.14)"];
      for (let i = 0; i < 12; i++) {
        g.fillStyle = colors[i % colors.length];
        g.beginPath();
        g.arc(rnd() * 160, rnd() * 160, 2 + rnd() * 9, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
  }
  return c;
}
