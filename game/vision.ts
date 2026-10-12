import { segmentRect } from "@/shared/physics";
import { HALLS, ROOMS, SAFE_ZONE, WALLS, type Rect, type Wall, type WallKind } from "@/shared/map";

/** You can always see this close around you, in every direction. */
export const NEAR_SIGHT = 170;
/** How far you can see in the direction you're facing. */
export const FAR_SIGHT = 1300;
/** Half the width of the cone you see in front of you. */
export const CONE_HALF = (55 * Math.PI) / 180;
/** Fog of War mode: all you can see is this close around you. */
export const FOG_SIGHT = 320;

/** Tall things block sight; desks, tables, bleachers and easels are low enough to see over. */
const BLOCKS_SIGHT: Record<WallKind, boolean> = {
  wall: true,
  locker: true,
  shelf: true,
  desk: false,
  table: false,
  bleacher: false,
  easel: false,
  clinic: true,
};
const OCCLUDERS: Wall[] = WALLS.filter((w) => BLOCKS_SIGHT[w.kind]);

/** The sight polygon runs this far into a wall, so the face of the wall you're looking at stays lit. */
const WALL_REVEAL = 10;
const SWEEP_RAYS = 180;

function inside(r: Rect, x: number, y: number) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/**
 * The areas you can see all of from where you stand: the whole room you're in,
 * or every hallway if you're in the halls (they're one connected space).
 */
export function litAreasAt(x: number, y: number, fog = false): Rect[] {
  if (fog) return [];
  // The Nurse's Office is its own little building inside the main hall.
  if (inside(SAFE_ZONE, x, y)) return [SAFE_ZONE];
  const room = ROOMS.find((r) => inside(r, x, y));
  if (room) return [room];
  if (HALLS.some((h) => inside(h, x, y))) return HALLS;
  return [];
}

function near(w: Wall, x: number, y: number, range: number) {
  return w.x - range < x && x < w.x + w.w + range && w.y - range < y && y < w.y + w.h + range;
}

/** First fraction along the ray where it hits a sight-blocking wall, or 1 if it doesn't. */
function castRay(x: number, y: number, ex: number, ey: number, walls: Wall[]) {
  let best = 1;
  for (const w of walls) {
    const t = segmentRect(x, y, ex, ey, w);
    if (t !== null && t < best) best = t;
  }
  return best;
}

/**
 * The area you could see from (x, y) if you looked every way at once, as a polygon
 * in world space. Walls cut it off, so you only see through doors what a person
 * standing there would.
 */
export function sightPolygon(x: number, y: number, range = FAR_SIGHT): [number, number][] {
  const walls = OCCLUDERS.filter((w) => near(w, x, y, range));
  const angles: number[] = [];
  for (let i = 0; i < SWEEP_RAYS; i++) angles.push((i / SWEEP_RAYS) * Math.PI * 2 - Math.PI);
  // Rays just either side of every wall corner give sharp shadow edges.
  for (const w of walls) {
    for (const [cx, cy] of [
      [w.x, w.y],
      [w.x + w.w, w.y],
      [w.x, w.y + w.h],
      [w.x + w.w, w.y + w.h],
    ]) {
      const a = Math.atan2(cy - y, cx - x);
      angles.push(a - 1e-4, a + 1e-4);
    }
  }
  angles.sort((a, b) => a - b);

  const points: [number, number][] = [];
  for (const a of angles) {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const t = castRay(x, y, x + dx * range, y + dy * range, walls);
    const d = t < 1 ? t * range + WALL_REVEAL : range;
    points.push([x + dx * d, y + dy * d]);
  }
  return points;
}

/**
 * Whether a target at (tx, ty) with radius r is in view from (x, y) facing `aim`:
 * in the same room (or hallways) as you, or close enough around you or inside the cone in
 * front and not behind a wall.
 * In Fog of War it's only a small circle around you, still blocked by walls.
 * Checks the target's center and both sides, so someone half out of cover still shows.
 */
export function canSee(x: number, y: number, aim: number, tx: number, ty: number, r: number, fog = false) {
  // Sharing a room (or the halls) means you see each other, but the halls don't see into the Nurse's Office.
  const sameSide = inside(SAFE_ZONE, x, y) === inside(SAFE_ZONE, tx, ty);
  if (sameSide && litAreasAt(x, y, fog).some((a) => inside(a, tx, ty))) return true;
  const dist = Math.hypot(tx - x, ty - y);
  if (dist > (fog ? FOG_SIGHT : FAR_SIGHT) + r) return false;
  // Fog of War has no cone: just the circle around you.
  if (!fog && dist > NEAR_SIGHT + r) {
    let d = Math.atan2(ty - y, tx - x) - aim;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) > CONE_HALF + Math.asin(Math.min(1, r / dist))) return false;
  }
  const px = dist > 0 ? (-(ty - y) / dist) * r * 0.8 : 0;
  const py = dist > 0 ? ((tx - x) / dist) * r * 0.8 : 0;
  for (const [ox, oy] of [
    [0, 0],
    [px, py],
    [-px, -py],
  ]) {
    if (OCCLUDERS.every((w) => segmentRect(x, y, tx + ox, ty + oy, w) === null)) return true;
  }
  return false;
}
