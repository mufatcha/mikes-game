import { CEILING_HEIGHT, PLAYER_RADIUS } from "./constants";
import { MAP_HEIGHT, MAP_WIDTH, WALLS, WALL_HEIGHT, inTardis, type Rect, type Wall } from "./map";

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** A player's position; `z` is how high their feet are off the floor (jumping, or standing on a desk). */
export interface Body {
  x: number;
  y: number;
  z?: number;
  vz?: number;
}

/** Low things (desks, tables, bleachers) don't block you once your feet are above them. */
function blocks(w: Wall, z: number) {
  return WALL_HEIGHT[w.kind] > z + 1;
}

/**
 * Push a circle out of every wall it overlaps (unless it's above it), and keep
 * it inside the map (or inside the TARDIS, which has its own walls).
 */
function resolve(pos: Body, r: number, walls: Wall[]) {
  const z = pos.z ?? 0;
  for (const w of walls) {
    if (!blocks(w, z)) continue;
    const cx = clamp(pos.x, w.x, w.x + w.w);
    const cy = clamp(pos.y, w.y, w.y + w.h);
    const dx = pos.x - cx;
    const dy = pos.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x += (dx / d) * (r - d);
      pos.y += (dy / d) * (r - d);
    } else {
      // Center is inside the rect: push out along the shortest axis.
      const left = pos.x - w.x;
      const right = w.x + w.w - pos.x;
      const top = pos.y - w.y;
      const bottom = w.y + w.h - pos.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) pos.x = w.x - r;
      else if (m === right) pos.x = w.x + w.w + r;
      else if (m === top) pos.y = w.y - r;
      else pos.y = w.y + w.h + r;
    }
  }
  if (inTardis(pos.x, pos.y)) return;
  pos.x = clamp(pos.x, r, MAP_WIDTH - r);
  pos.y = clamp(pos.y, r, MAP_HEIGHT - r);
}

/**
 * Shared by the server simulation and client prediction, so both must stay
 * deterministic for the same inputs.
 */
export function movePlayer(
  pos: Body,
  mx: number,
  my: number,
  speed: number,
  dt: number,
  radius = PLAYER_RADIUS,
) {
  const len = Math.hypot(mx, my);
  if (len < 1e-3 || speed <= 0) return;
  const s = (speed * dt) / Math.max(1, len);
  // Move in small substeps so fast movement cannot tunnel through thin walls.
  const steps = 2;
  for (let i = 0; i < steps; i++) {
    pos.x += (mx * s) / steps;
    pos.y += (my * s) / steps;
    resolve(pos, radius, WALLS);
  }
}

// ---------------------------------------------------------------- jumping, sprinting, crouching

/** Takeoff speed of a jump, and the pull back down: about 38 units high, enough to clear a desk, a table or a bleacher. */
export const JUMP_SPEED = 265;
export const PLAYER_GRAVITY = 900;
export const SPRINT_MULT = 1.35;
export const CROUCH_MULT = 0.55;
/** Crouching makes you this much shorter (and lowers your view in 3D). */
export const CROUCH_SCALE = 0.62;

/** Movement speed multiplier for sprinting and crouching (crouching wins). */
export function stanceSpeed(sprint: boolean | undefined, crouch: boolean | undefined) {
  return crouch ? CROUCH_MULT : sprint ? SPRINT_MULT : 1;
}

/** The top of the highest low thing (desk, table, bleacher…) under you that you're up on, or the floor. */
function groundUnder(pos: Body, r: number) {
  const z = pos.z ?? 0;
  let ground = 0;
  const m = r * 0.5;
  for (const w of WALLS) {
    const h = WALL_HEIGHT[w.kind];
    if (h >= CEILING_HEIGHT || h > z + 1 || h <= ground) continue;
    if (pos.x > w.x - m && pos.x < w.x + w.w + m && pos.y > w.y - m && pos.y < w.y + w.h + m) ground = h;
  }
  return ground;
}

/**
 * Jumping and falling, once per tick after moving: hold jump on the ground to
 * take off, and land on the floor or on top of whatever low furniture is
 * under you. Walk off the edge of a desk and you drop.
 */
