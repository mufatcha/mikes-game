/**
 * The sea of Wrathwater: islands (terrain, palms, towns, loot), the pirate
 * haven, and the wave math shared by physics and rendering.
 */

/** The playable sea is a square from -WORLD_HALF to +WORLD_HALF; beyond it is a storm wall. */
export const WORLD_HALF = 6000;
/** Height of a beach above the water. */
export const BEACH_TOP = 6;

export type IslandKind = "haven" | "town" | "wild" | "mystery";
export type BuildingKind = "house" | "bank" | "shop" | "armory" | "tavern" | "shipwright" | "blacksmith" | "market";
/** Blackwater Cove's stores: you walk in to use them (they can't be robbed). */
export type ServiceKind = "shipwright" | "blacksmith" | "market";

export interface Building {
  kind: BuildingKind;
  x: number;
  z: number;
  /** Size along x and z (buildings are axis-aligned). */
  w: number;
  d: number;
  h: number;
  /** Ground height under the building. */
  y: number;
  /** Where you stand to rob it. */
  door: { x: number; z: number };
  /** Direction the door faces (radians). */
  facing: number;
}

export type SpotKind = "chest" | "buried" | "crate" | "fruit";

export interface LootSpot {
  id: string;
  kind: SpotKind;
  x: number;
  z: number;
}

export interface Island {
  index: number;
  name: string;
  kind: IslandKind;
  x: number;
  z: number;
  radius: number;
  seed: number;
  haven?: boolean;
  hill: { x: number; z: number; r: number; h: number };
  palms: { x: number; z: number; h: number; lean: number; turn: number }[];
  rocks: { x: number; z: number; s: number }[];
  buildings: Building[];
  spots: LootSpot[];
  /** Where Marine guards (towns) or bandits (camps) stand. */
  guards: { x: number; z: number }[];
  bandits: { x: number; z: number }[];
}

/** Inside this radius around the haven nobody can fire, Marines turn back, and your wanted level drops fast. */
export const HAVEN_SAFE_RADIUS = 760;

const WILD_NAMES = [
  "Skull Reef", "Gallows Key", "Rum Isle", "Driftwood Atoll", "Saltbone Cay", "Widow's Rock",
  "Cutlass Shoal", "Ember Isle", "Hangman's Spit", "Coral Crown", "Lantern Key", "Ironjaw Bluff", "Pearl Hollow",
];
const TOWN_NAMES = ["Port Sterling", "Gildhaven", "Saint Marrow", "Brightwater"];
const MYSTERY_NAME = "Kraken's Tooth";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Height of an island's ground at distance `d` from its center (beach + hill), ignoring other islands. */
function terrainHeight(isl: Pick<Island, "x" | "z" | "radius" | "hill">, x: number, z: number) {
  const d = Math.hypot(x - isl.x, z - isl.z);
  const R = isl.radius;
  if (d >= R) return -1;
  const beach = d > R * 0.86 ? BEACH_TOP * ((R - d) / (R * 0.14)) : BEACH_TOP;
  const dh = Math.hypot(x - isl.hill.x, z - isl.hill.z);
  const hill = dh < isl.hill.r ? BEACH_TOP + isl.hill.h * (0.5 + 0.5 * Math.cos((Math.PI * dh) / isl.hill.r)) : 0;
  return Math.max(beach, hill);
}

/** The cosine dome used for hills; the 3D view builds its hill mesh from this too. */
export function hillProfile(h: number, r: number, dist: number) {
  return BEACH_TOP + h * (0.5 + 0.5 * Math.cos((Math.PI * Math.min(dist, r)) / r));
}

