import { PLAYER_HEIGHT, TEAM_COLORS, type Team } from "@/shared/constants";
import type { ArchetypeId } from "@/shared/archetypes";
import { SKIN, drawFace, drawOutfit } from "./skins";
import type { Instrument } from "./instruments";

/**
 * Real 3D players for the first-person view. Each player is a small blocky
 * figure (shoes, legs, torso, arms, head and a few class accessories) built
 * from boxes in 3D, projected through the same camera as the raycaster, back
 * faces culled, lit from above and drawn far to near. The class face and
 * outfit are painted onto the head and torso as textures, legs and arms swing
 * as they walk, and the throwing arm holds the ball out in front.
 */

/** What the 3D parts are projected through: the raycaster's camera. */
export interface Camera3D {
  x: number;
  y: number;
  /** Eye height in world units. */
  eye: number;
  yaw: number;
  /** Screen width, the horizon line (moved by looking up and down) and the projection scale. */
  w: number;
  horizon: number;
  proj: number;
  shakeX: number;
}

type V3 = [number, number, number];
type FaceId = "front" | "back" | "right" | "left" | "top" | "bottom";

/** A box in a figure's own space: s is to its right, f is forward, z is up. */
interface Part {
  c: V3;
  /** Half sizes along s, f and z. */
  h: V3;
  color: string;
  /** Colors or textures for particular faces; the rest use `color`. */
  faces?: Partial<Record<FaceId, string | HTMLCanvasElement>>;
  /** Swing around the s axis through this (f, z) point, by `swing` radians (positive swings forward). */
  pivot?: [number, number];
  swing?: number;
}

/** Corner signs (s, f, z) of each face as seen from outside: top-left, top-right, bottom-left; and its normal. */
const FACES: Record<FaceId, { tl: V3; tr: V3; bl: V3; n: V3 }> = {
  front: { tl: [1, 1, 1], tr: [-1, 1, 1], bl: [1, 1, -1], n: [0, 1, 0] },
  back: { tl: [-1, -1, 1], tr: [1, -1, 1], bl: [-1, -1, -1], n: [0, -1, 0] },
  right: { tl: [1, -1, 1], tr: [1, 1, 1], bl: [1, -1, -1], n: [1, 0, 0] },
  left: { tl: [-1, 1, 1], tr: [-1, -1, 1], bl: [-1, 1, -1], n: [-1, 0, 0] },
  top: { tl: [1, 1, 1], tr: [-1, 1, 1], bl: [1, -1, 1], n: [0, 0, 1] },
  bottom: { tl: [1, -1, -1], tr: [-1, -1, -1], bl: [1, 1, -1], n: [0, 0, -1] },
};
const FACE_IDS = Object.keys(FACES) as FaceId[];

/** Light comes from above and a little to one side. */
const LIGHT: V3 = (() => {
  const v: V3 = [0.35, -0.45, 0.82];
  const l = Math.hypot(...v);
  return v.map((x) => x / l) as V3;
})();

const PANTS = "#334155";
const SHOES = "#111827";
/** Sleeves and the sides of the jacket, for classes that wear one over the team shirt. */
const SLEEVES: Partial<Record<ArchetypeId, string>> = {
  teacher: "#3f6212",
  jock: "#f8fafc",
  principal: "#1f2937",
  orchestra: "#111827",
};

// ---------------------------------------------------------------- textures

const TEX = 64;
const texCache = new Map<string, HTMLCanvasElement>();

function makeTex(key: string, paint: (g: CanvasRenderingContext2D) => void) {
  let c = texCache.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = TEX;
    c.height = TEX;
    paint(c.getContext("2d")!);
    texCache.set(key, c);
  }
  return c;
}

