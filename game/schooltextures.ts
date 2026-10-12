import { HALLS, MAP_HEIGHT, MAP_WIDTH, ROOMS, WALL_HEIGHT, inSafeZone, type FloorPattern, type WallKind } from "@/shared/map";

/**
 * Procedural textures for the first-person school: painted cinderblock walls
 * in school colors, lockers, bookshelves, furniture, a drop ceiling with
 * fluorescent lights, and a different floor in every room. Everything is
 * drawn in code, so there are no image files.
 */

/** Texture pixels per world unit. */
export const PPU = 2;

/** Kinds of wall surface; "outer" is the building's outside wall, with windows. */
export type Surface = WallKind | "outer";
export type WallVariant = "plain" | "posterBlue" | "posterOrange" | "bulletin" | "clock";

/** World units before a texture repeats, per surface. */
export const TEX_UNITS: Record<Surface, number> = {
  wall: 64,
  outer: 64,
  locker: 22,
  shelf: 32,
  desk: 32,
  table: 32,
  bleacher: 40,
  easel: 40,
  clinic: 56,
};

/** How tall each surface is, in world units (also the texture height). */
export const SURFACE_HEIGHT: Record<Surface, number> = { ...WALL_HEIGHT, outer: WALL_HEIGHT.wall };

/** Small deterministic hash, 0 to 1, so every client draws the same school. */
export function hash(a: number, b: number) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// ---------------------------------------------------------------- walls

const cache = new Map<string, HTMLCanvasElement>();

function canvas(units: number, height: number) {
  const c = document.createElement("canvas");
  c.width = units * PPU;
  c.height = height * PPU;
  return c;
}

/** Painted cinderblock with a blue lower half and an orange stripe, the school colors. */
function paintCinderblock(g: CanvasRenderingContext2D, w: number, h: number) {
  const u = PPU;
  g.fillStyle = "#e4ddc8";
  g.fillRect(0, 0, w, h);
  // Blocks 16x8 units, staggered rows, with mortar lines.
  g.fillStyle = "rgba(120,110,90,0.35)";
  for (let row = 0; row * 8 * u < h; row++) {
    const y = row * 8 * u;
    g.fillRect(0, y, w, 1);
    const offset = row % 2 ? 8 * u : 0;
    for (let x = offset; x < w; x += 16 * u) g.fillRect(x, y, 1, 8 * u);
  }
  // Lower wainscot in Blueberry blue, an Orange Peel stripe, and a dark baseboard.
  const wainscot = h - 30 * u;
  g.fillStyle = "#2f4fa8";
  g.fillRect(0, wainscot, w, 30 * u);
  g.fillStyle = "rgba(0,0,0,0.12)";
  for (let row = 0; row * 8 * u < 30 * u; row++) g.fillRect(0, wainscot + row * 8 * u, w, 1);
  g.fillStyle = "#f97316";
  g.fillRect(0, wainscot - 3 * u, w, 3 * u);
  g.fillStyle = "#2b2b30";
  g.fillRect(0, h - 4 * u, w, 4 * u);
  // A strip of trim where the wall meets the ceiling.
  g.fillStyle = "#cfc6ae";
  g.fillRect(0, 0, w, 2 * u);
}