function makeIslands(): Island[] {
  const r = rng(20261113);
  type Raw = { name: string; x: number; z: number; radius: number; seed: number; haven?: boolean };
  const raw: Raw[] = [{ name: "Blackwater Cove", x: 0, z: 0, radius: 300, seed: 7, haven: true }];
  let tries = 0;
  while (raw.length < 19 && tries++ < 6000) {
    const radius = 140 + r() * 300;
    const x = (r() * 2 - 1) * (WORLD_HALF - 700);
    const z = (r() * 2 - 1) * (WORLD_HALF - 700);
    const clear = raw.every((o) => Math.hypot(o.x - x, o.z - z) > o.radius + radius + (o.haven ? 900 : 650));
    if (clear) raw.push({ name: "", x, z, radius, seed: Math.floor(r() * 1e9) });
  }
  // The four biggest islands (besides the haven) become towns; the farthest wild one hides a Devil Fruit.
  const others = raw.slice(1);
  const towns = new Set([...others].sort((a, b) => b.radius - a.radius).slice(0, 4));
  const wild = others.filter((o) => !towns.has(o));
  const mystery = [...wild].sort((a, b) => Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z))[0];
  let townI = 0;
  let wildI = 0;

  return raw.map((o, index) => {
    const kind: IslandKind = o.haven ? "haven" : towns.has(o) ? "town" : o === mystery ? "mystery" : "wild";
    const name =
      kind === "haven" ? o.name : kind === "town" ? TOWN_NAMES[townI++] : kind === "mystery" ? MYSTERY_NAME : WILD_NAMES[wildI++ % WILD_NAMES.length];
    return decorate({ ...o, index, name, kind });
  });
}

/** Lay out an island's hill, palms, rocks, buildings, loot and guards, deterministically from its seed. */
function decorate(o: { index: number; name: string; kind: IslandKind; x: number; z: number; radius: number; seed: number; haven?: boolean }): Island {
  const r = rng(o.seed);
  const R = o.radius;
  const flat = o.kind === "town" || o.kind === "haven";
  const ha = r() * Math.PI * 2;
  const hd = r() * R * 0.15;
  const hill = {
    x: o.x + Math.cos(ha) * hd,
    z: o.z + Math.sin(ha) * hd,
    r: R * (flat ? 0.35 : 0.66),
    h: flat ? 10 + r() * 6 : 22 + R * (0.12 + r() * 0.2),
  };
  const isl: Island = { ...o, hill, palms: [], rocks: [], buildings: [], spots: [], guards: [], bandits: [] };

  const occupied: { x: number; z: number; r: number }[] = [];
  const free = (x: number, z: number, rad: number) =>
    occupied.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + rad) &&
    !isl.buildings.some((b) => Math.abs(x - b.x) < b.w / 2 + rad && Math.abs(z - b.z) < b.d / 2 + rad);
  const landPoint = (minF: number, maxF: number, rad: number) => {
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2;
      const d = R * (minF + r() * (maxF - minF));
      const x = o.x + Math.cos(a) * d;
      const z = o.z + Math.sin(a) * d;
      if (free(x, z, rad)) return { x, z };
    }
    return null;
  };

  // Buildings (towns and the haven), placed in a ring facing the shore.
  if (flat) {
    const kinds: BuildingKind[] =
      o.kind === "town"
        ? ["bank", "armory", "shop", "shop", "tavern", ...Array<BuildingKind>(Math.round(R / 60)).fill("house")]
        : ["shipwright", "blacksmith", "market", "tavern", ...Array<BuildingKind>(5).fill("house")];
    let a0 = r() * Math.PI * 2;
    for (const kind of kinds) {
      const big = kind === "bank" || kind === "tavern" || kind === "armory" || kind === "shipwright";
      const w = big ? 46 + r() * 10 : 26 + r() * 12;
      const dd = big ? 36 + r() * 8 : 22 + r() * 10;
      for (let attempt = 0; attempt < 30; attempt++) {
        const a = a0 + attempt * 0.37;
        const dist = R * (0.42 + r() * 0.3);
        const x = o.x + Math.cos(a) * dist;
        const z = o.z + Math.sin(a) * dist;
        const rotated = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a));
        const bw = rotated ? dd : w;
        const bd = rotated ? w : dd;
        if (!free(x, z, Math.max(bw, bd) * 0.6 + 8)) continue;
        const y = terrainHeight(isl, x, z);
        const facing = a; // door faces outward, toward the shore
        const half = rotated ? bw / 2 : bd / 2;
        isl.buildings.push({
          kind,
          x,
          z,
          w: bw,
          d: bd,
          h: big ? 26 : 16 + r() * 6,
          y,
          door: { x: x + Math.cos(facing) * (half + 10), z: z + Math.sin(facing) * (half + 10) },
          facing,
        });
        a0 = a + 0.9 + r() * 0.4;
        break;
      }
    }
  }

  // Palms and rocks.
  const palmCount = Math.round(R / (flat ? 45 : 26));
  for (let i = 0; i < palmCount; i++) {
    const p = landPoint(flat ? 0.78 : 0.3, 0.84, 6);
    if (!p) continue;
    occupied.push({ ...p, r: 6 });
    isl.palms.push({ ...p, h: 28 + r() * 24, lean: (r() - 0.5) * 0.45, turn: r() * Math.PI * 2 });
  }
  const rockCount = 4 + Math.floor(r() * 6);
  for (let i = 0; i < rockCount; i++) {
    const a = r() * Math.PI * 2;
    const d = R * (0.88 + r() * 0.25);
    isl.rocks.push({ x: o.x + Math.cos(a) * d, z: o.z + Math.sin(a) * d, s: 7 + r() * 16 });
  }

  // Loot and people.
  let spotN = 0;
  const spot = (kind: SpotKind, minF = 0.15, maxF = 0.8) => {
    const p = landPoint(minF, maxF, 10);
    if (!p) return;
    occupied.push({ ...p, r: 10 });
    isl.spots.push({ id: `${o.index}:${spotN++}`, kind, ...p });
  };
  if (o.kind === "wild" || o.kind === "mystery") {
    const chests = o.kind === "mystery" ? 2 : 1 + Math.floor(r() * 2);
    for (let i = 0; i < chests; i++) spot("chest");
    if (o.kind === "mystery" || r() < 0.6) spot("buried", 0.2, 0.7);
    const crates = 1 + Math.floor(r() * 3);
    for (let i = 0; i < crates; i++) spot("crate", 0.5, 0.84);
    if (o.kind === "mystery") spot("fruit", 0, 0.25);
    const camp = o.kind === "mystery" ? 4 : r() < 0.5 ? 2 + Math.floor(r() * 2) : 0;
    const centre = isl.spots[0] ?? { x: o.x, z: o.z };
    for (let i = 0; i < camp; i++) {
      const a = r() * Math.PI * 2;
      isl.bandits.push({ x: centre.x + Math.cos(a) * 40, z: centre.z + Math.sin(a) * 40 });
    }
  }
  if (o.kind === "town") {
    spot("crate", 0.6, 0.84);
    const posts = 3 + Math.floor(R / 130);
    for (let i = 0; i < posts; i++) {
      const b = isl.buildings[i % isl.buildings.length];
      const a = r() * Math.PI * 2;
      isl.guards.push({ x: b.door.x + Math.cos(a) * 25, z: b.door.z + Math.sin(a) * 25 });
    }
  }
  return isl;
}

