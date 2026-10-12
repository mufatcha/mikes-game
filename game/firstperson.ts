import { EYE_HEIGHT, MAX_PITCH, THROW_HEIGHT, type Team } from "@/shared/constants";
import { MAP_HEIGHT, MAP_WIDTH, WALLS, type Wall } from "@/shared/map";
import { segmentRectHit } from "@/shared/physics";
import type { BulletSnap, PlayerSnap, RosterEntry, ZoneSnap } from "@/shared/protocol";
import { WEAPONS, radiusFor } from "@/shared/archetypes";
import {
  PPU,
  SURFACE_HEIGHT,
  TEX_UNITS,
  GLOW,
  ceilingTexel,
  floorTexel,
  wallTexture,
  wallVariant,
  type Surface,
} from "./schooltextures";
import {
  FIGURE_HEIGHT,
  drawAvatar,
  drawBall3D,
  drawSpark3D,
  drawFloorZone3D,
  drawViewModel,
  type AvatarDraw,
  type Camera3D,
} from "./avatar3d";
import { FOG_SIGHT } from "./vision";
import { instrumentOf } from "./instruments";

/**
 * First-person view (the 3D view, in any mode): a classic raycaster over the same
 * top-down map, dressed up as a school. Every few screen columns we cast a ray
 * from the player; walls, lockers and the building's outside walls become
 * textured full-height walls, shelves and furniture become shorter blocks, the
 * floor and ceiling are filled in pixel by pixel at low resolution, and players
 * are 3D figures (see avatar3d.ts) clipped against the walls in front.
 * Looking up and down shifts the horizon, so you can look every way.
 */

const FOV = (75 * Math.PI) / 180;
const MAX_VIEW = 2600;
/** Heights in world units; the camera sits at eye height, the ceiling at the top of the walls. */
/** Eye height this frame: raised while you jump or stand on something, lowered when you crouch. */
let EYE = EYE_HEIGHT;
const CEILING = 80;
const PLAYER_HEIGHT = FIGURE_HEIGHT;
/** Darkness things fade into with distance (a dim school hallway, not black). */
const HALL_FOG: [number, number, number] = [24, 24, 28];
const HALL_FOG_DIST = 2200;
/** Fog of War: thick darkness just past the circle you can see. */
const WAR_FOG: [number, number, number] = [8, 8, 12];
const WAR_FOG_DIST = FOG_SIGHT * 1.35;
/** Set per frame from the mode. */
let FOG = HALL_FOG;
let FOG_DIST = HALL_FOG_DIST;
let FOG_MAX = 0.85;
const PAINT_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#ec4899", "#a855f7"];
/** Top surfaces of furniture you can see over. */
const TOP_COLORS: Partial<Record<Surface, [number, number, number]>> = {
  table: [214, 218, 224],
  desk: [176, 136, 88],
  bleacher: [172, 148, 102],
  console: [176, 128, 62],
};

/** The outside of the building: walls just past the map edge, with windows. */
const OUTER: Wall[] = [
  { x: -40, y: -40, w: MAP_WIDTH + 80, h: 40, kind: "wall" },
  { x: -40, y: MAP_HEIGHT, w: MAP_WIDTH + 80, h: 40, kind: "wall" },
  { x: -40, y: 0, w: 40, h: MAP_HEIGHT, kind: "wall" },
  { x: MAP_WIDTH, y: 0, w: 40, h: MAP_HEIGHT, kind: "wall" },
];
const OUTER_SET = new Set(OUTER);
const ALL_WALLS = [...WALLS, ...OUTER];
const WALL_INDEX = new Map(ALL_WALLS.map((w, i) => [w, i]));
/** These reach (nearly) the ceiling and hide everything behind them. */
const FULL_HEIGHT = new Set(["wall", "locker", "clinic", "tardiswall", "tardisdoor", "rotor", "strut"]);

interface Hit {
  wall: Wall;
  surface: Surface;
  dist: number;
  /** Position along the face, in world units, for the texture. */
  u: number;
  /** Hit an x-facing side (shaded a little darker). */
  xFace: boolean;
  /** Where the ray comes out the far side, for drawing the tops of low furniture. */
  exit: number;
}

