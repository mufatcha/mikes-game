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
    length: 97, beam: 31, masts: 2, bounty: 0, gold: [0, 0],
  },
  merchant_cog: {
    id: "merchant_cog", name: "Merchant Cog", faction: "merchant",
    hull: 120, speed: 52, turn: 0.55, cannonsPerSide: 1, damage: 7, reload: 5, range: 420,
    length: 75, beam: 26, masts: 1, bounty: 2_000_000, gold: [60, 120],
  },
  treasure_galleon: {
    id: "treasure_galleon", name: "Treasure Galleon", faction: "merchant",
    hull: 360, speed: 46, turn: 0.35, cannonsPerSide: 3, damage: 9, reload: 5, range: 460,
    length: 123, beam: 40, masts: 3, bounty: 14_000_000, gold: [320, 600],
  },
  pirate_brig: {
    id: "pirate_brig", name: "Rival Pirate Brig", faction: "pirate",
    hull: 230, speed: 70, turn: 0.62, cannonsPerSide: 3, damage: 11, reload: 4, range: 480,
    length: 92, beam: 31, masts: 2, bounty: 9_000_000, gold: [130, 260],
  },
  marine_sloop: {
    id: "marine_sloop", name: "Marine Sloop", faction: "marine",
    hull: 170, speed: 78, turn: 0.72, cannonsPerSide: 2, damage: 10, reload: 3.6, range: 480,
    length: 84, beam: 26, masts: 1, bounty: 15_000_000, gold: [80, 150],
  },
  marine_frigate: {
    id: "marine_frigate", name: "Marine Frigate", faction: "marine",
    hull: 360, speed: 72, turn: 0.52, cannonsPerSide: 4, damage: 12, reload: 3.5, range: 520,
    length: 110, beam: 35, masts: 2, bounty: 45_000_000, gold: [200, 360],
  },
  marine_warship: {
    id: "marine_warship", name: "Marine Warship", faction: "marine",
    hull: 680, speed: 64, turn: 0.4, cannonsPerSide: 6, damage: 14, reload: 3.3, range: 560,
    length: 136, beam: 44, masts: 3, bounty: 150_000_000, gold: [420, 700],
  },
  marine_flagship: {
    id: "marine_flagship", name: "Admiral's Flagship", faction: "marine",
    hull: 1500, speed: 70, turn: 0.42, cannonsPerSide: 8, damage: 17, reload: 2.9, range: 600,
    length: 167, beam: 53, masts: 3, bounty: 650_000_000, gold: [1300, 2100],
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

/**
 * Your ship comes in four sizes. You start on the smallest; once every
 * upgrade is at its top level, the shipwright can build you the next size up.
 * A bigger ship is tougher, carries more guns and lets every upgrade go two
 * levels higher, but it needs more people aboard to sail and fight it
 * (counting you): with fewer than `crewMin` she's sluggish and slow to
 * reload, and she's at her best with `crewFull`.
 */
export interface ShipTier {
  tier: number;
  name: string;
  length: number;
  beam: number;
  masts: number;
  /** Extra hull and guns a side on top of your upgrades, and multipliers for damage, speed and turning. */
  hull: number;
  cannons: number;
  damage: number;
  speed: number;
  turn: number;
  range: number;
  crewMin: number;
  crewFull: number;
  /** Gold the shipwright asks to build her. */
  cost: number;
}

export const SHIP_TIERS: ShipTier[] = [
  { tier: 1, name: "Sloop", length: 97, beam: 31, masts: 2, hull: 0, cannons: 0, damage: 1, speed: 1, turn: 1, range: 0, crewMin: 1, crewFull: 1, cost: 0 },
  { tier: 2, name: "Brigantine", length: 122, beam: 38, masts: 2, hull: 400, cannons: 1, damage: 1.1, speed: 1.04, turn: 0.9, range: 20, crewMin: 2, crewFull: 3, cost: 8000 },
  { tier: 3, name: "Frigate", length: 148, beam: 46, masts: 3, hull: 1000, cannons: 2, damage: 1.2, speed: 1.07, turn: 0.8, range: 40, crewMin: 3, crewFull: 6, cost: 20000 },
  { tier: 4, name: "Man-o'-War", length: 178, beam: 56, masts: 3, hull: 1800, cannons: 3, damage: 1.3, speed: 1.1, turn: 0.7, range: 60, crewMin: 5, crewFull: 10, cost: 45000 },
];

export function shipTier(tier: number) {
  return SHIP_TIERS[Math.max(1, Math.min(SHIP_TIERS.length, Math.round(tier) || 1)) - 1];
}

/** How high an upgrade can go on a ship of this size (two more levels per size). */
export function upgradeMax(def: UpgradeDef, tier: number) {
  return def.maxLevel + (shipTier(tier).tier - 1) * 2;
}

/** Every upgrade at its top level for this size: the shipwright will build you the next one. */
export function fullyUpgraded(u: Upgrades, tier: number) {
  return UPGRADES.every((d) => u[d.id] >= upgradeMax(d, tier));
}

/** What a sailor costs to sign on at the tavern. */
export function hireCost(tier: number) {
  return 100 + 60 * shipTier(tier).tier;
}

/** Your ship's class for its size (one object per size, so a change of size is easy to spot). */
const PLAYER_CLASSES = SHIP_TIERS.map((t) => ({ ...SHIP_CLASSES.player, name: t.name, length: t.length, beam: t.beam, masts: t.masts }));
export function playerClass(tier: number): ShipClass {
  return PLAYER_CLASSES[shipTier(tier).tier - 1];
}

/**
 * How well-manned she is, from the people aboard (you plus hired crew):
 * speed and reload multipliers, and whether she's short-handed.
 */
export function manning(tier: number, crew: number) {
  const t = shipTier(tier);
  const people = 1 + Math.max(0, crew);
  if (people < t.crewMin) return { speed: 0.6, turn: 0.7, reload: 1.7, short: true, people };
  const f = t.crewFull > t.crewMin ? Math.min(1, (people - t.crewMin) / (t.crewFull - t.crewMin)) : 1;
  return { speed: 0.88 + 0.12 * f, turn: 0.9 + 0.1 * f, reload: 1.2 - 0.2 * f, short: false, people };
}

/** Your ship's stats with its size, upgrades and crew applied. */
export function playerStats(s: { upgrades: Upgrades; shipTier?: number; crew?: number }) {
  const u = s.upgrades;
  const base = SHIP_CLASSES.player;
  const t = shipTier(s.shipTier ?? 1);
  const m = manning(t.tier, s.crew ?? 0);
  return {
    hull: base.hull + u.hull * 90 + t.hull,
    speed: base.speed * (1 + u.sails * 0.09) * t.speed * m.speed,
    turn: base.turn * (1 + u.sails * 0.09) * t.turn * m.turn,
    cannonsPerSide: base.cannonsPerSide + u.cannons + t.cannons,
    damage: base.damage * (1 + u.powder * 0.18) * t.damage,
    reload: base.reload * Math.pow(0.89, u.crew) * m.reload,
    range: base.range + u.cannons * 12 + t.range,
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

/** A Marine's ranks, earned with merit (counted like a bounty) instead of infamy. */
export const MARINE_RANKS = ["Recruit", "Ensign", "Lieutenant", "Commodore", "Vice Admiral", "Admiral", "Fleet Admiral of Wrathwater"];

/** Your rank from your bounty (a Marine's merit), with the next one to aim for. */
export function rankFor(bounty: number, side: "pirate" | "marine" = "pirate") {
  let i = 0;
  while (i + 1 < RANKS.length && bounty >= RANKS[i + 1].bounty) i++;
  const title = (k: number) => (side === "marine" ? MARINE_RANKS[k] : RANKS[k].title);
  const next = RANKS[i + 1] ? { bounty: RANKS[i + 1].bounty, title: title(i + 1) } : null;
  return { index: i, bounty: RANKS[i].bounty, title: title(i), next };
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