export function stepVertical(pos: Body, jump: boolean, dt: number, r = PLAYER_RADIUS) {
  let z = pos.z ?? 0;
  let vz = pos.vz ?? 0;
  const ground = groundUnder(pos, r);
  if (z <= ground + 0.01 && vz <= 0) {
    z = ground;
    vz = jump ? JUMP_SPEED : 0;
  }
  if (vz !== 0 || z > ground) {
    vz -= PLAYER_GRAVITY * dt;
    z += vz * dt;
    if (z <= ground) {
      z = ground;
      vz = 0;
    }
  }
  pos.z = Math.round(z * 100) / 100;
  pos.vz = Math.round(vz * 100) / 100;
}

/** Returns the fraction t in [0, 1] where the segment first enters the rect, or null. */
export function segmentRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: Rect,
  pad = 0,
): number | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let tmin = 0;
  let tmax = 1;
  const minX = r.x - pad;
  const maxX = r.x + r.w + pad;
  const minY = r.y - pad;
  const maxY = r.y + r.h + pad;

  if (Math.abs(dx) < 1e-9) {
    if (x0 < minX || x0 > maxX) return null;
  } else {
    let t1 = (minX - x0) / dx;
    let t2 = (maxX - x0) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (Math.abs(dy) < 1e-9) {
    if (y0 < minY || y0 > maxY) return null;
  } else {
    let t1 = (minY - y0) / dy;
    let t2 = (maxY - y0) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

/** Returns the fraction t in [0, 1] where the segment first touches the circle, or null. */
export function segmentCircle(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  r: number,
): number | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const fx = x0 - cx;
  const fy = y0 - cy;
  const a = dx * dx + dy * dy;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  if (a < 1e-9) return null;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

/** Earliest wall hit along a segment, as a fraction t, or null. */
export function firstWallHit(x0: number, y0: number, x1: number, y1: number, pad = 0) {
  let best: number | null = null;
  for (const w of WALLS) {
    const t = segmentRect(x0, y0, x1, y1, w, pad);
    if (t !== null && (best === null || t < best)) best = t;
  }
  return best;
}

/**
 * Like segmentRect, but also returns the surface normal of the side that was
 * hit, for bouncing. A segment starting inside the rect bounces straight back.
 */
export function segmentRectHit(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: Rect,
): { t: number; nx: number; ny: number } | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let tmin = 0;
  let tmax = 1;
  let nx = 0;
  let ny = 0;
  if (Math.abs(dx) < 1e-9) {
    if (x0 < r.x || x0 > r.x + r.w) return null;
  } else {
    const t1 = ((dx > 0 ? r.x : r.x + r.w) - x0) / dx;
    const t2 = ((dx > 0 ? r.x + r.w : r.x) - x0) / dx;
    if (t1 > tmin) {
      tmin = t1;
      nx = dx > 0 ? -1 : 1;
      ny = 0;
    }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (Math.abs(dy) < 1e-9) {
    if (y0 < r.y || y0 > r.y + r.h) return null;
  } else {
    const t1 = ((dy > 0 ? r.y : r.y + r.h) - y0) / dy;
    const t2 = ((dy > 0 ? r.y + r.h : r.y) - y0) / dy;
    if (t1 > tmin) {
      tmin = t1;
      nx = 0;
      ny = dy > 0 ? -1 : 1;
    }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (nx === 0 && ny === 0) {
    const len = Math.hypot(dx, dy) || 1;
    nx = -dx / len;
    ny = -dy / len;
  }
  return { t: tmin, nx, ny };
}

/** Earliest wall hit along a segment, with the side's normal, or null. */
export function firstWallHitWithNormal(x0: number, y0: number, x1: number, y1: number) {
  let best: { t: number; nx: number; ny: number } | null = null;
  for (const w of WALLS) {
    const hit = segmentRectHit(x0, y0, x1, y1, w);
    if (hit && (!best || hit.t < best.t)) best = hit;
  }
  return best;
}

export function hasLineOfSight(x0: number, y0: number, x1: number, y1: number, pad = 0) {
  return firstWallHit(x0, y0, x1, y1, pad) === null;
}
