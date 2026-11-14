/** Wrathwater: game data — ships, upgrades, bounty ranks. All sizes are in world units (a ship is ~40 long). */

export type Faction = "player" | "merchant" | "pirate" | "marine";

export type ShipClassId =
  | "player"
  | "merchant_cog"
  | "treasure_galleon"
  | "pirate_brig"
  | "marine_sloop"
  | "marine_frigate"
  | "marine_warship"
  | "marine_flagship";

export interface ShipClass {
  id: ShipClassId;
  name: string;
  faction: Faction;
  hull: number;
  /** Top speed, units per second. */
  speed: number;
  /** Turn rate at full speed, radians per second. */
  turn: number;
  cannonsPerSide: number;
  damage: number;
  /** Seconds to reload one broadside. */
  reload: number;
  /** How far a broadside reaches. */
  range: number;
  length: number;
  beam: number;
  masts: number;
  /** Bounty added when you sink one. */
  bounty: number;
  gold: [number, number];
}

export const SHIP_CLASSES: Record<ShipClassId, ShipClass> = {
  player: {
    id: "player", name: "Your Ship", faction: "player",
    hull: 220, speed: 80, turn: 0.75, cannonsPerSide: 2, damage: 13, reload: 3.8, range: 520,
    length: 44, beam: 14, masts: 2, bounty: 0, gold: [0, 0],
  },
  merchant_cog: {
    id: "merchant_cog", name: "Merchant Cog", faction: "merchant",
    hull: 120, speed: 52, turn: 0.55, cannonsPerSide: 1, damage: 7, reload: 5, range: 420,
    length: 34, beam: 12, masts: 1, bounty: 2_000_000, gold: [60, 120],
  },
  treasure_galleon: {
    id: "treasure_galleon", name: "Treasure Galleon", faction: "merchant",
    hull: 360, speed: 46, turn: 0.35, cannonsPerSide: 3, damage: 9, reload: 5, range: 460,
    length: 56, beam: 18, masts: 3, bounty: 14_000_000, gold: [320, 600],
  },
  pirate_brig: {
    id: "pirate_brig", name: "Rival Pirate Brig", faction: "pirate",
    hull: 230, speed: 70, turn: 0.62, cannonsPerSide: 3, damage: 11, reload: 4, range: 480,
    length: 42, beam: 14, masts: 2, bounty: 9_000_000, gold: [130, 260],
  },
  marine_sloop: {
    id: "marine_sloop", name: "Marine Sloop", faction: "marine",
    hull: 170, speed: 78, turn: 0.72, cannonsPerSide: 2, damage: 10, reload: 3.6, range: 480,
    length: 38, beam: 12, masts: 1, bounty: 15_000_000, gold: [80, 150],
  },
  marine_frigate: {
    id: "marine_frigate", name: "Marine Frigate", faction: "marine",
    hull: 360, speed: 72, turn: 0.52, cannonsPerSide: 4, damage: 12, reload: 3.5, range: 520,
    length: 50, beam: 16, masts: 2, bounty: 45_000_000, gold: [200, 360],
  },
  marine_warship: {
    id: "marine_warship", name: "Marine Warship", faction: "marine",
    hull: 680, speed: 64, turn: 0.4, cannonsPerSide: 6, damage: 14, reload: 3.3, range: 560,
    length: 62, beam: 20, masts: 3, bounty: 150_000_000, gold: [420, 700],
  },
  marine_flagship: {
    id: "marine_flagship", name: "Admiral's Flagship", faction: "marine",
    hull: 1500, speed: 70, turn: 0.42, cannonsPerSide: 8, damage: 17, reload: 2.9, range: 600,
    length: 76, beam: 24, masts: 3, bounty: 650_000_000, gold: [1300, 2100],
  },
};

export type UpgradeId = "hull" | "cannons" | "powder" | "sails" | "crew";

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  description: string;
  maxLevel: number;
  baseCost: number;
}

export const UPGRADES: UpgradeDef[] = [
  { id: "hull", name: "Iron-Banded Hull", description: "+90 hull per level", maxLevel: 6, baseCost: 150 },
  { id: "cannons", name: "More Cannons", description: "+1 cannon each side per level", maxLevel: 6, baseCost: 260 },
  { id: "powder", name: "Black Powder", description: "+18% cannon damage per level", maxLevel: 6, baseCost: 200 },
  { id: "sails", name: "Storm Sails", description: "+9% speed and turning per level", maxLevel: 6, baseCost: 180 },
  { id: "crew", name: "Gun Crew Drills", description: "-11% reload time per level", maxLevel: 6, baseCost: 200 },
];

export type Upgrades = Record<UpgradeId, number>;

export const NO_UPGRADES: Upgrades = { hull: 0, cannons: 0, powder: 0, sails: 0, crew: 0 };

export function upgradeCost(def: UpgradeDef, level: number) {
  return Math.round((def.baseCost * Math.pow(level + 1, 1.7)) / 10) * 10;
}

/** Your ship's stats with upgrades applied. */
export function playerStats(u: Upgrades) {
  const base = SHIP_CLASSES.player;
  return {
    hull: base.hull + u.hull * 90,
    speed: base.speed * (1 + u.sails * 0.09),
    turn: base.turn * (1 + u.sails * 0.09),
    cannonsPerSide: base.cannonsPerSide + u.cannons,
    damage: base.damage * (1 + u.powder * 0.18),
    reload: base.reload * Math.pow(0.89, u.crew),
    range: base.range + u.cannons * 12,
  };
}

/** Bounty ranks, One Piece style. Reaching the last one wins the game. */
export const RANKS = [
  { bounty: 0, title: "Unknown Deckhand" },
  { bounty: 10_000_000, title: "Rookie Pirate" },
  { bounty: 100_000_000, title: "Notorious Captain" },
  { bounty: 300_000_000, title: "Supernova" },
  { bounty: 1_000_000_000, title: "Warlord of the Sea" },
  { bounty: 3_000_000_000, title: "Sea Emperor" },
  { bounty: 5_000_000_000, title: "King of Wrathwater" },
];

export const KING_BOUNTY = RANKS[RANKS.length - 1].bounty;

export function rankFor(bounty: number) {
  let i = 0;
  while (i + 1 < RANKS.length && bounty >= RANKS[i + 1].bounty) i++;
  return { index: i, ...RANKS[i], next: RANKS[i + 1] ?? null };
}

/** Which Marine ships hunt you at each wanted level (GTA-style stars). */
export const HUNTERS_BY_STARS: ShipClassId[][] = [
  [],
  ["marine_sloop"],
  ["marine_sloop", "marine_sloop"],
  ["marine_frigate", "marine_sloop", "marine_sloop"],
  ["marine_warship", "marine_frigate", "marine_sloop"],
  ["marine_flagship", "marine_warship", "marine_frigate"],
];

export function formatBerries(n: number) {
  return `฿${Math.round(n).toLocaleString("en-US")}`;
}

export function shortBerries(n: number) {
  if (n >= 1e9) return `฿${(n / 1e9).toFixed(n >= 1e10 ? 0 : 2).replace(/\.?0+$/, "")}B`;
  if (n >= 1e6) return `฿${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1).replace(/\.0$/, "")}M`;
  return `฿${Math.round(n).toLocaleString("en-US")}`;
}