function headTex(a: ArchetypeId, side: "front" | "back" | "side" | "top") {
  return makeTex(`head:${side}:${a}`, (g) => {
    g.fillStyle = SKIN[a];
    g.fillRect(0, 0, TEX, TEX);
    if (side === "front") {
      // A head drawn a bit bigger than the face of the cube, so the face fills it edge to edge.
      drawFace(g, TEX / 2, TEX / 2, TEX * 0.72, a);
    } else if (side === "back") {
      drawFace(g, TEX / 2, TEX / 2, TEX * 0.72, a, Math.PI);
    } else if (side === "top") {
      if (a === "principal") {
        g.fillStyle = "rgba(255,255,255,0.3)";
        g.beginPath();
        g.ellipse(TEX * 0.4, TEX * 0.45, TEX * 0.22, TEX * 0.12, -0.4, 0, Math.PI * 2);
        g.fill();
      } else {
        g.drawImage(headTex(a, "back"), 0, 0);
      }
    } else {
      // The side: hair (or the Principal's fringe) from the back of the head, and an ear.
      g.save();
      if (a !== "principal") {
        g.beginPath();
        g.rect(0, 0, TEX, TEX * 0.4);
        g.clip();
      }
      g.drawImage(headTex(a, "back"), 0, 0);
      g.restore();
      g.fillStyle = "rgba(0,0,0,0.15)";
      g.beginPath();
      g.ellipse(TEX * 0.5, TEX * 0.55, TEX * 0.09, TEX * 0.13, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function torsoTex(a: ArchetypeId, team: Team, back: boolean) {
  return makeTex(`torso:${back ? "back" : "front"}:${a}:${team}`, (g) => {
    g.fillStyle = TEAM_COLORS[team];
    g.fillRect(0, 0, TEX, TEX);
    drawOutfit(g, a, 0, 0, TEX, TEX, back);
  });
}

// ---------------------------------------------------------------- color helpers

const rgbCache = new Map<string, V3>();
function rgb(color: string): V3 {
  let v = rgbCache.get(color);
  if (!v) {
    const hex = color.replace("#", "");
    const full = hex.length === 3 ? [...hex].map((ch) => ch + ch).join("") : hex;
    const n = parseInt(full, 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(color, v);
  }
  return v;
}

// ---------------------------------------------------------------- the renderer

interface Drawable {
  depth: number;
  draw: () => void;
}

interface Screen {
  sx: number;
  sy: number;
  depth: number;
}

function project(cam: Camera3D, X: number, Y: number, Z: number): Screen {
  const dx = X - cam.x;
  const dy = Y - cam.y;
  const c = Math.cos(cam.yaw);
  const s = Math.sin(cam.yaw);
  const depth = dx * c + dy * s;
  const lat = -dx * s + dy * c;
  const d = Math.max(0.001, depth);
  return {
    sx: cam.w / 2 + (lat * cam.proj) / d + cam.shakeX,
    sy: cam.horizon - ((Z - cam.eye) * cam.proj) / d,
    depth,
  };
}

/** Where a figure stands and faces, and how big it is (1 = a regular student). */
interface Placement {
  x: number;
  y: number;
  z: number;
  angle: number;
  k: number;
}

/**
 * Turn a figure's parts into screen polygons, cull the faces turned away
 * from the camera, and add them to the draw list.
 */
function addParts(
  out: Drawable[],
  ctx: CanvasRenderingContext2D,
  cam: Camera3D,
  parts: Part[],
  at: Placement,
  fog: (d: number) => number,
  fogColor: V3,
) {
  const fx = Math.cos(at.angle);
  const fy = Math.sin(at.angle);
  const sx = -fy;
  const sy = fx;
  for (const part of parts) {
    const th = part.swing ?? 0;
    const cs = Math.cos(th);
    const sn = Math.sin(th);
    const [pf, pz] = part.pivot ?? [0, 0];
    const toWorld = (ls: number, lf: number, lz: number): V3 => {
      if (th) {
        const df = lf - pf;
        const dz = lz - pz;
        lf = pf + df * cs - dz * sn;
        lz = pz + df * sn + dz * cs;
      }
      return [at.x + (lf * fx + ls * sx) * at.k, at.y + (lf * fy + ls * sy) * at.k, at.z + lz * at.k];
    };
    const corner = (sg: V3) =>
      toWorld(part.c[0] + sg[0] * part.h[0], part.c[1] + sg[1] * part.h[1], part.c[2] + sg[2] * part.h[2]);
    for (const id of FACE_IDS) {
      const f = FACES[id];
      // Normal in the world, after the swing.
      const nf = f.n[1] * cs - f.n[2] * sn;
      const nz = f.n[1] * sn + f.n[2] * cs;
      const N: V3 = [nf * fx + f.n[0] * sx, nf * fy + f.n[0] * sy, nz];
      const tl = corner(f.tl);
      const tr = corner(f.tr);
      const bl = corner(f.bl);
      const br: V3 = [tr[0] + bl[0] - tl[0], tr[1] + bl[1] - tl[1], tr[2] + bl[2] - tl[2]];
      const cx = (tr[0] + bl[0]) / 2;
      const cy = (tr[1] + bl[1]) / 2;
      const cz = (tr[2] + bl[2]) / 2;
      // Back-face culling: skip faces pointing away from the eye.
      if (N[0] * (cam.x - cx) + N[1] * (cam.y - cy) + N[2] * (cam.eye - cz) <= 0) continue;
      const q = [tl, tr, br, bl].map((v) => project(cam, v[0], v[1], v[2]));
      if (q.some((v) => v.depth < 1.5)) continue;
      const depth = (q[0].depth + q[1].depth + q[2].depth + q[3].depth) / 4;
      const light = 0.56 + 0.44 * Math.max(0, N[0] * LIGHT[0] + N[1] * LIGHT[1] + N[2] * LIGHT[2]);
      const fogAmt = fog(depth);
      const look = part.faces?.[id] ?? part.color;
      out.push({
        depth,
        draw: () => {
          const path = () => {
            ctx.beginPath();
            ctx.moveTo(q[0].sx, q[0].sy);
            ctx.lineTo(q[1].sx, q[1].sy);
            ctx.lineTo(q[2].sx, q[2].sy);
            ctx.lineTo(q[3].sx, q[3].sy);
            ctx.closePath();
          };
          if (typeof look === "string") {
            const [r, g, b] = rgb(look).map((v, i) => Math.round(v * light * (1 - fogAmt) + fogColor[i] * fogAmt));
            const fill = `rgb(${r},${g},${b})`;
            path();
            ctx.fillStyle = fill;
            ctx.fill();
            // A hairline in the same color hides the seams between faces.
            ctx.strokeStyle = fill;
            ctx.lineWidth = 0.75;
            ctx.stroke();
          } else {
            // Map the texture onto the face: its corners go to top-left, top-right and bottom-left.
            path();
            ctx.save();
            ctx.clip();
            ctx.transform(
              (q[1].sx - q[0].sx) / TEX,
              (q[1].sy - q[0].sy) / TEX,
              (q[3].sx - q[0].sx) / TEX,
              (q[3].sy - q[0].sy) / TEX,
              q[0].sx,
              q[0].sy,
            );
            ctx.drawImage(look, 0, 0);
            ctx.restore();
            path();
            ctx.fillStyle = `rgba(0,0,0,${(1 - light).toFixed(3)})`;
            ctx.fill();
            if (fogAmt > 0.01) {
              ctx.fillStyle = `rgba(${fogColor[0]},${fogColor[1]},${fogColor[2]},${fogAmt.toFixed(3)})`;
              ctx.fill();
            }
          }
        },
      });
    }
  }
}

/** A shaded ball, held in the hand or flying. */
function addBall(
  out: Drawable[],
  ctx: CanvasRenderingContext2D,
  cam: Camera3D,
  X: number,
  Y: number,
  Z: number,
  radius: number,
  color: string,
  fogAmt: number,
) {
  const p = project(cam, X, Y, Z);
  if (p.depth < 1.5) return;
  const r = (radius * cam.proj) / p.depth;
  out.push({
    // Drawn just in front of whatever it's touching, like the hand holding it.
    depth: p.depth - radius,
    draw: () => {
      const g = ctx.createRadialGradient(p.sx - r * 0.35, p.sy - r * 0.35, r * 0.1, p.sx, p.sy, r);
      g.addColorStop(0, "rgba(255,255,255,0.65)");
      g.addColorStop(0.35, color);
      g.addColorStop(1, "#000");
      ctx.globalAlpha = 1 - fogAmt * 0.8;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha *= 0.55;
      ctx.fillStyle = g;
      ctx.fill();
      ctx.globalAlpha = 1;
    },
  });
}

function flush(out: Drawable[]) {
  out.sort((a, b) => b.depth - a.depth);
  for (const d of out) d.draw();
}

// ---------------------------------------------------------------- figures

/** A regular student is this tall; bigger classes are scaled up. */
export const FIGURE_HEIGHT = PLAYER_HEIGHT;

/** The parts of a figure, standing at the origin and facing +f. */
function figureParts(a: ArchetypeId, team: Team, walk: number, throwArm: number): Part[] {
  const shirt = TEAM_COLORS[team];
  const sleeve = SLEEVES[a] ?? shirt;
  const mascot = a === "blueberry" || a === "orangepeel";
  // Mascots wear big white gloves.
  const skin = mascot ? "#f8fafc" : SKIN[a];
  const parts: Part[] = [];
  // Legs swing from the hips, opposite each other.
  for (const s of [-1, 1]) {
    const swing = walk * s;
    parts.push(
      { c: [s * 4.2, 0, 13.5], h: [3.6, 3.6, 9.5], color: PANTS, pivot: [0, 23], swing },
      { c: [s * 4.2, 1.2, 2], h: [3.8, 5, 2], color: SHOES, pivot: [0, 23], swing },
    );
  }
  // Torso: the outfit front and back, jacket or shirt on the sides.
  parts.push({
    c: [0, 0, 32],
    h: [10, 5.5, 9.5],
    color: sleeve,
    faces: { front: torsoTex(a, team, false), back: torsoTex(a, team, true), bottom: PANTS },
  });
  // The left arm swings with the walk; the right holds the ball out in front.
  for (const [s, swing] of [
    [-1, -walk * 0.8],
    [1, throwArm],
  ] as const) {
    parts.push(
      { c: [s * 13.2, 0, 34.5], h: [3, 3, 6.5], color: sleeve, pivot: [0, 40], swing },
      { c: [s * 13.2, 0, 26], h: [2.6, 2.6, 2], color: skin, pivot: [0, 40], swing },
    );
  }
  // Head, with the face on the front. A mascot's head is a big piece of fruit.
  const hs = mascot ? 10 : 7;
  parts.push({
    c: [0, 0, 41.5 + hs],
    h: [hs, hs, hs],
    color: SKIN[a],
    faces: {
      front: headTex(a, "front"),
      back: headTex(a, "back"),
      left: headTex(a, "side"),
      right: headTex(a, "side"),
      top: headTex(a, "top"),
    },
  });
  // A few class accessories that stick out of the head.
  if (a === "teacher") parts.push({ c: [0, -6.5, 54], h: [3, 2.5, 3], color: "#6b4423" });
  if (a === "artkid") parts.push({ c: [1, 0.5, 56.2], h: [8, 8, 1.3], color: "#b91c1c" });
  if (a === "jock") parts.push({ c: [0, 0, 51.5], h: [7.3, 7.3, 1], color: "#dc2626" });
  if (a === "bandkid") {
    // The marching shako: navy, a gold band, a black visor and a tall white plume.
    parts.push(
      { c: [0, 0, 60], h: [6.5, 6.5, 4.5], color: "#1e3a8a" },
      { c: [0, 0, 56.3], h: [6.7, 6.7, 0.8], color: "#facc15" },
      { c: [0, 7.5, 55.6], h: [5, 2.2, 0.5], color: "#111827" },
      { c: [0, 1.5, 67], h: [1.3, 1.3, 3], color: "#f8fafc" },
    );
  }
  if (a === "clown") {
    parts.push(
      { c: [-8.5, -1, 51], h: [2.5, 4.5, 4], color: "#f59e0b" },
      { c: [8.5, -1, 51], h: [2.5, 4.5, 4], color: "#3b82f6" },
      { c: [0, -1, 56.5], h: [5, 5, 1.6], color: "#ef4444" },
    );
  }
  if (a === "principal") {
    for (const s of [-1, 1]) parts.push({ c: [s * 7.4, -1, 47.5], h: [0.8, 4, 2.2], color: "#9ca3af" });
  }
  if (a === "blueberry") {
    // The blueberry's crown: a dark star of little points on top.
    parts.push({ c: [0, 0, 62], h: [3.5, 3.5, 0.8], color: "#1e1b4b" });
    for (const [s, f] of [
      [0, 4.5],
      [4.3, 1.4],
      [2.6, -3.6],
      [-2.6, -3.6],
      [-4.3, 1.4],
    ]) {
      parts.push({ c: [s, f, 62.2], h: [1.3, 1.3, 1], color: "#1e1b4b" });
    }
  }
  if (a === "orangepeel") {
    parts.push(
      { c: [0, 0, 62.8], h: [0.8, 0.8, 1.6], color: "#78350f" },
      { c: [3.2, 0.5, 63.6], h: [3.2, 1.4, 0.5], color: "#16a34a" },
    );
  }
  return parts;
}

// ---------------------------------------------------------------- instruments

const GOLD = "#eab308";
const GOLD_DARK = "#a16207";
const SILVER = "#e5e7eb";
const WOOD = "#92400e";
const WOOD_DARK = "#451a03";
const BOW = "#d6d3d1";

/** A violin-family body: lower and upper bouts with a narrower waist, plus the neck. */
function stringParts(c: V3, size: number, upright: boolean): Part[] {
  const [s, f, z] = c;
  if (upright) {
    // Cello and bass: standing on the floor, neck up.
    return [
      { c: [s, f, z - 2.6 * size], h: [3.2 * size, 1.4 * size, 3.4 * size], color: WOOD },
      { c: [s, f, z + 3 * size], h: [2.6 * size, 1.3 * size, 2.6 * size], color: WOOD },
      { c: [s, f, z + 8 * size], h: [0.5 * size, 0.5 * size, 3 * size], color: WOOD_DARK },
    ];
  }
  // Violin and viola: lying along f, under the chin.
  return [
    { c: [s, f - 1.6 * size, z], h: [1.8 * size, 1.8 * size, 0.6 * size], color: WOOD },
    { c: [s, f + 1.6 * size, z], h: [1.5 * size, 1.5 * size, 0.6 * size], color: WOOD },
    { c: [s, f + 5 * size, z + 0.2], h: [0.35 * size, 2 * size, 0.3 * size], color: WOOD_DARK },
  ];
}

/** An instrument held by a figure, in the figure's own space (s right, f forward, z up). */
function instrumentParts(kind: Instrument): Part[] {
  switch (kind) {
    case "trumpet":
      return [
        { c: [1.5, 13, 46], h: [0.8, 6, 0.8], color: GOLD },
        { c: [1.5, 11, 47.8], h: [0.9, 1.6, 1.1], color: GOLD_DARK },
        { c: [1.5, 20, 46], h: [2.6, 1.2, 2.6], color: GOLD },
      ];
    case "trombone":
      return [
        { c: [0.5, 21, 46.5], h: [0.45, 13, 0.45], color: GOLD },
        { c: [0.5, 21, 44.5], h: [0.45, 13, 0.45], color: GOLD },
        { c: [0.5, 34, 45.5], h: [0.45, 0.45, 1.5], color: GOLD },
        { c: [3.5, 12, 47.5], h: [2.8, 1, 2.8], color: GOLD },
      ];
    case "tuba":
      return [
        { c: [0, 9, 34], h: [5, 3.5, 7], color: GOLD },
        { c: [2, 8, 44], h: [5, 5, 1.8], color: GOLD },
        { c: [2, 8, 45.9], h: [3.6, 3.6, 0.3], color: GOLD_DARK },
      ];
    case "sax":
      return [
        { c: [1, 8.5, 42], h: [0.6, 0.6, 4], color: GOLD },
        { c: [1, 9, 33], h: [1.4, 1.4, 6], color: GOLD },
        { c: [1, 11, 26.5], h: [2.6, 2.6, 1.5], color: GOLD },
      ];
    case "flute":
      return [{ c: [7, 8, 46], h: [8, 0.5, 0.5], color: SILVER }];
    case "drum":
      return [
        { c: [0, 10, 28], h: [6, 6, 2.6], color: "#f8fafc" },
        { c: [0, 10, 30.8], h: [6.2, 6.2, 0.3], color: "#dc2626" },
        { c: [-5, 9, 35], h: [0.4, 5, 0.4], color: "#d6a76b" },
        { c: [5, 9, 35], h: [0.4, 5, 0.4], color: "#d6a76b" },
      ];
    case "cymbals":
      return [
        { c: [-11, 10, 38], h: [0.4, 5, 5], color: GOLD },
        { c: [11, 10, 38], h: [0.4, 5, 5], color: GOLD },
      ];
    case "violin":
    case "viola": {
      const size = kind === "viola" ? 1.15 : 1;
      return [...stringParts([-5, 9, 43], size, false), { c: [5, 10, 41], h: [8 * size, 0.3, 0.3], color: BOW }];
    }
    case "cello":
    case "bass": {
      const size = kind === "bass" ? 1.45 : 1;
      return [...stringParts([0, 10, 13 * size], size * 1.6, true), { c: [0, 13, 18 * size], h: [9 * size, 0.35, 0.35], color: BOW }];
    }
  }
}

/** The same instrument as you see it in your own hands, in first person (relative to your eye). */
function heldInstrumentParts(kind: Instrument, bobS: number, bobZ: number): Part[] {
  const at = (p: Part): Part => ({ ...p, c: [p.c[0] + bobS, p.c[1], p.c[2] + bobZ] });
  // Your view reaches about 0.4 units down for every unit forward, so these sit a little way out.
  let parts: Part[];
  switch (kind) {
    case "trumpet":
      // Up to your lips, pointing where you aim.
      parts = [
        { c: [1.5, 23, -4], h: [0.4, 11, 0.4], color: GOLD },
        { c: [1.5, 18, -2.8], h: [0.5, 1.5, 0.8], color: GOLD_DARK },
        { c: [1.5, 35, -4], h: [2.2, 0.8, 2.2], color: GOLD },
      ];
      break;
    case "trombone":
      parts = [
        { c: [1, 30, -4.5], h: [0.3, 18, 0.3], color: GOLD },
        { c: [1, 30, -6], h: [0.3, 18, 0.3], color: GOLD },
        { c: [1, 48, -5.25], h: [0.3, 0.3, 0.9], color: GOLD },
        { c: [5, 22, -3], h: [2, 0.8, 2], color: GOLD },
      ];
      break;
    case "tuba":
      // The big bell rises up at your right.
      parts = [
        { c: [10, 26, -10], h: [3.5, 2.5, 4], color: GOLD },
        { c: [10, 26, -6], h: [4.5, 4.5, 1], color: GOLD },
        { c: [10, 26, -4.9], h: [3.3, 3.3, 0.2], color: GOLD_DARK },
      ];
      break;
    case "sax":
      parts = [
        { c: [2, 16, -4], h: [0.4, 3, 0.4], color: GOLD },
        { c: [5, 24, -8], h: [0.9, 0.9, 4], color: GOLD },
        { c: [5, 25, -11], h: [2, 2, 1], color: GOLD },
      ];
      break;
    case "flute":
      // Held sideways, off to the right.
      parts = [{ c: [6, 16, -3.5], h: [9, 0.35, 0.35], color: SILVER }];
      break;
    case "drum":
      // A snare drum in front of you, sticks ready.
      parts = [
        { c: [0, 34, -12], h: [6, 6, 1.4], color: "#f8fafc" },
        { c: [0, 34, -10.5], h: [6.2, 6.2, 0.2], color: "#dc2626" },
        { c: [-4, 24, -7], h: [0.3, 6, 0.3], color: "#d6a76b", pivot: [18, -7], swing: -0.4 },
        { c: [4, 24, -7], h: [0.3, 6, 0.3], color: "#d6a76b", pivot: [18, -7], swing: -0.4 },
      ];
      break;
    case "cymbals":
      parts = [
        { c: [-9, 24, -6], h: [0.25, 4, 4], color: GOLD },
        { c: [9, 24, -6], h: [0.25, 4, 4], color: GOLD },
      ];
      break;
    case "violin":
    case "viola": {
      // Tucked under your chin on the left, with the bow across it.
      const size = kind === "viola" ? 1.15 : 1;
      parts = [...stringParts([-5, 22, -4], size * 1.2, false), { c: [2, 24, -6], h: [8 * size, 0.25, 0.25], color: BOW }];
      break;
    }
    case "cello":
    case "bass": {
      // Standing in front of you, neck up, bow across the strings.
      const bass = kind === "bass";
      const size = bass ? 2 : 1.6;
      const f = bass ? 38 : 34;
      parts = [
        ...stringParts([bass ? 8 : 7, f, bass ? -13 : -12], size, true),
        { c: [3, f - 4, -12], h: [8, 0.3, 0.3], color: BOW },
      ];
      break;
    }
  }
  return parts.map(at);
}

/** Walk cycle per player, from how far they moved since the last frame. */
const gait = new Map<string, { x: number; y: number; t: number; phase: number; amp: number }>();

function walkFor(id: string, x: number, y: number, now: number) {
  let g = gait.get(id);
  if (!g) {
    g = { x, y, t: now, phase: 0, amp: 0 };
    gait.set(id, g);
  }
  const dt = Math.max(1, now - g.t) / 1000;
  const moved = Math.min(60, Math.hypot(x - g.x, y - g.y));
  const target = Math.min(1, moved / dt / 140);
  g.amp += (target - g.amp) * Math.min(1, dt * 10);
  g.phase += moved * 0.085;
  g.x = x;
  g.y = y;
  g.t = now;
  return g;
}

export interface AvatarDraw {
  /** Screen x of the figure's middle and the y of the top of its head. */
  cx: number;
  top: number;
  bottom: number;
  /** Screen pixels per world unit at its distance. */
  k: number;
}

/**
 * Draw one player as a 3D figure (with its shadow and the ball in hand).
 * Returns where it landed on screen, for name tags and health bars.
 */
export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  cam: Camera3D,
  o: {
    id: string;
    x: number;
    y: number;
    aim: number;
    archetype: ArchetypeId;
    team: Team;
    /** 1 for a regular student; bigger classes are bigger. */
    scale: number;
    ballColor: string;
    ballRadius: number;
    /** The instrument they're playing, held in place of a ball. */
    instrument: Instrument | null;
    now: number;
    stunned: boolean;
  },
  fog: (d: number) => number,
  fogColor: V3,
): AvatarDraw | null {
  const center = project(cam, o.x, o.y, 0);
  if (center.depth < 8) return null;
  const g = walkFor(o.id, o.x, o.y, o.now);
  const walk = o.stunned ? 0 : Math.sin(g.phase) * 0.65 * g.amp;
  // Bob a little while walking; wobble when stunned.
  const bob = Math.abs(Math.cos(g.phase)) * 1.2 * g.amp;
  const angle = o.aim + (o.stunned ? Math.sin(o.now / 120) * 0.35 : 0);
  const throwArm = 1.3 + Math.sin(o.now / 400 + o.x) * 0.05 - walk * 0.1;
  const k = o.scale;
  const at: Placement = { x: o.x, y: o.y, z: bob * k, angle, k };
  const fogAmt = fog(center.depth);

  // Shadow on the floor.
  ctx.fillStyle = `rgba(0,0,0,${(0.32 * (1 - fogAmt)).toFixed(3)})`;
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const t = (i / 12) * Math.PI * 2;
    const p = project(cam, o.x + Math.cos(t) * 15 * k, o.y + Math.sin(t) * 15 * k, 0.5);
    if (i === 0) ctx.moveTo(p.sx, p.sy);
    else ctx.lineTo(p.sx, p.sy);
  }
  ctx.fill();

  const out: Drawable[] = [];
  addParts(out, ctx, cam, figureParts(o.archetype, o.team, walk, throwArm), at, fog, fogColor);
  if (o.instrument) {
    // Band and orchestra kids hold their instrument instead of a ball.
    addParts(out, ctx, cam, instrumentParts(o.instrument), at, fog, fogColor);
  } else {
    // The ball sits at the end of the raised right arm.
    const reach = 17;
    const hf = Math.sin(throwArm) * reach + 1.5;
    const hz = 40 - Math.cos(throwArm) * reach + 3;
    const fx = Math.cos(angle);
    const fy = Math.sin(angle);
    const bs = 12.5;
    addBall(
      out,
      ctx,
      cam,
      o.x + (hf * fx - bs * fy) * k,
      o.y + (hf * fy + bs * fx) * k,
      at.z + hz * k,
      o.ballRadius * k,
      o.ballColor,
      fogAmt,
    );
  }
  flush(out);

  // Mascots have a big fruit head on top.
  const tall = o.archetype === "blueberry" || o.archetype === "orangepeel" ? 64 : FIGURE_HEIGHT;
  const top = project(cam, o.x, o.y, at.z + tall * k);
  return { cx: top.sx, top: top.sy, bottom: center.sy, k: cam.proj / center.depth };
}

/** A throw in flight, as a shaded ball at chest height. */
export function drawBall3D(
  ctx: CanvasRenderingContext2D,
  cam: Camera3D,
  x: number,
  y: number,
  z: number,
  radius: number,
  color: string,
  fogAmt: number,
) {
  // Its shadow on the floor, fainter the higher it flies, so you can judge the arc.
  const shade = 0.35 * (1 - fogAmt) * Math.max(0, 1 - z / 90);
  if (shade > 0.02) floorPolygon(ctx, cam, x, y, radius * 1.1, 10, `rgba(0,0,0,${shade.toFixed(3)})`);
  const out: Drawable[] = [];
  addBall(out, ctx, cam, x, y, z, radius, color, fogAmt);
  flush(out);
}

/** A hit or impact spark at a point in the air, sized by distance. */
export function drawSpark3D(
  ctx: CanvasRenderingContext2D,
  cam: Camera3D,
  x: number,
  y: number,
  z: number,
  size: number,
  color: string,
  alpha: number,
) {
  const p = project(cam, x, y, z);
  if (p.depth < 4) return;
  const s = Math.max(1, (size * 0.6 * cam.proj) / p.depth);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(p.sx - s / 2, p.sy - s / 2, s, s);
  ctx.globalAlpha = 1;
}

/** Fill a circle lying flat on the floor. Skipped if any of it is behind the camera. */
function floorPolygon(ctx: CanvasRenderingContext2D, cam: Camera3D, x: number, y: number, r: number, sides: number, fill: string, wobble = 0) {
  const pts: Screen[] = [];
  for (let i = 0; i < sides; i++) {
    const t = (i / sides) * Math.PI * 2;
    const rr = r * (1 + wobble * Math.sin(i * 2.7));
    const p = project(cam, x + Math.cos(t) * rr, y + Math.sin(t) * rr, 0.6);
    if (p.depth < 2) return;
    pts.push(p);
  }
  ctx.fillStyle = fill;
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.sx, p.sy) : ctx.lineTo(p.sx, p.sy)));
  ctx.closePath();
  ctx.fill();
}

/**
 * Mascot powers lying on the floor: a glossy purple Jam Puddle, or a
 * curled orange Peel Trap with its white pith showing.
 */
export function drawFloorZone3D(
  ctx: CanvasRenderingContext2D,
  cam: Camera3D,
  z: { k: "jam" | "peel"; x: number; y: number; r: number },
  fogAmt: number,
  now: number,
) {
  const a = 1 - fogAmt;
  if (z.k === "jam") {
    floorPolygon(ctx, cam, z.x, z.y, z.r, 24, `rgba(76,29,149,${(0.75 * a).toFixed(3)})`, 0.08);
    floorPolygon(ctx, cam, z.x, z.y, z.r * 0.7, 18, `rgba(124,58,237,${(0.55 * a).toFixed(3)})`, 0.12);
    // Bubbles popping in the jam.
    for (let i = 0; i < 4; i++) {
      const t = now / 700 + i * 1.7;
      const bx = z.x + Math.cos(i * 2.1) * z.r * 0.5;
      const by = z.y + Math.sin(i * 2.1) * z.r * 0.5;
      floorPolygon(ctx, cam, bx, by, 6 + 3 * Math.sin(t), 8, `rgba(196,181,253,${(0.5 * a).toFixed(3)})`);
    }
  } else {
    floorPolygon(ctx, cam, z.x, z.y, z.r, 14, `rgba(249,115,22,${a.toFixed(3)})`, 0.2);
    floorPolygon(ctx, cam, z.x + 3, z.y - 2, z.r * 0.55, 10, `rgba(255,247,237,${(0.9 * a).toFixed(3)})`, 0.25);
  }
}

/**
 * Your own arm in first person: sleeve, hand and the ball you're about to
 * throw, in the lower right, bobbing as you walk. Drawn over everything.
 */
export function drawViewModel(
  ctx: CanvasRenderingContext2D,
  cam: Camera3D,
  o: {
    id: string;
    x: number;
    y: number;
    archetype: ArchetypeId;
    team: Team;
    ballColor: string;
    /** Playing an instrument: shown in your hands instead of the ball. */
    instrument: Instrument | null;
    now: number;
  },
) {
  const g = walkFor(`me:${o.id}`, o.x, o.y, o.now);
  const bobS = Math.cos(g.phase * 0.5) * 1.2 * g.amp;
  const bobZ = -Math.abs(Math.sin(g.phase * 0.5)) * 1.4 * g.amp + Math.sin(o.now / 700) * 0.3;
  const sleeve = SLEEVES[o.archetype] ?? TEAM_COLORS[o.team];
  // The arm reaches up from the bottom right corner; the hand cups the ball from below.
  const parts: Part[] = [
    { c: [11.5 + bobS, 20, -14 + bobZ], h: [2.2, 8, 2.2], color: sleeve, pivot: [20, -14 + bobZ], swing: 0.35 },
    // Mascots wear white gloves.
    {
      c: [10.6 + bobS, 29.5, -11.2 + bobZ],
      h: [2, 2.2, 1.6],
      color: o.archetype === "blueberry" || o.archetype === "orangepeel" ? "#f8fafc" : SKIN[o.archetype],
    },
  ];
  const out: Drawable[] = [];
  const none = () => 0;
  const here: Placement = { x: cam.x, y: cam.y, z: cam.eye, angle: cam.yaw, k: 1 };
  if (o.instrument) {
    // Your instrument, held up to play.
    addParts(out, ctx, cam, [...parts, ...heldInstrumentParts(o.instrument, bobS, bobZ)], here, none, [0, 0, 0]);
  } else {
    addParts(out, ctx, cam, parts, here, none, [0, 0, 0]);
    const fx = Math.cos(cam.yaw);
    const fy = Math.sin(cam.yaw);
    const s = 10.3 + bobS;
    const f = 31;
    addBall(out, ctx, cam, cam.x + f * fx - s * fy, cam.y + f * fy + s * fx, cam.eye - 8.4 + bobZ, 2.4, o.ballColor, 0);
  }
  flush(out);
}
