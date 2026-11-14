import type { Decor, Point, Rect, Wall, WallKind } from "./map";

/**
 * Building blocks for laying out a school map (see map.ts and bigmap.ts):
 * walls with doorway gaps, lockers along hallway walls, and the TARDIS's
 * console room.
 */

/** Wall thickness. */
export const T = 24;
/** Locker depth. */
export const L = 14;

export function split(from: number, to: number, gaps: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let cur = from;
  for (const [g1, g2] of [...gaps].sort((a, b) => a[0] - b[0])) {
    if (g1 > cur) out.push([cur, g1]);
    cur = Math.max(cur, g2);
  }
  if (cur < to) out.push([cur, to]);
  return out;
}

/** Horizontal strip from x1 to x2 starting at y, with gaps. */
export function stripH(kind: WallKind, x1: number, x2: number, y: number, h: number, gaps: [number, number][]) {
  return split(x1, x2, gaps).map(([a, b]): Wall => ({ x: a, y, w: b - a, h, kind }));
}

/** Vertical strip from y1 to y2 starting at x, with gaps. */
export function stripV(kind: WallKind, y1: number, y2: number, x: number, w: number, gaps: [number, number][]) {
  return split(y1, y2, gaps).map(([a, b]): Wall => ({ x, y: a, w, h: b - a, kind }));
}

export function box(kind: WallKind, x: number, y: number, w: number, h: number): Wall {
  return { x, y, w, h, kind };
}

/** A wall with a row of lockers along its hallway side, broken by doors. */
export function lockerWallH(x1: number, x2: number, y: number, hall: "above" | "below", doors: [number, number][]) {
  return [...stripH("wall", x1, x2, y, T, doors), ...stripH("locker", x1, x2, hall === "below" ? y + T : y - L, L, doors)];
}

export function lockerWallV(y1: number, y2: number, x: number, hall: "left" | "right", doors: [number, number][]) {
  return [...stripV("wall", y1, y2, x, T, doors), ...stripV("locker", y1, y2, hall === "right" ? x + T : x - L, L, doors)];
}

/** The TARDIS console room's wall thickness and half the width of its doors. */
export const TI_WALL = 20;
export const TI_DOOR = 32;

/** The TARDIS's console room, inside `ti`: walls with the doors in the south wall, the console, the time rotor and six struts. */
export function tardisRoom(ti: Rect): Wall[] {
  const doorX = ti.x + ti.w / 2;
  return [
    box("tardiswall", ti.x - TI_WALL, ti.y - TI_WALL, ti.w + TI_WALL * 2, TI_WALL),
    box("tardiswall", ti.x - TI_WALL, ti.y, TI_WALL, ti.h),
    box("tardiswall", ti.x + ti.w, ti.y, TI_WALL, ti.h),
    box("tardiswall", ti.x - TI_WALL, ti.y + ti.h, ti.w / 2 + TI_WALL - TI_DOOR, TI_WALL),
    box("tardisdoor", doorX - TI_DOOR, ti.y + ti.h, TI_DOOR * 2, TI_WALL),
    box("tardiswall", doorX + TI_DOOR, ti.y + ti.h, ti.w / 2 + TI_WALL - TI_DOOR, TI_WALL),
    // The console in the middle, with the time rotor rising out of it.
    box("console", doorX - 35, ti.y + ti.h / 2 - 35, 70, 70),
    box("rotor", doorX - 8, ti.y + ti.h / 2 - 8, 16, 16),
    // Six coral struts around the console, leaving a clear path from the doors.
    ...[0, 60, 120, 180, 240, 300].map((deg) => {
      const a = (deg * Math.PI) / 180;
      return box("strut", doorX + Math.cos(a) * 140 - 6, ti.y + ti.h / 2 + Math.sin(a) * 140 - 6, 12, 12);
    }),
  ];
}

// ---------------------------------------------------------------- the music rooms