/** Fraction along the segment where it leaves the rect (it's already known to enter it). */
function exitT(x: number, y: number, ex: number, ey: number, r: Wall) {
  const dx = ex - x;
  const dy = ey - y;
  let tmax = 1;
  if (Math.abs(dx) > 1e-9) tmax = Math.min(tmax, Math.max((r.x - x) / dx, (r.x + r.w - x) / dx));
  if (Math.abs(dy) > 1e-9) tmax = Math.min(tmax, Math.max((r.y - y) / dy, (r.y + r.h - y) / dy));
  return tmax;
}

/**
 * The nearest full-height wall along a ray, and every shorter thing (desks,
 * tables, shelves…) in front of it, farthest first. You can see over short
 * things, so a desk behind another desk still shows above it.
 */
function castRay(x: number, y: number, dx: number, dy: number) {
  let tall: Hit | null = null;
  const lows: Hit[] = [];
  const ex = x + dx * MAX_VIEW;
  const ey = y + dy * MAX_VIEW;
  for (const w of ALL_WALLS) {
    const hit = segmentRectHit(x, y, ex, ey, w);
    if (!hit) continue;
    const dist = hit.t * MAX_VIEW;
    const hx = x + dx * dist;
    const hy = y + dy * dist;
    const surface: Surface = OUTER_SET.has(w) ? "outer" : w.kind;
    const h: Hit = {
      wall: w,
      surface,
      dist,
      // Run the texture left to right as seen from this side, so writing (the TARDIS
      // sign, posters) never reads backwards on the east and north faces.
      u: hit.nx !== 0 ? (hit.nx > 0 ? w.y + w.h - hy : hy - w.y) : hit.ny < 0 ? w.x + w.w - hx : hx - w.x,
      xFace: hit.nx !== 0,
      exit: exitT(x, y, ex, ey, w) * MAX_VIEW,
    };
    if (surface === "outer" || FULL_HEIGHT.has(w.kind)) {
      if (!tall || dist < tall.dist) tall = h;
    } else {
      lows.push(h);
    }
  }
  // Shorter things only matter if they're in front of the wall.
  const front = lows.filter((l) => !tall || l.dist < tall.dist).sort((a, b) => b.dist - a.dist);
  return { tall, lows: front };
}

function fogAmount(dist: number) {
  return Math.min(FOG_MAX, dist / FOG_DIST);
}

// ---------------------------------------------------------------- floor and ceiling

let surfaceBuf: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData; px: Uint32Array } | null =
  null;

/**
 * Floor and ceiling, cast pixel by pixel at a low resolution and scaled up:
 * each room's floor below, ceiling tiles and fluorescent lights above.
 */