function wallCanvas(variant: WallVariant) {
  const c = canvas(TEX_UNITS.wall, SURFACE_HEIGHT.wall);
  const g = c.getContext("2d")!;
  const { width: w, height: h } = c;
  const u = PPU;
  paintCinderblock(g, w, h);
  const eye = h - 52 * u; // top of things hung at eye level
  if (variant === "posterBlue" || variant === "posterOrange") {
    const blue = variant === "posterBlue";
    g.fillStyle = blue ? "#1d4ed8" : "#ea580c";
    g.fillRect(16 * u, eye, 32 * u, 22 * u);
    g.fillStyle = "#fff";
    g.fillRect(17 * u, eye + 1 * u, 30 * u, 1 * u);
    g.font = `900 ${4 * u}px sans-serif`;
    g.textAlign = "center";
    g.fillText(blue ? "GO" : "ORANGE", 32 * u, eye + 8 * u);
    g.fillText(blue ? "BLUEBERRIES!" : "PEELS RULE", 32 * u, eye + 13 * u);
    g.font = `${7 * u}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    g.fillText(blue ? "🫐" : "🍊", 32 * u, eye + 21 * u);
  } else if (variant === "bulletin") {
    g.fillStyle = "#6b4423";
    g.fillRect(10 * u, eye - 2 * u, 44 * u, 26 * u);
    g.fillStyle = "#c08a55";
    g.fillRect(11 * u, eye - 1 * u, 42 * u, 24 * u);
    const papers = ["#fff", "#fde68a", "#bfdbfe", "#fecaca", "#bbf7d0"];
    for (let i = 0; i < 6; i++) {
      g.fillStyle = papers[i % papers.length];
      g.fillRect((13 + (i % 3) * 13) * u, (eye + 1 * u) + Math.floor(i / 3) * 11 * u, 10 * u, 9 * u);
      g.fillStyle = "#ef4444";
      g.fillRect((17 + (i % 3) * 13) * u, (eye + 1 * u) + Math.floor(i / 3) * 11 * u, 2 * u, 2 * u);
    }
  } else if (variant === "clock") {
    const cx = 32 * u;
    const cy = eye - 6 * u;
    g.fillStyle = "#1f2937";
    g.beginPath();
    g.arc(cx, cy, 8 * u, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#f8fafc";
    g.beginPath();
    g.arc(cx, cy, 7 * u, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#111";
    g.lineWidth = u;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx, cy - 5 * u);
    g.moveTo(cx, cy);
    g.lineTo(cx + 3.5 * u, cy + 1 * u);
    g.stroke();
  }
  return c;
}

/**
 * The Nurse's Office: clean white tile below, mint paint above, a red
 * stripe, and a red cross on a white disc. Symmetric, so it reads the same
 * from inside and outside.
 */
function clinicCanvas() {
  const c = canvas(TEX_UNITS.clinic, SURFACE_HEIGHT.clinic);
  const g = c.getContext("2d")!;
  const { width: w, height: h } = c;
  const u = PPU;
  g.fillStyle = "#d1fae5";
  g.fillRect(0, 0, w, h);
  // Tile on the lower half.
  const tileTop = h * 0.55;
  g.fillStyle = "#f8fafc";
  g.fillRect(0, tileTop, w, h - tileTop);
  g.fillStyle = "#cbd5e1";
  for (let y = tileTop; y < h; y += 8 * u) g.fillRect(0, y, w, 0.5 * u);
  for (let x = 0; x < w; x += 8 * u) g.fillRect(x, tileTop, 0.5 * u, h - tileTop);
  // Red stripe between them, and a darker baseboard.
  g.fillStyle = "#ef4444";
  g.fillRect(0, tileTop - 3 * u, w, 3 * u);
  g.fillStyle = "#94a3b8";
  g.fillRect(0, h - 3 * u, w, 3 * u);
  // A red cross on a white disc.
  const cx = w / 2;
  const cy = h * 0.3;
  g.fillStyle = "#fff";
  g.beginPath();
  g.arc(cx, cy, 13 * u, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#dc2626";
  g.fillRect(cx - 3.5 * u, cy - 10 * u, 7 * u, 20 * u);
  g.fillRect(cx - 10 * u, cy - 3.5 * u, 20 * u, 7 * u);
  return c;
}

/** The outside wall: cinderblock with tall windows showing a bright sky. */
function outerCanvas() {
  const c = canvas(TEX_UNITS.outer, SURFACE_HEIGHT.outer);
  const g = c.getContext("2d")!;
  const { width: w, height: h } = c;
  const u = PPU;
  paintCinderblock(g, w, h);
  const top = 10 * u;
  const bottom = h - 34 * u;
  const sky = g.createLinearGradient(0, top, 0, bottom);
  sky.addColorStop(0, "#7dd3fc");
  sky.addColorStop(1, "#e0f2fe");
  g.fillStyle = "#94a3b8";
  g.fillRect(8 * u, top - 2 * u, 48 * u, bottom - top + 4 * u);
  g.fillStyle = sky;
  g.fillRect(10 * u, top, 44 * u, bottom - top);
  // A few trees and a cloud outside.
  g.fillStyle = "#4ade80";
  g.beginPath();
  g.arc(20 * u, bottom, 8 * u, Math.PI, 0);
  g.arc(42 * u, bottom, 10 * u, Math.PI, 0);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.9)";
  g.beginPath();
  g.arc(30 * u, top + 8 * u, 4 * u, 0, Math.PI * 2);
  g.arc(35 * u, top + 7 * u, 5 * u, 0, Math.PI * 2);
  g.fill();
  // Window frame bars.
  g.fillStyle = "#64748b";
  g.fillRect(31 * u, top, 2 * u, bottom - top);
  g.fillRect(10 * u, (top + bottom) / 2, 44 * u, 1.5 * u);
  return c;
}

/** A blue steel locker door with vents, a handle and a number plate. */
function lockerCanvas() {
  const c = canvas(TEX_UNITS.locker, SURFACE_HEIGHT.locker);
  const g = c.getContext("2d")!;
  const { width: w, height: h } = c;
  const u = PPU;
  g.fillStyle = "#2f5d9e";
  g.fillRect(0, 0, w, h);
  // Wall above the locker (lockers stop short of the ceiling).
  g.fillStyle = "#e4ddc8";
  g.fillRect(0, 0, w, 8 * u);
  g.fillStyle = "#1e3a63";
  g.fillRect(0, 8 * u, w, u);
  g.fillRect(0, 8 * u, u, h);
  g.fillRect(w - u, 8 * u, u, h);
  const shine = g.createLinearGradient(0, 0, w, 0);
  shine.addColorStop(0, "rgba(255,255,255,0.12)");
  shine.addColorStop(0.5, "rgba(255,255,255,0)");
  g.fillStyle = shine;
  g.fillRect(u, 9 * u, w - 2 * u, h);
  // Vents near the top and bottom.
  g.fillStyle = "#16294a";
  for (let i = 0; i < 4; i++) {
    g.fillRect(5 * u, (13 + i * 2.2) * u, 12 * u, 0.9 * u);
    g.fillRect(5 * u, h - (12 - i * 2.2) * u, 12 * u, 0.9 * u);
  }
  // Number plate and handle.
  g.fillStyle = "#cbd5e1";
  g.fillRect(8 * u, 24 * u, 6 * u, 3 * u);
  g.fillStyle = "#94a3b8";
  g.fillRect(16 * u, 40 * u, 3 * u, 10 * u);
  g.fillStyle = "#1f2937";
  g.fillRect(0, h - 3 * u, w, 3 * u);
  return c;
}

/** A library bookshelf packed with colorful spines. */
function shelfCanvas() {
  const c = canvas(TEX_UNITS.shelf, SURFACE_HEIGHT.shelf);
  const g = c.getContext("2d")!;
  const { width: w, height: h } = c;
  const u = PPU;
  g.fillStyle = "#5a3d2b";
  g.fillRect(0, 0, w, h);
  const spines = ["#b91c1c", "#1d4ed8", "#15803d", "#a16207", "#7e22ce", "#0f766e", "#be185d", "#f8fafc", "#ea580c"];
  const rows = 4;
  const rowH = (h - 4 * u) / rows;
  for (let r = 0; r < rows; r++) {
    const y0 = 2 * u + r * rowH;
    g.fillStyle = "#3b2618";
    g.fillRect(2 * u, y0, w - 4 * u, rowH - 2 * u);
    let x = 2 * u;
    let i = 0;
    while (x < w - 3 * u) {
      const bw = (2 + Math.floor(hash(r, i) * 3)) * u;
      const bh = rowH - 2 * u - Math.floor(hash(i, r + 7) * 4) * u;
      g.fillStyle = spines[Math.floor(hash(r * 31 + i, 5) * spines.length)];
      g.fillRect(x, y0 + (rowH - 2 * u - bh), Math.min(bw, w - 2 * u - x), bh);
      g.fillStyle = "rgba(255,255,255,0.25)";
      g.fillRect(x, y0 + (rowH - 2 * u - bh) + 2 * u, Math.min(bw, w - 2 * u - x), u);
      x += bw + 0.5 * u;
      i++;
    }
    g.fillStyle = "#7b5a42";
    g.fillRect(0, y0 + rowH - 2 * u, w, 2 * u);
  }
  return c;
}

function furnitureCanvas(kind: "desk" | "table" | "bleacher" | "easel") {
  const c = canvas(TEX_UNITS[kind], SURFACE_HEIGHT[kind]);
  const g = c.getContext("2d")!;
  const { width: w, height: h } = c;
  const u = PPU;
  if (kind === "desk") {
    g.fillStyle = "#8a6a45";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#a47e52";
    g.fillRect(0, 0, w, 4 * u);
    g.fillStyle = "#4b5563";
    g.fillRect(3 * u, 4 * u, 2 * u, h);
    g.fillRect(w - 5 * u, 4 * u, 2 * u, h);
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.fillRect(6 * u, 6 * u, w - 12 * u, 8 * u);
  } else if (kind === "table") {
    g.fillStyle = "#4b5563";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#d1d5db";
    g.fillRect(0, 0, w, 4 * u);
    g.fillStyle = "#9ca3af";
    g.fillRect(0, 4 * u, w, u);
    g.fillStyle = "#1f2937";
    g.fillRect(4 * u, 5 * u, 2 * u, h);
    g.fillRect(w - 6 * u, 5 * u, 2 * u, h);
  } else if (kind === "bleacher") {
    for (let y = 0; y < h; y += 6 * u) {
      g.fillStyle = (y / (6 * u)) % 2 ? "#8c7750" : "#a08a5e";
      g.fillRect(0, y, w, 6 * u);
      g.fillStyle = "rgba(0,0,0,0.3)";
      g.fillRect(0, y + 5 * u, w, u);
    }
  } else {
    g.fillStyle = "#7c5e3c";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#fefce8";
    g.fillRect(6 * u, 2 * u, w - 12 * u, h - 16 * u);
    const paint = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#ec4899"];
    for (let i = 0; i < 7; i++) {
      g.fillStyle = paint[i % paint.length];
      g.beginPath();
      g.arc((10 + hash(i, 1) * 20) * u, (6 + hash(i, 2) * 18) * u, (1.5 + hash(i, 3) * 3) * u, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

/** The texture for a surface (cached after the first use). */
export function wallTexture(surface: Surface, variant: WallVariant = "plain"): HTMLCanvasElement {
  const key = surface === "wall" ? `wall:${variant}` : surface;
  let c = cache.get(key);
  if (!c) {
    if (surface === "wall") c = wallCanvas(variant);
    else if (surface === "outer") c = outerCanvas();
    else if (surface === "locker") c = lockerCanvas();
    else if (surface === "shelf") c = shelfCanvas();
    else if (surface === "clinic") c = clinicCanvas();
    else c = furnitureCanvas(surface);
    cache.set(key, c);
  }
  return c;
}

/** Mostly plain walls, with posters, bulletin boards and clocks here and there. */
export function wallVariant(wallIndex: number, segment: number): WallVariant {
  const r = hash(wallIndex * 97 + segment, 13);
  if (r < 0.08) return "posterBlue";
  if (r < 0.16) return "posterOrange";
  if (r < 0.24) return "bulletin";
  if (r < 0.29) return "clock";
  return "plain";
}

// ---------------------------------------------------------------- floors and ceiling

type RGB = [number, number, number];

/** Pack a color into one number (red in the low byte), so the per-pixel loop allocates nothing. */
function rgb(r: number, g: number, b: number) {
  return (r & 255) | ((g & 255) << 8) | ((b & 255) << 16);
}

const CELL = 20;
const GRID_W = Math.ceil(MAP_WIDTH / CELL);
const GRID_H = Math.ceil(MAP_HEIGHT / CELL);
const FLOOR_KINDS: (FloorPattern | "hall")[] = ["hall", "court", "carpet", "checker", "tiles", "stripes", "splatter"];
let floorGrid: Uint8Array | null = null;

/** Which floor each 20x20 cell of the map has, worked out once. */
function grid() {
  if (floorGrid) return floorGrid;
  floorGrid = new Uint8Array(GRID_W * GRID_H);
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const x = gx * CELL + CELL / 2;
      const y = gy * CELL + CELL / 2;
      const room = ROOMS.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
      const inHall = HALLS.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
      floorGrid[gy * GRID_W + gx] = room ? FLOOR_KINDS.indexOf(room.pattern) : inHall ? 0 : 0;
    }
  }
  return floorGrid;
}

function mod(a: number, n: number) {
  return ((a % n) + n) % n;
}

/** Set on ceiling texels that are light panels. */
export const GLOW = 1 << 24;

const PAINT: RGB[] = [
  [239, 68, 68],
  [59, 130, 246],
  [34, 197, 94],
  [234, 179, 8],
  [236, 72, 153],
];

/** Floor color at a world position, by which room it's in. */
export function floorTexel(x: number, y: number): number {
  if (inSafeZone(x, y)) {
    // The Nurse's Office: white tile with mint grout.
    if (mod(x, 20) < 0.8 || mod(y, 20) < 0.8) return rgb(167, 214, 190);
    return rgb(236, 244, 240);
  }
  const gx = Math.max(0, Math.min(GRID_W - 1, Math.floor(x / CELL)));
  const gy = Math.max(0, Math.min(GRID_H - 1, Math.floor(y / CELL)));
  const kind = FLOOR_KINDS[grid()[gy * GRID_W + gx]];
  switch (kind) {
    case "court": {
      // Gym floor: honey-colored planks with staggered joints.
      const row = Math.floor(y / 10);
      const off = hash(row, 3) * 60;
      if (mod(y, 10) < 0.7 || mod(x + off, 60) < 0.8) return rgb(120, 84, 44);
      const grain = hash(Math.floor(x / 4), row) * 22;
      return rgb(200 - grain, 152 - grain * 0.8, 92 - grain * 0.5);
    }
    case "carpet": {
      const d = (Math.floor(x / 16) + Math.floor(y / 16)) & 1 ? 8 : 0;
      return rgb(53 + d, 71 + d, 120 + d);
    }
    case "checker": {
      if (mod(x, 24) < 0.8 || mod(y, 24) < 0.8) return rgb(110, 110, 110);
      const light = (Math.floor(x / 24) + Math.floor(y / 24)) & 1;
      return light ? rgb(218, 212, 198) : rgb(87, 99, 121);
    }
    case "tiles": {
      if (mod(x, 36) < 1 || mod(y, 36) < 1) return rgb(140, 140, 140);
      const alt = (Math.floor(x / 36) + Math.floor(y / 36)) & 1 ? 14 : 0;
      return rgb(224 - alt, 224 - alt, 218 - alt);
    }
    case "stripes": {
      const s = mod(x + y, 40) < 20 ? 8 : 0;
      return rgb(70 + s, 74 + s, 84 + s);
    }
    case "splatter": {
      const cell = hash(Math.floor(x / 18), Math.floor(y / 18));
      if (cell > 0.88 && hash(Math.floor(x / 6), Math.floor(y / 6)) > 0.35) {
        const p = PAINT[Math.floor(cell * 100) % PAINT.length];
        return rgb(p[0], p[1], p[2]);
      }
      return rgb(138, 138, 142);
    }
    default: {
      // Hallways: polished tile.
      if (mod(x, 30) < 0.9 || mod(y, 30) < 0.9) return rgb(150, 146, 136);
      const tint = hash(Math.floor(x / 30), Math.floor(y / 30)) * 10;
      return rgb(218 - tint, 212 - tint, 196 - tint);
    }
  }
}

/** Ceiling color at a world position, packed; bit 24 is set for the glowing light panels. */
export function ceilingTexel(x: number, y: number): number {
  if (mod(x, 40) < 1.2 || mod(y, 40) < 1.2) return rgb(150, 150, 146);
  const ix = Math.floor(x / 40);
  const iy = Math.floor(y / 40);
  if (mod(ix, 4) === 1 && mod(iy, 3) === 1) {
    // A light panel, slightly bluish white, with its diffuser grid.
    if (mod(x, 10) < 0.6 || mod(y, 10) < 0.6) return rgb(214, 222, 232) | GLOW;
    return rgb(240, 247, 255) | GLOW;
  }
  return rgb(212, 210, 202);
}