/**
 * A real band room or orchestra room inside `r`: the conductor's podium at
 * the front (the bottom of the room), rows of chairs and music stands in
 * half circles facing it with an aisle up the middle, and, round the back
 * and sides, what that room keeps: for the band a drum kit, a xylophone and
 * instrument cubbies; for the orchestra a harp, timpani, a grand piano and
 * the cello and bass rack. `focus` is the podium, where the floor's risers
 * are centred.
 */
export function musicRoom(r: Rect, kind: "band" | "orchestra"): { walls: Wall[]; decor: Decor[]; focus: Point } {
  const walls: Wall[] = [];
  const decor: Decor[] = [];
  const focus = { x: r.x + r.w / 2, y: r.y + r.h - 40 };
  walls.push(box("podium", focus.x - 28, focus.y - 16, 56, 32));
  const extras: Wall[] =
    kind === "band"
      ? [
          box("drumkit", r.x + 24, r.y + 24, 92, 80),
          box("xylophone", r.x + r.w - 142, r.y + 30, 112, 32),
          box("cubby", r.x + 2, r.y + r.h * 0.35, 28, r.h * 0.45),
          box("cubby", r.x + r.w - 30, r.y + r.h * 0.35, 28, r.h * 0.45),
        ]
      : [
          box("harp", r.x + 30, r.y + 28, 30, 46),
          box("timpani", r.x + r.w - 150, r.y + 26, 52, 52),
          box("timpani", r.x + r.w - 90, r.y + 40, 46, 46),
          box("piano", r.x + 20, r.y + r.h - 124, 112, 78),
          box("cubby", r.x + r.w - 30, r.y + r.h * 0.33, 28, r.h * 0.42),
        ];
  walls.push(...extras);
  const hits = (x: number, y: number, w: number, h: number, pad: number) =>
    walls.some((o) => x < o.x + o.w + pad && x + w > o.x - pad && y < o.y + o.h + pad && y + h > o.y - pad);
  // Rows in half circles round the podium, an aisle up the middle to the back.
  for (let radius = 110; radius <= r.h - 70; radius += 72) {
    const span = Math.PI - 0.6;
    const n = Math.floor((span * radius) / 66) + 1;
    for (let i = 0; i < n; i++) {
      const a = Math.PI + 0.3 + (span * i) / Math.max(1, n - 1);
      if (Math.abs(a - 1.5 * Math.PI) < 36 / radius) continue;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const sx = focus.x + dx * (radius - 22) - 12;
      const sy = focus.y + dy * (radius - 22) - 5;
      const chx = focus.x + dx * radius - 11;
      const chy = focus.y + dy * radius - 10;
      const inside = (x: number, y: number, w: number, h: number) =>
        x > r.x + 30 && x + w < r.x + r.w - 30 && y > r.y + 26 && y + h < r.y + r.h - 20;
      if (!inside(sx, sy, 24, 10) || !inside(chx, chy, 22, 20)) continue;
      if (hits(sx, sy, 24, 10, 12) || hits(chx, chy, 22, 20, 6)) continue;
      walls.push(box("musicstand", sx, sy, 24, 10));
      decor.push({ kind: "chair", x: chx, y: chy, w: 22, h: 20 });
    }
  }
  return { walls, decor, focus };
}

/** Free spots to spawn in a room: a grid over it, skipping anywhere too close to furniture or walls. */
export function spawnsIn(r: Rect, walls: Wall[], count = 16): Point[] {
  const out: Point[] = [];
  const clear = (x: number, y: number) =>
    !walls.some((w) => x + 26 > w.x && x - 26 < w.x + w.w && y + 26 > w.y && y - 26 < w.y + w.h);
  const cols = 6;
  const rows = 5;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = r.x + 50 + ((r.w - 100) * (i + 0.5)) / cols;
      const y = r.y + 50 + ((r.h - 100) * (j + 0.5)) / rows;
      if (clear(x, y)) out.push({ x: Math.round(x), y: Math.round(y) });
    }
  }
  // Spread them round the room rather than bunching at the top.
  const step = Math.max(1, Math.floor(out.length / count));
  return out.filter((_, i) => i % step === 0).slice(0, count);
}