function drawFloorAndCeiling(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  x: number,
  y: number,
  yaw: number,
  horizon: number,
  proj: number,
) {
  const q = w > 1100 ? 4 : 3;
  const bw = Math.ceil(w / q);
  const bh = Math.ceil(h / q);
  if (!surfaceBuf || surfaceBuf.img.width !== bw || surfaceBuf.img.height !== bh) {
    const canvas = document.createElement("canvas");
    canvas.width = bw;
    canvas.height = bh;
    const c = canvas.getContext("2d")!;
    const img = c.createImageData(bw, bh);
    surfaceBuf = { canvas, ctx: c, img, px: new Uint32Array(img.data.buffer) };
  }
  const { px } = surfaceBuf;
  // Per column: world direction scaled so world = eye + dir * perpendicular distance.
  const dirX = new Float32Array(bw);
  const dirY = new Float32Array(bw);
  for (let c = 0; c < bw; c++) {
    const a = Math.atan(((c + 0.5) * q - w / 2) / proj);
    dirX[c] = Math.cos(yaw + a) / Math.cos(a);
    dirY[c] = Math.sin(yaw + a) / Math.cos(a);
  }
  for (let r = 0; r < bh; r++) {
    const sy = (r + 0.5) * q;
    const below = sy > horizon;
    const span = Math.abs(sy - horizon);
    const perp = span < 0.5 ? MAX_VIEW : ((below ? EYE : CEILING - EYE) * proj) / span;
    const fog = fogAmount(perp);
    const row = r * bw;
    for (let c = 0; c < bw; c++) {
      const wx = x + dirX[c] * perp;
      const wy = y + dirY[c] * perp;
      let packed: number;
      let f = fog;
      if (below) {
        packed = floorTexel(wx, wy);
      } else {
        packed = ceilingTexel(wx, wy);
        if (packed & GLOW) f *= 0.35; // lights glow through the gloom
      }
      const red = (packed & 255) * (1 - f) + FOG[0] * f;
      const green = ((packed >> 8) & 255) * (1 - f) + FOG[1] * f;
      const blue = ((packed >> 16) & 255) * (1 - f) + FOG[2] * f;
      px[row + c] = 0xff000000 | (blue << 16) | (green << 8) | red;
    }
  }
  surfaceBuf.ctx.putImageData(surfaceBuf.img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(surfaceBuf.canvas, 0, 0, bw, bh, 0, 0, bw * q, bh * q);
}

export interface FirstPersonScene {
  ctx: CanvasRenderingContext2D;
  /** Screen size in CSS pixels. */
  w: number;
  h: number;
  x: number;
  y: number;
  yaw: number;
  /** Looking up (positive) or down, in radians. */
  pitch: number;
  /** Small screen shake, in pixels. */
  shakeX: number;
  shakeY: number;
  players: PlayerSnap[];
  bullets: BulletSnap[];
  /** Hit and impact sparks, in world space. */
  sparks: { x: number; y: number; color: string; size: number; alpha: number }[];
  /** Jam Puddles and Peel Traps on the floor. */
  zones: ZoneSnap[];
  roster: Map<string, RosterEntry>;
  myId: string | null;
  now: number;
  /** Fog of War: you only see a small circle around you. */
  fogOfWar: boolean;
  /** The Principal's Intercom: every enemy shows, even through walls. */
  reveal: boolean;
  /** Highlighted while the Principal sends them to detention. */
  detentionTarget: string | null;
  /** Alive, so your own arm shows. */
  alive: boolean;
  /** How far your eyes are above (or, crouching, below) their usual height. */
  eyeLift: number;
}

/**
 * Draw the first-person view. Returns the enemies that ended up on screen,
 * so the Principal can pick one for Detention.
 */
export function drawFirstPerson(s: FirstPersonScene): PlayerSnap[] {
  const { ctx, w, h, x, y, yaw, now } = s;
  FOG = s.fogOfWar ? WAR_FOG : HALL_FOG;
  FOG_DIST = s.fogOfWar ? WAR_FOG_DIST : HALL_FOG_DIST;
  FOG_MAX = s.fogOfWar ? 1 : 0.85;
  EYE = Math.max(12, Math.min(CEILING - 6, EYE_HEIGHT + s.eyeLift));
  const proj = w / 2 / Math.tan(FOV / 2);
  const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, s.pitch));
  const horizon = h / 2 + s.shakeY + Math.tan(pitch) * proj;
  const cam: Camera3D = { x, y, eye: EYE, yaw, w, horizon, proj, shakeX: s.shakeX };

  drawFloorAndCeiling(ctx, w, h, x, y, yaw, horizon, proj);
  // Things lying on the floor go down before the walls, so the walls hide the ones behind them.
  for (const z of s.zones) drawFloorZone3D(ctx, cam, z, fogAmount(Math.hypot(z.x - x, z.y - y)), now);

  // Walls, one textured slice per few columns, with a depth buffer for sprites.
  const step = Math.max(2, Math.ceil(w / 640));
  const cols = Math.ceil(w / step);
  const depth = new Float32Array(cols).fill(MAX_VIEW);
  /**
   * Low furniture in each column: how far away it is and the screen line it
   * reaches up to. Anything farther away is hidden below that line, so a
   * desk hides the legs of whoever is standing behind it.
   */
  const cover: { d: number; y: number }[][] = Array.from({ length: cols }, () => []);
  ctx.imageSmoothingEnabled = false;
  for (let c = 0; c < cols; c++) {
    const sx = c * step + step / 2;
    const rayAngle = yaw + Math.atan((sx - w / 2) / proj);
    const { tall, lows } = castRay(x, y, Math.cos(rayAngle), Math.sin(rayAngle));
    const fix = Math.cos(rayAngle - yaw); // undo the fish-eye
    // Back to front: the wall, then furniture from farthest to nearest.
    for (const hit of [tall, ...lows]) {
      if (!hit) continue;
      const d = Math.max(1, hit.dist * fix);
      const height = SURFACE_HEIGHT[hit.surface];
      const top = horizon - ((height - EYE) * proj) / d;
      const bottom = horizon + (EYE * proj) / d;
      const units = TEX_UNITS[hit.surface];
      const segment = Math.floor(hit.u / units);
      const variant = hit.surface === "wall" ? wallVariant(WALL_INDEX.get(hit.wall) ?? 0, segment) : "plain";
      const tex = wallTexture(hit.surface, variant);
      const texX = Math.min(tex.width - 1, Math.floor((hit.u - segment * units) * PPU));
      ctx.drawImage(tex, texX, 0, 1, tex.height, c * step, top, step, bottom - top);
      // Shade by distance, and the x-facing sides a little darker, for depth.
      const dark = fogAmount(d) + (hit.xFace ? 0.12 : 0);
      if (dark > 0.01) {
        ctx.fillStyle = `rgba(${FOG[0]},${FOG[1]},${FOG[2]},${Math.min(0.9, dark)})`;
        ctx.fillRect(c * step, top, step, bottom - top);
      }
      // Furniture below eye level: you can see its top, from the near edge to the far edge,
      // or only as far as anything tall standing on it (like the TARDIS time rotor rising
      // out of the console), which hides the rest of the top behind it.
      const topColor = TOP_COLORS[hit.surface];
      const exit = hit !== tall && tall ? Math.min(hit.exit, tall.dist) : hit.exit;
      const far = Math.max(d, exit * fix);
      const farY = horizon + ((EYE - height) * proj) / far;
      // Its outline reaches up to the far edge of its top (if you're looking down on it).
      if (hit !== tall) cover[c].push({ d, y: height < EYE ? Math.min(top, farY) : top });
      if (topColor && height < EYE) {
        if (top - farY > 0.5) {
          const fog = fogAmount((d + far) / 2);
          const [r, g, b] = topColor.map((v, i) => Math.round(v * (1 - fog) + FOG[i] * fog));
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(c * step, farY, step, top - farY);
          // A darker rim along the front edge.
          ctx.fillStyle = "rgba(0,0,0,0.25)";
          ctx.fillRect(c * step, top - Math.max(1, (1.5 * proj) / d), step, Math.max(1, (1.5 * proj) / d));
        }
      }
    }
    if (tall) depth[c] = tall.dist * fix;
    // Tall shelves hide people behind them too.
    for (const low of lows) {
      if (SURFACE_HEIGHT[low.surface] >= PLAYER_HEIGHT) depth[c] = Math.min(depth[c], low.dist * fix);
    }
  }
  ctx.imageSmoothingEnabled = true;

  // Sprites: everyone else and every throw, far to near, clipped to columns not hidden by walls.
  type Sprite = {
    px: number;
    py: number;
    dist: number;
    /** How far it reaches out sideways, in world units (arms, the ball). */
    reach: number;
    /** Shown through walls (the Intercom). */
    xray?: boolean;
    draw: () => void;
  };
  const sprites: Sprite[] = [];
  const myTeam = s.roster.get(s.myId ?? "")?.team;
  const onScreen: PlayerSnap[] = [];
  for (const p of s.players) {
    if (!p.alive || p.id === s.myId) continue;
    const info = s.roster.get(p.id);
    const team: Team = info?.team ?? 0;
    const enemy = team !== myTeam;
    const dist = Math.hypot(p.x - x, p.y - y);
    const r = radiusFor(p.archetype);
    const xray = enemy && s.reveal;
    // Fog of War hides enemies outside the little circle you can see (unless the Intercom is on).
    if (enemy && s.fogOfWar && !xray && dist > FOG_SIGHT + r) continue;
    const wpn = WEAPONS[p.weapon];
    sprites.push({
      px: p.x,
      py: p.y,
      dist,
      reach: 46 * (r / 18),
      xray,
      draw: () => {
        const at = drawAvatar(
          ctx,
          cam,
          {
            id: p.id,
            x: p.x,
            y: p.y,
            aim: p.aim,
            archetype: p.archetype,
            team,
            scale: r / 18,
            ballColor: wpn.color === "rainbow" ? PAINT_COLORS[p.ammo % PAINT_COLORS.length] : wpn.color,
            ballRadius: Math.min(6, Math.max(3, wpn.radius)),
            instrument: instrumentOf(p.weapon),
            now,
            stunned: p.stunned,
            lift: p.z ?? 0,
            crouch: !!p.crouch,
          },
          fogAmount,
          FOG,
        );
        if (!at) return;
        drawPlayerOverlay(ctx, at, p, team, info, now, xray, p.id === s.detentionTarget);
        if (enemy) onScreen.push(p);
      },
    });
  }
  for (const b of s.bullets) {
    const wpn = WEAPONS[b.w];
    const dist = Math.hypot(b.x - x, b.y - y);
    const fog = fogAmount(dist);
    if (fog >= 0.99) continue;
    sprites.push({
      px: b.x,
      py: b.y,
      dist,
      reach: Math.max(3, wpn.radius) * 1.5,
      draw: () => {
        const color = wpn.color === "rainbow" ? PAINT_COLORS[b.id % PAINT_COLORS.length] : wpn.color;
        drawBall3D(ctx, cam, b.x, b.y, b.z ?? THROW_HEIGHT, Math.max(3, wpn.radius), color, fog);
      },
    });
  }
  for (const sp of s.sparks) {
    const dist = Math.hypot(sp.x - x, sp.y - y);
    const fog = fogAmount(dist);
    if (fog >= 0.99) continue;
    sprites.push({
      px: sp.x,
      py: sp.y,
      dist,
      reach: sp.size,
      // Sparks fly out about where things get hit: chest height.
      draw: () => drawSpark3D(ctx, cam, sp.x, sp.y, THROW_HEIGHT, sp.size, sp.color, sp.alpha * (1 - fog)),
    });
  }
  sprites.sort((a, b) => b.dist - a.dist);

  for (const sp of sprites) {
    const { px, py } = sp;
    let ang = Math.atan2(py - y, px - x) - yaw;
    while (ang > Math.PI) ang -= Math.PI * 2;
    while (ang < -Math.PI) ang += Math.PI * 2;
    if (Math.abs(ang) > FOV / 2 + 0.5) continue;
    const perp = sp.dist * Math.cos(ang);
    if (perp < 8) continue;
    const cx = w / 2 + Math.tan(ang) * proj + s.shakeX;
    const k = proj / perp; // screen pixels per world unit at this distance
    const half = sp.reach * k + 40; // generous, includes name tags
    const c0 = Math.max(0, Math.floor((cx - half) / step));
    const c1 = Math.min(cols - 1, Math.ceil((cx + half) / step));
    ctx.save();
    if (sp.xray) {
      // Seen through walls: drawn over everything, a little see-through.
      ctx.globalAlpha = 0.85;
      sp.draw();
    } else {
      // Clip to the columns where this sprite is in front of the wall, and
      // above any desk or table between you and it.
      ctx.beginPath();
      let any = false;
      for (let c = c0; c <= c1; c++) {
        if (depth[c] <= perp) continue;
        let bottom = h;
        for (const cv of cover[c]) if (cv.d < perp) bottom = Math.min(bottom, cv.y);
        if (bottom <= 0) continue;
        ctx.rect(c * step, 0, step, bottom);
        any = true;
      }
      if (any) {
        ctx.clip();
        sp.draw();
      }
    }
    ctx.restore();
  }

  // Your own arm with the ball in hand, fixed on screen (it doesn't tilt as you look up and down).
  const me = s.players.find((p) => p.id === s.myId);
  if (me && s.alive) {
    const wpn = WEAPONS[me.weapon];
    drawViewModel(
      ctx,
      { ...cam, horizon: h / 2 + s.shakeY },
      {
        id: me.id,
        x,
        y,
        archetype: me.archetype,
        team: myTeam ?? 0,
        ballColor: wpn.color === "rainbow" ? PAINT_COLORS[Math.floor(now / 400) % PAINT_COLORS.length] : wpn.color,
        instrument: instrumentOf(me.weapon),
        now,
      },
    );
  }
  return onScreen;
}

