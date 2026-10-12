import { PLAYER_RADIUS } from "./constants";
import { MAP_HEIGHT, MAP_WIDTH, WALLS, type Rect } from "./map";

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Push a circle out of every wall it overlaps, and keep it inside the map. */
function resolve(pos: { x: number; y: number }, r: number, walls: Rect[]) {
  for (const w of walls) {
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
  pos.x = clamp(pos.x, r, MAP_WIDTH - r);
  pos.y = clamp(pos.y, r, MAP_HEIGHT - r);
}

/**
 * Shared by the server simulation and client prediction, so both must stay
 * deterministic for the same inputs.
 */
export function movePlayer(
  pos: { x: number; y: number },
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

export function hasLineOfSight(x0: number, y0: number, x1: number, y1: number, pad = 0) {
  return firstWallHit(x0, y0, x1, y1, pad) === null;
}