export const ISLANDS = makeIslands();
export const HAVEN = ISLANDS[0];

/** The island under or nearest this point, if you're within `pad` of its shore. */
export function islandAt(x: number, z: number, pad = 0): Island | null {
  for (const i of ISLANDS) if (Math.hypot(i.x - x, i.z - z) < i.radius + pad) return i;
  return null;
}

/** Ground height at a point, or null if it's open water. */
export function groundHeight(x: number, z: number): number | null {
  const isl = islandAt(x, z);
  if (!isl) return null;
  const h = terrainHeight(isl, x, z);
  return h > 0.5 ? h : null;
}

/**
 * Sea surface height. The GPU shader uses the same waves (see render.ts), so
 * ships bob in time with the water you see.
 */
export const WAVES: [dirX: number, dirZ: number, amplitude: number, wavelength: number, speed: number][] = [
  [1, 0.3, 2.4, 230, 1.0],
  [-0.4, 1, 1.7, 150, 1.2],
  [0.7, -0.7, 1.0, 95, 1.45],
  [-1, -0.2, 0.65, 60, 1.8],
  [0.2, -1, 0.4, 37, 2.3],
  [-0.8, 0.6, 0.25, 23, 2.9],
];

export function waveHeight(x: number, z: number, t: number) {
  let h = 0;
  for (const [dx, dz, a, l, s] of WAVES) {
    const len = Math.hypot(dx, dz);
    const k = (Math.PI * 2) / l;
    h += a * Math.sin(k * ((dx / len) * x + (dz / len) * z) + t * s);
  }
  return h;
}