/** Effects, health bar and name tag over a 3D figure. */
function drawPlayerOverlay(
  ctx: CanvasRenderingContext2D,
  at: AvatarDraw,
  p: PlayerSnap,
  team: Team,
  info: RosterEntry | undefined,
  now: number,
  xray: boolean,
  targeted: boolean,
) {
  const { cx, top, bottom, k } = at;
  const bw = radiusFor(p.archetype) * 2 * k;
  if (xray || targeted) {
    // Intercom: a red outline on students seen through walls. Detention: pulsing corner brackets.
    const pad = targeted ? 8 + Math.sin(now / 80) * 3 : 4;
    const x0 = cx - bw / 2 - pad;
    const x1 = cx + bw / 2 + pad;
    const y0 = top - pad;
    const y1 = bottom + pad;
    ctx.strokeStyle = targeted ? "#f87171" : "rgba(248,113,113,0.9)";
    ctx.lineWidth = targeted ? 3 : 2;
    if (targeted) {
      const l = Math.min(14, (x1 - x0) / 3);
      ctx.beginPath();
      for (const [px, py, dx, dy] of [
        [x0, y0, 1, 1],
        [x1, y0, -1, 1],
        [x0, y1, 1, -1],
        [x1, y1, -1, -1],
      ]) {
        ctx.moveTo(px + dx * l, py);
        ctx.lineTo(px, py);
        ctx.lineTo(px, py + dy * l);
      }
      ctx.stroke();
    } else {
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
  ctx.font = `${Math.max(8, bw * 0.4)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (p.protected || p.shielded) {
    ctx.strokeStyle = `rgba(255,255,255,${0.4 + 0.3 * Math.sin(now / 90)})`;
    ctx.lineWidth = Math.max(1, 2 * k);
    ctx.strokeRect(cx - bw / 2 - 3, top - 3, bw + 6, bottom - top + 6);
  }
  if (p.stunned) ctx.fillText("⭐", cx, top - 4);
  if (p.jailed > 0) {
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = Math.max(1, 2 * k);
    for (let i = 0; i <= 4; i++) {
      const bx = cx - bw / 2 - 4 + (i * (bw + 8)) / 4;
      ctx.beginPath();
      ctx.moveTo(bx, top - 4);
      ctx.lineTo(bx, bottom);
      ctx.stroke();
    }
  }
  // Health bar and name above the head, at a readable size.
  const barW = Math.max(30, Math.min(80, bw * 1.4));
  const barY = top - 16;
  const frac = p.hp / p.maxHp;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(cx - barW / 2, barY, barW, 5);
  ctx.fillStyle = frac > 0.5 ? "#4ade80" : frac > 0.25 ? "#facc15" : "#ef4444";
  ctx.fillRect(cx - barW / 2, barY, barW * frac, 5);
  if (info) {
    ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillText(info.name, cx + 1, barY - 2);
    ctx.fillStyle = team === 0 ? "#bfdbfe" : "#fed7aa";
    ctx.fillText(info.name, cx, barY - 3);
  }
}
