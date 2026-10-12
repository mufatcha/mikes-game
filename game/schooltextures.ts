import {
  HALLS,
  MAP_HEIGHT,
  MAP_WIDTH,
  ROOMS,
  SCHOOL_HEIGHT,
  TARDIS_INSIDE,
  WALL_HEIGHT,
  inSafeZone,
  inTardis,
  type FloorPattern,
  type WallKind,
} from "@/shared/map";

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
  tardis: 38,
  tardiswall: 40,
  tardisdoor: 64,
  console: 35,
  rotor: 16,
  strut: 12,
  gamerwall: 48,
  arcade: 30,
  tvscreen: 160,
  pcdesk: 40,
  monitor: 58,
  couch: 40,
  beanbag: 34,
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

/**
 * A blue police box: the lamp and stepped roof on top, the black "POLICE
 * BOX" sign, two doors with windows and panels, and the white notice on
 * the left door. Only its front and left side face the room, and both of
 * those read the right way round.
 */
function tardisCanvas() {
  const c = canvas(TEX_UNITS.tardis, SURFACE_HEIGHT.tardis);
  const g = c.getContext("2d")!;
  const { width: w } = c;
  const u = PPU;
  const BLUE = "#0f3b82";
  const DARK = "#0a2a5e";
  // Lamp on top, then the stepped roof.
  g.fillStyle = "#e0f2fe";
  g.fillRect(16 * u, 0, 6 * u, 3 * u);
  g.fillStyle = DARK;
  g.fillRect(14 * u, 3 * u, 10 * u, 2 * u);
  g.fillRect(3 * u, 5 * u, w - 6 * u, 2 * u);
  g.fillRect(0, 7 * u, w, 2 * u);
  // The body.
  g.fillStyle = BLUE;
  g.fillRect(0, 9 * u, w, c.height - 9 * u);
  // The black sign with white lettering.
  g.fillStyle = "#0b0b0f";
  g.fillRect(2 * u, 10 * u, w - 4 * u, 5 * u);
  g.fillStyle = "#f8fafc";
  g.font = `800 ${3.6 * u}px ui-sans-serif, system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("POLICE BOX", w / 2, 12.6 * u);
  // Corner posts and the post between the doors.
  g.fillStyle = DARK;
  g.fillRect(0, 9 * u, 2.5 * u, c.height);
  g.fillRect(w - 2.5 * u, 9 * u, 2.5 * u, c.height);
  g.fillRect(18.4 * u, 15 * u, 1.2 * u, c.height);
  // Each door: a row of windows, then three panels.
  for (const x0 of [3.5, 20.5]) {
    g.fillStyle = "#dbeafe";
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 2; row++) {
        g.fillRect((x0 + 0.6 + col * 4.6) * u, (17 + row * 4.4) * u, 3.6 * u, 3.6 * u);
      }
    }
    g.strokeStyle = DARK;
    g.lineWidth = 0.8 * u;
    for (let p = 0; p < 3; p++) g.strokeRect((x0 + 1) * u, (28 + p * 14.5) * u, 12 * u, 12 * u);
  }
  // The notice on the left door, and the door handle.
  g.fillStyle = "#f8fafc";
  g.fillRect(5.5 * u, 30 * u, 10 * u, 8 * u);
  g.fillStyle = "#64748b";
  for (let i = 0; i < 4; i++) g.fillRect(6.5 * u, (31.5 + i * 1.6) * u, 8 * u, 0.5 * u);
  g.fillStyle = "#cbd5e1";
  g.fillRect(16.5 * u, 44 * u, 1 * u, 3 * u);
  return c;
}

// The TARDIS inside, as the Eleventh Doctor had it: copper and brass, glowing
// amber roundels, a glass floor lit orange from below, coral struts, and a
// console covered in odd old gadgets.

/** Bronze walls with amber roundels set in a honeycomb, over a copper skirting. */
function roundelCanvas() {
  const c = canvas(TEX_UNITS.tardiswall, SURFACE_HEIGHT.tardiswall);
  const g = c.getContext("2d")!;
  const { width: w, height: h } = c;
  const u = PPU;
  paintRoundelWall(g, w, h, u);
  return c;
}

function paintRoundelWall(g: CanvasRenderingContext2D, w: number, h: number, u: number) {
  const bronze = g.createLinearGradient(0, 0, 0, h);
  bronze.addColorStop(0, "#3b2412");
  bronze.addColorStop(0.5, "#7a4a22");
  bronze.addColorStop(1, "#5b3517");
  g.fillStyle = bronze;
  g.fillRect(0, 0, w, h);
  // A honeycomb of roundels: every other row shifted half a step.
  for (let row = 0; row < 6; row++) {
    const cy = (10 + row * 11) * u;
    const shift = row % 2 ? 10 : 0;
    for (let col = -1; col < 3; col++) {
      const cx = (shift + col * 20 + 10) * u;
      const glow = g.createRadialGradient(cx, cy, 1, cx, cy, 6.5 * u);
      glow.addColorStop(0, "#fff7ed");
      glow.addColorStop(0.45, "#fbbf24");
      glow.addColorStop(1, "#92400e");
      g.fillStyle = glow;
      g.beginPath();
      g.arc(cx, cy, 5.5 * u, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#d4a017";
      g.lineWidth = 0.7 * u;
      g.stroke();
    }
  }
  // Copper skirting with rivets.
  g.fillStyle = "#9a5b26";
  g.fillRect(0, h - 9 * u, w, 9 * u);
  g.fillStyle = "#e0a96d";
  for (let x = 2 * u; x < w; x += 6 * u) g.fillRect(x, h - 5 * u, 1.2 * u, 1.2 * u);
  g.fillStyle = "#d4a017";
  g.fillRect(0, h - 10 * u, w, 1 * u);
}

/** The inside of the police box doors, with light coming in through the windows. */
function tardisDoorCanvas() {
  const c = canvas(TEX_UNITS.tardisdoor, SURFACE_HEIGHT.tardisdoor);
  const g = c.getContext("2d")!;
  const { width: w, height: h } = c;
  const u = PPU;
  paintRoundelWall(g, w, h, u);
  // The doors themselves, set into the wall.
  const x0 = 10 * u;
  const dw = w - 20 * u;
  const top = 12 * u;
  g.fillStyle = "#d4a017";
  g.fillRect(x0 - 2 * u, top - 2 * u, dw + 4 * u, h - top - 9 * u + 2 * u);
  g.fillStyle = "#0f3b82";
  g.fillRect(x0, top, dw, h - top - 9 * u);
  g.fillStyle = "#0a2a5e";
  g.fillRect(x0 + dw / 2 - 0.6 * u, top, 1.2 * u, h - top - 9 * u);
  for (const d of [0, 1]) {
    const dx = x0 + d * (dw / 2);
    // Windows, bright from the Library outside.
    g.fillStyle = "#fef9c3";
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 2; row++) {
        g.fillRect(dx + (1.5 + col * 7) * u, top + (3 + row * 6.5) * u, 5.5 * u, 5.5 * u);
      }
    }
    g.strokeStyle = "#0a2a5e";
    g.lineWidth = 0.8 * u;
    for (let p = 0; p < 3; p++) g.strokeRect(dx + 2 * u, top + (18 + p * 13) * u, dw / 2 - 4 * u, 11 * u);
  }
  // The latch.
  g.fillStyle = "#cbd5e1";
  g.fillRect(x0 + dw / 2 - 3 * u, top + 30 * u, 1.2 * u, 4 * u);
  return c;
}

/**
 * The console: brass and copper panels covered in whatever was to hand, a
 * typewriter keyboard, a little green monitor, a bell, levers and gauges.
 */
function consoleCanvas() {
  const c = canvas(TEX_UNITS.console, SURFACE_HEIGHT.console);
  const g = c.getContext("2d")!;
  const { width: w, height: h } = c;
  const u = PPU;
  const brass = g.createLinearGradient(0, 0, 0, h);
  brass.addColorStop(0, "#d4a017");
  brass.addColorStop(1, "#7a4a22");
  g.fillStyle = brass;
  g.fillRect(0, 0, w, h);
  // Typewriter keys.
  g.fillStyle = "#1c1917";
  g.fillRect(2 * u, 2 * u, 14 * u, 8 * u);
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 5; k++) {
      g.fillStyle = "#f5f5f4";
      g.beginPath();
      g.arc((3.6 + k * 2.7 + (row % 2) * 0.8) * u, (3.8 + row * 2.4) * u, 0.9 * u, 0, Math.PI * 2);
      g.fill();
    }
  }
  // A small green monitor.
  g.fillStyle = "#292524";
  g.fillRect(19 * u, 2 * u, 12 * u, 9 * u);
  g.fillStyle = "#4ade80";
  g.fillRect(20 * u, 3 * u, 10 * u, 7 * u);
  g.fillStyle = "#166534";
  for (let y = 4; y < 10; y += 2) g.fillRect(21 * u, y * u, 7 * u, 0.6 * u);
  // A bell, two gauges and some levers.
  g.fillStyle = "#fde68a";
  g.beginPath();
  g.arc(5 * u, 18 * u, 3 * u, Math.PI, 0);
  g.fill();
  for (const gx of [13, 20]) {
    g.fillStyle = "#f5f5f4";
    g.beginPath();
    g.arc(gx * u, 17 * u, 2.6 * u, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#b91c1c";
    g.lineWidth = 0.5 * u;
    g.beginPath();
    g.moveTo(gx * u, 17 * u);
    g.lineTo((gx + 1.6) * u, 15.6 * u);
    g.stroke();
  }
  for (const [lx, color] of [
    [26, "#b91c1c"],
    [29, "#1c1917"],
    [32, "#b91c1c"],
  ] as const) {
    g.fillStyle = "#57534e";
    g.fillRect(lx * u, 14 * u, 1 * u, 7 * u);
    g.fillStyle = color;
    g.beginPath();
    g.arc((lx + 0.5) * u, 14 * u, 1.3 * u, 0, Math.PI * 2);
    g.fill();
  }
  // Glowing switches along the front edge, and a dark base.
  const lights = ["#fbbf24", "#f97316", "#fef3c7", "#ef4444"];
  for (let i = 0; i < 8; i++) {
    g.fillStyle = lights[i % lights.length];
    g.fillRect((2 + i * 4.2) * u, 23 * u, 2.4 * u, 1.4 * u);
  }
  g.fillStyle = "#3b2412";
  g.fillRect(0, h - 3 * u, w, 3 * u);
  return c;
}

/** The time rotor: a glass column glowing orange, with crystal shards rising inside. */
function rotorCanvas() {
  const c = canvas(TEX_UNITS.rotor, SURFACE_HEIGHT.rotor);
  const g = c.getContext("2d")!;
  const { width: w, height: h } = c;
  const u = PPU;
  const glass = g.createLinearGradient(0, 0, w, 0);
  glass.addColorStop(0, "#7c2d12");
  glass.addColorStop(0.5, "#fdba74");
  glass.addColorStop(1, "#7c2d12");
  g.fillStyle = glass;
  g.fillRect(0, 0, w, h);
  // Crystal shards.
  g.fillStyle = "rgba(255,247,237,0.85)";
  for (let i = 0; i < 6; i++) {
    const x = (3 + ((i * 5) % 10)) * u;
    const y = (14 + i * 9) * u;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 1.6 * u, y - 7 * u);
    g.lineTo(x + 3.2 * u, y);
    g.closePath();
    g.fill();
  }
  // Brass bands top and bottom.
  g.fillStyle = "#d4a017";
  g.fillRect(0, 0, w, 4 * u);
  g.fillRect(0, h - 4 * u, w, 4 * u);
  return c;
}

/** A coral strut: ridged, organic copper-orange, climbing to the roof. */
function strutCanvas() {
  const c = canvas(TEX_UNITS.strut, SURFACE_HEIGHT.strut);
  const g = c.getContext("2d")!;
  const { width: w, height: h } = c;
  const u = PPU;
  const coral = g.createLinearGradient(0, 0, w, 0);
  coral.addColorStop(0, "#7c2d12");
  coral.addColorStop(0.5, "#ea7a3c");
  coral.addColorStop(1, "#7c2d12");
  g.fillStyle = coral;
  g.fillRect(0, 0, w, h);
  // Knobbly ridges up its length.
  g.fillStyle = "rgba(253,186,116,0.55)";
  for (let y = 3; y < 80; y += 7) {
    g.beginPath();
    g.ellipse(w / 2 + Math.sin(y) * 2 * u, y * u, 4 * u, 1.6 * u, 0, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

// ---------------------------------------------------------------- the Game Room

const RGB_STOPS = ["#f43f5e", "#f59e0b", "#22c55e", "#06b6d4", "#6366f1", "#d946ef"];

/** A strip of RGB LEDs fading through the rainbow. */
function ledStrip(g: CanvasRenderingContext2D, y: number, w: number, h: number) {
  const grad = g.createLinearGradient(0, 0, w, 0);
  RGB_STOPS.forEach((c, i) => grad.addColorStop(i / (RGB_STOPS.length - 1), c));
  g.fillStyle = grad;
  g.fillRect(0, y, w, h);
}

/** A tiny pixel-art sprite from rows of characters (one colour per letter). */
function pixelArt(g: CanvasRenderingContext2D, rows: string[], colors: Record<string, string>, x: number, y: number, px: number) {
  rows.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (!colors[ch]) return;
      g.fillStyle = colors[ch];
      g.fillRect(x + c * px, y + r * px, px, px);
    }),
  );
}

const INVADER = ["..g.....g..", "...g...g...", "..ggggggg..", ".gg.ggg.gg.", "ggggggggggg", "g.ggggggg.g", "g.g.....g.g", "...gg.gg..."];
const HERO = ["..rrr..", ".rrrrr.", ".sssss.", "..sss..", ".bbbbb.", "b.bbb.b", "..b.b..", ".kk.kk."];
const HERO_COLORS = { r: "#dc2626", s: "#fcd34d", b: "#2563eb", k: "#78350f" };

/** Dark purple walls with RGB strips top and bottom, foam panels and a framed pixel-art game poster. */
function gamerWallCanvas() {
  const c = canvas(TEX_UNITS.gamerwall, SURFACE_HEIGHT.gamerwall);
  const g = c.getContext("2d")!;
  const { width: w, height: h } = c;
  const u = PPU;
  g.fillStyle = "#1e1033";
  g.fillRect(0, 0, w, h);
  // Acoustic foam panels.
  g.fillStyle = "#2a1748";
  for (let y = 14; y < 66; y += 8) for (let x = 2; x < 48; x += 8) g.fillRect(x * u, y * u, 6 * u, 6 * u);
  ledStrip(g, 6 * u, w, 1.5 * u);
  ledStrip(g, h - 8 * u, w, 1.5 * u);
  // A framed poster with a pixel-art hero and a title bar.
  g.fillStyle = "#facc15";
  g.fillRect(12 * u, 18 * u, 24 * u, 30 * u);
  g.fillStyle = "#0f172a";
  g.fillRect(13 * u, 19 * u, 22 * u, 28 * u);
  g.fillStyle = "#e11d48";
  g.fillRect(13 * u, 19 * u, 22 * u, 5 * u);
  pixelArt(g, HERO, HERO_COLORS, 17 * u, 28 * u, 2 * u);
  g.fillStyle = "#0b0716";
  g.fillRect(0, h - 6 * u, w, 6 * u);
  return c;
}

/** An arcade cabinet: glowing marquee, a screen with space invaders, the control panel and coin door. */
function arcadeCanvas() {
  const c = canvas(TEX_UNITS.arcade, SURFACE_HEIGHT.arcade);
  const g = c.getContext("2d")!;
  const { width: w, height: h } = c;
  const u = PPU;
  g.fillStyle = "#111827";
  g.fillRect(0, 0, w, h);
  // Side art stripes.
  g.fillStyle = "#7c3aed";
  g.fillRect(0, 0, 2 * u, h);
  g.fillRect(w - 2 * u, 0, 2 * u, h);
  // Marquee.
  const mq = g.createLinearGradient(0, 0, w, 0);
  mq.addColorStop(0, "#f472b6");
  mq.addColorStop(1, "#facc15");
  g.fillStyle = mq;
  g.fillRect(3 * u, 2 * u, w - 6 * u, 7 * u);
  g.fillStyle = "#111827";
  g.font = `900 ${4.4 * u}px ui-sans-serif, system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("ARCADE", w / 2, 5.6 * u);
  // Screen.
  g.fillStyle = "#020617";
  g.fillRect(4 * u, 12 * u, w - 8 * u, 18 * u);
  pixelArt(g, INVADER, { g: "#4ade80" }, 6 * u, 15 * u, 1.2 * u);
  pixelArt(g, INVADER, { g: "#f472b6" }, 16 * u, 19 * u, 1.2 * u);
  g.fillStyle = "#facc15";
  g.fillRect(14 * u, 27 * u, 2.4 * u, 1.2 * u);
  // Control panel: joystick and buttons.
  g.fillStyle = "#334155";
  g.fillRect(2 * u, 32 * u, w - 4 * u, 7 * u);
  g.fillStyle = "#e11d48";
  g.beginPath();
  g.arc(8 * u, 34 * u, 1.8 * u, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#1f2937";
  g.fillRect(7.6 * u, 34 * u, 0.8 * u, 3 * u);
  for (const [i, col] of ["#22c55e", "#3b82f6", "#facc15"].entries()) {
    g.fillStyle = col;
    g.beginPath();
    g.arc((15 + i * 4) * u, 35.5 * u, 1.3 * u, 0, Math.PI * 2);
    g.fill();
  }
  // Coin door.
  g.fillStyle = "#1f2937";
  g.fillRect(10 * u, 46 * u, 10 * u, 10 * u);
  g.fillStyle = "#f59e0b";
  g.fillRect(12 * u, 49 * u, 2 * u, 3 * u);
  g.fillRect(16 * u, 49 * u, 2 * u, 3 * u);
  return c;
}

/** A huge TV showing a platformer: sky, clouds, brick blocks, coins, a pipe and the hero mid-jump. */
function tvCanvas() {
  const c = canvas(TEX_UNITS.tvscreen, SURFACE_HEIGHT.tvscreen);
  const g = c.getContext("2d")!;
  const { width: w, height: h } = c;
  const u = PPU;
  g.fillStyle = "#1e1033";
  g.fillRect(0, 0, w, h);
  ledStrip(g, 6 * u, w, 1.5 * u);
  // Bezel and screen.
  const x0 = 6 * u;
  const y0 = 12 * u;
  const sw = w - 12 * u;
  const sh = 52 * u;
  g.fillStyle = "#020617";
  g.fillRect(x0 - 2 * u, y0 - 2 * u, sw + 4 * u, sh + 4 * u);
  g.fillStyle = "#60a5fa";
  g.fillRect(x0, y0, sw, sh);
  g.fillStyle = "#f8fafc";
  for (const cx of [20, 70, 120]) {
    g.beginPath();
    g.arc((cx + 6) * u, y0 + 9 * u, 4 * u, 0, Math.PI * 2);
    g.arc((cx + 12) * u, y0 + 8 * u, 5 * u, 0, Math.PI * 2);
    g.arc((cx + 18) * u, y0 + 9 * u, 4 * u, 0, Math.PI * 2);
    g.fill();
  }
  // Ground and brick blocks.
  g.fillStyle = "#16a34a";
  g.fillRect(x0, y0 + sh - 10 * u, sw, 3 * u);
  g.fillStyle = "#92400e";
  g.fillRect(x0, y0 + sh - 7 * u, sw, 7 * u);
  for (const bx of [44, 50, 56, 62]) {
    g.fillStyle = bx === 50 ? "#facc15" : "#b45309";
    g.fillRect(bx * u, y0 + 22 * u, 5.5 * u, 5.5 * u);
  }
  // A green pipe, coins and the hero jumping.
  g.fillStyle = "#15803d";
  g.fillRect(110 * u, y0 + sh - 22 * u, 10 * u, 12 * u);
  g.fillRect(108.5 * u, y0 + sh - 24 * u, 13 * u, 3 * u);
  g.fillStyle = "#facc15";
  for (const cx of [80, 87, 94]) g.fillRect(cx * u, y0 + 26 * u, 2.5 * u, 3.5 * u);
  pixelArt(g, HERO, HERO_COLORS, 28 * u, y0 + 26 * u, 1.6 * u);
  // A score along the top.
  g.fillStyle = "#f8fafc";
  g.font = `800 ${3.4 * u}px ui-monospace, monospace`;
  g.textAlign = "left";
  g.textBaseline = "top";
  g.fillText("SCORE 004200   x03   WORLD 1-1", x0 + 3 * u, y0 + 1.5 * u);
  ledStrip(g, h - 8 * u, w, 1.5 * u);
  return c;
}

/** A gaming desk: black, with an RGB strip along the front edge and a glass-sided PC tower. */
function pcDeskCanvas() {
  const c = canvas(TEX_UNITS.pcdesk, SURFACE_HEIGHT.pcdesk);
  const g = c.getContext("2d")!;
  const { width: w, height: h } = c;
  const u = PPU;
  g.fillStyle = "#18181b";
  g.fillRect(0, 0, w, h);
  ledStrip(g, 1 * u, w, 1.2 * u);
  // The PC tower with its glowing fans.
  g.fillStyle = "#27272a";
  g.fillRect(4 * u, 5 * u, 12 * u, h - 6 * u);
  for (const [i, col] of ["#d946ef", "#06b6d4"].entries()) {
    const cy = (10 + i * 8) * u;
    const fan = g.createRadialGradient(10 * u, cy, 0.5 * u, 10 * u, cy, 3.4 * u);
    fan.addColorStop(0, "#f8fafc");
    fan.addColorStop(0.5, col);
    fan.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = fan;
    g.fillRect(6 * u, cy - 4 * u, 8 * u, 8 * u);
  }
  // Desk leg.
  g.fillStyle = "#3f3f46";
  g.fillRect(w - 6 * u, 5 * u, 3 * u, h - 5 * u);
  return c;
}

/** A gaming monitor: the stand below, the screen up top showing a shooter HUD. */
function monitorCanvas() {
  const c = canvas(TEX_UNITS.monitor, SURFACE_HEIGHT.monitor);
  const g = c.getContext("2d")!;
  const { width: w, height: h } = c;
  const u = PPU;
  g.fillStyle = "#18181b";
  g.fillRect(0, 0, w, h);
  // Bezel and screen, from just above the desk to the top.
  g.fillStyle = "#09090b";
  g.fillRect(4 * u, 2 * u, w - 8 * u, 22 * u);
  const scr = g.createLinearGradient(0, 3 * u, 0, 22 * u);
  scr.addColorStop(0, "#1e3a8a");
  scr.addColorStop(1, "#0f766e");
  g.fillStyle = scr;
  g.fillRect(5 * u, 3 * u, w - 10 * u, 19 * u);
  // Crosshair, health bar and a minimap.
  g.strokeStyle = "#f8fafc";
  g.lineWidth = 0.6 * u;
  g.beginPath();
  g.moveTo(w / 2 - 2 * u, 12 * u);
  g.lineTo(w / 2 + 2 * u, 12 * u);
  g.moveTo(w / 2, 10 * u);
  g.lineTo(w / 2, 14 * u);
  g.stroke();
  g.fillStyle = "#22c55e";
  g.fillRect(7 * u, 19 * u, 12 * u, 1.4 * u);
  g.fillStyle = "rgba(15,23,42,0.8)";
  g.fillRect(w - 14 * u, 5 * u, 8 * u, 7 * u);
  g.fillStyle = "#f43f5e";
  g.fillRect(w - 11 * u, 8 * u, 1.2 * u, 1.2 * u);
  return c;
}

/** A comfy dark couch: cushions along the front. */
function couchCanvas() {
  const c = canvas(TEX_UNITS.couch, SURFACE_HEIGHT.couch);
  const g = c.getContext("2d")!;
  const { width: w, height: h } = c;
  const u = PPU;
  g.fillStyle = "#3f3f46";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#52525b";
  for (let x = 1; x < 40; x += 13) g.fillRect(x * u, 2 * u, 12 * u, 10 * u);
  g.fillStyle = "#27272a";
  g.fillRect(0, h - 4 * u, w, 4 * u);
  return c;
}

/** A squashy purple beanbag. */
function beanbagCanvas() {
  const c = canvas(TEX_UNITS.beanbag, SURFACE_HEIGHT.beanbag);
  const g = c.getContext("2d")!;
  const { width: w, height: h } = c;
  const shade = g.createLinearGradient(0, 0, w, 0);
  shade.addColorStop(0, "#581c87");
  shade.addColorStop(0.5, "#a855f7");
  shade.addColorStop(1, "#581c87");
  g.fillStyle = shade;
  g.fillRect(0, 0, w, h);
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
    else if (surface === "tardis") c = tardisCanvas();
    else if (surface === "tardiswall") c = roundelCanvas();
    else if (surface === "tardisdoor") c = tardisDoorCanvas();
    else if (surface === "console") c = consoleCanvas();
    else if (surface === "rotor") c = rotorCanvas();
    else if (surface === "strut") c = strutCanvas();
    else if (surface === "gamerwall") c = gamerWallCanvas();
    else if (surface === "arcade") c = arcadeCanvas();
    else if (surface === "tvscreen") c = tvCanvas();
    else if (surface === "pcdesk") c = pcDeskCanvas();
    else if (surface === "monitor") c = monitorCanvas();
    else if (surface === "couch") c = couchCanvas();
    else if (surface === "beanbag") c = beanbagCanvas();
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
const FLOOR_KINDS: (FloorPattern | "hall")[] = ["hall", "court", "carpet", "checker", "tiles", "stripes", "splatter", "neon"];
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
/** How far a point is from the middle of the TARDIS console room. */
function fromConsole(x: number, y: number) {
  return Math.hypot(x - (TARDIS_INSIDE.x + TARDIS_INSIDE.w / 2), y - (TARDIS_INSIDE.y + TARDIS_INSIDE.h / 2));
}

export function floorTexel(x: number, y: number): number {
  if (inTardis(x, y)) {
    // A glass floor lit orange from below, crossed by a triangle grid, with a
    // copper ring around the console platform.
    const d = fromConsole(x, y);
    if (d > 66 && d < 74) return rgb(184, 115, 51);
    const tri = Math.min(mod(x, 26), mod(x * 0.5 + y * 0.866, 26), mod(x * 0.5 - y * 0.866, 26));
    const glow = Math.max(0, 1 - d / 420);
    if (tri < 1.4) return rgb(253, 186 - 40 * (1 - glow), 116 - 60 * (1 - glow));
    return rgb(70 + 60 * glow, 34 + 30 * glow, 14 + 8 * glow);
  }
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
    case "neon": {
      // The Game Room: a dark floor with a glowing magenta and cyan grid.
      const gx = mod(x, 40);
      const gy = mod(y, 40);
      if (gx < 1.4) return rgb(217, 70, 239);
      if (gy < 1.4) return rgb(34, 211, 238);
      return rgb(18, 10, 36);
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
  if (y > SCHOOL_HEIGHT) {
    // The Game Room: dark, with rows of RGB LED strips cycling through the colours.
    if (mod(y, 60) < 3) {
      const hue = mod(x / 40, RGB_STOPS.length) | 0;
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(RGB_STOPS[hue].slice(i, i + 2), 16));
      return rgb(r, g, b) | GLOW;
    }
    return rgb(14, 8, 26);
  }
  if (inTardis(x, y)) {
    // Dark bronze, with an amber ring above the console and roundel lights dotted around.
    const d = fromConsole(x, y);
    if (d > 50 && d < 64) return rgb(253, 186, 116) | GLOW;
    if (Math.hypot(mod(x, 70) - 35, mod(y, 70) - 35) < 6) return rgb(254, 243, 199) | GLOW;
    return rgb(52, 32, 18);
  }
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
