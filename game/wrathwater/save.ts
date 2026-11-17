import { MAX_ESCORTS, NO_UPGRADES, SHIP_TIERS, STRUCTURE_IDS, type StructureId, type Upgrades } from "./data";
import { ISLANDS } from "./world";
import {
  FOOD_IDS,
  FRUIT_IDS,
  ITEM_IDS,
  NO_MATERIALS,
  NO_SKILLS,
  SKILL_IDS,
  SKILL_MAX,
  STARTING_AMMO,
  STARTING_WEAPONS,
  WEAPON_ORDER,
  type FoodItem,
  type FruitId,
  type ItemId,
  type Materials,
  type SkillId,
  type WeaponId,
} from "./items";
import { cleanQuest, type Quest } from "./quests";

/** Progress kept between visits, in this browser only. */
export interface SaveData {
  captain: string;
  bounty: number;
  gold: number;
  upgrades: Upgrades;
  sunk: number;
  deaths: number;
  /** Set once you reach King of Wrathwater, so the victory screen only shows once. */
  crowned: boolean;
  materials: Materials;
  /** Weapons you own besides your fists. */
  weapons: WeaponId[];
  equipped: WeaponId;
  /** Lead shot for your guns. */
  ammo: number;
  /** The Devil Fruit you ate, if any. */
  fruit: FruitId | null;
  /** Fruits you're carrying but haven't eaten. */
  heldFruits: FruitId[];
  /** Fruits that have been found, so they never appear again. */
  fruitsFound: FruitId[];
  robberies: number;
  /** Vault keys taken from the Vault Wardens (the island each came from). */
  vaultKeys: number[];
  /** Read the fruit's real name in the vault: the Stretch Fruit is really the Kill Order Fruit. */
  trueName: boolean;
  /** Your ship's size, 1 (sloop) to 4 (man-o'-war). */
  shipTier: number;
  /** Sailors you've hired (you're aboard too, on top of these). */
  crew: number;
  /** Experience: you level up as it grows, and each level gives a skill point. */
  xp: number;
  skills: Record<SkillId, number>;
  /** Bombs, tonics and smoke bombs you're carrying. */
  items: Record<ItemId, number>;
  /** Food in your pack, and how full you are (0..100). */
  food: FoodItem[];
  hunger: number;
  /** Seconds you've played this voyage (food spoils by it). */
  playTime: number;
  /** Pirate or Marine, chosen when the voyage starts. */
  side: "pirate" | "marine";
  /** The quest you're on, and how many you've finished. */
  quest: Quest | null;
  questsDone: number;
  /** Tutorial step, or -1 once it's done or skipped. */
  tutorial: number;
  /** What you've built on your deck. */
  structures: StructureId[];
  /** Escort ships in your fleet. */
  escorts: number;
  /** You've crossed the Stormwall, so the Tempest Reach shows on your map. */
  reachSeen: boolean;
}

export const SAVE_KEY = "ww.save.v1";
const KEY = SAVE_KEY;

export function newSave(captain: string): SaveData {
  return {
    captain,
    bounty: 0,
    gold: 0,
    upgrades: { ...NO_UPGRADES },
    sunk: 0,
    deaths: 0,
    crowned: false,
    materials: { ...NO_MATERIALS },
    weapons: [...STARTING_WEAPONS],
    equipped: "dull_sword",
    ammo: STARTING_AMMO,
    fruit: null,
    heldFruits: [],
    fruitsFound: [],
    robberies: 0,
    vaultKeys: [],
    trueName: false,
    shipTier: 1,
    // You set out with two sailors.
    crew: 2,
    xp: 0,
    skills: { ...NO_SKILLS },
    items: { bomb: 2, tonic: 2, smoke: 0 },
    food: [
      { food: "biscuit", spoils: 30 * 60 },
      { food: "biscuit", spoils: 30 * 60 },
      { food: "fish", spoils: 15 * 60 },
    ],
    hunger: 100,
    playTime: 0,
    side: "pirate",
    quest: null,
    questsDone: 0,
    tutorial: 0,
    structures: [],
    escorts: 0,
    reachSeen: false,
  };
}

const isWeapon = (w: unknown): w is WeaponId => WEAPON_ORDER.includes(w as WeaponId);
const isFruit = (f: unknown): f is FruitId => FRUIT_IDS.includes(f as FruitId);

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<SaveData>;
    if (typeof s.captain !== "string") return null;
    const weapons: WeaponId[] = Array.isArray(s.weapons) ? s.weapons.filter(isWeapon).filter((w) => w !== "fists") : [];
    // Saves from before ammo existed get the starting kit too.
    const oldSave = typeof s.ammo !== "number";
    if (oldSave) for (const w of STARTING_WEAPONS) if (!weapons.includes(w)) weapons.push(w);
    const equipped = isWeapon(s.equipped) && (s.equipped === "fists" || weapons.includes(s.equipped)) ? s.equipped : "fists";
    return {
      captain: s.captain,
      bounty: Number(s.bounty) || 0,
      gold: Number(s.gold) || 0,
      upgrades: { ...NO_UPGRADES, ...(s.upgrades ?? {}) },
      sunk: Number(s.sunk) || 0,
      deaths: Number(s.deaths) || 0,
      crowned: !!s.crowned,
      materials: { ...NO_MATERIALS, ...(s.materials ?? {}) },
      weapons,
      equipped,
      ammo: oldSave ? STARTING_AMMO : Math.max(0, Math.floor(Number(s.ammo) || 0)),
      fruit: isFruit(s.fruit) ? s.fruit : null,
      heldFruits: Array.isArray(s.heldFruits) ? s.heldFruits.filter(isFruit) : [],
      fruitsFound: Array.isArray(s.fruitsFound) ? s.fruitsFound.filter(isFruit) : [],
      robberies: Number(s.robberies) || 0,
      vaultKeys: Array.isArray(s.vaultKeys) ? wardenKeys(s.vaultKeys) : [],
      trueName: !!s.trueName,
      shipTier: Math.max(1, Math.min(SHIP_TIERS.length, Math.floor(Number(s.shipTier)) || 1)),
      crew: Math.max(0, Math.floor(Number(s.crew)) || 0),
      xp: Math.max(0, Number(s.xp) || 0),
      skills: Object.fromEntries(SKILL_IDS.map((k) => [k, Math.max(0, Math.min(SKILL_MAX, Math.floor(Number(s.skills?.[k]) || 0)))])) as Record<SkillId, number>,
      items: Object.fromEntries(ITEM_IDS.map((k) => [k, Math.max(0, Math.floor(Number(s.items?.[k]) || 0))])) as Record<ItemId, number>,
      food: Array.isArray(s.food)
        ? s.food.filter((f): f is FoodItem => !!f && FOOD_IDS.includes((f as FoodItem).food) && typeof (f as FoodItem).spoils === "number").slice(0, 60)
        : [],
      hunger: typeof s.hunger === "number" ? Math.max(0, Math.min(100, s.hunger)) : 100,
      playTime: Math.max(0, Number(s.playTime) || 0),
      side: s.side === "marine" ? "marine" : "pirate",
      quest: cleanQuest(s.quest),
      questsDone: Math.max(0, Number(s.questsDone) || 0),
      // Captains from before the tutorial existed don't need it.
      tutorial: typeof s.tutorial === "number" ? s.tutorial : -1,
      structures: Array.isArray(s.structures) ? [...new Set(s.structures.filter((x): x is StructureId => STRUCTURE_IDS.includes(x as StructureId)))] : [],
      escorts: Math.max(0, Math.min(MAX_ESCORTS, Math.floor(Number(s.escorts)) || 0)),
      reachSeen: !!s.reachSeen,
    };
  } catch {
    return null;
  }
}

export function writeSave(s: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage blocked (private mode): progress just won't persist.
  }
}

export function deleteSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to delete.
  }
}

/**
 * Vault keys are saved as the island each Warden was on. If the islands have
 * moved since (the sea was redrawn), keep how many keys you had, matched to
 * the Warden towns as they are now.
 */
function wardenKeys(raw: unknown[]): number[] {
  const wardens = ISLANDS.filter((i) => i.warden).map((i) => i.index);
  const saved = [...new Set(raw.map(Number).filter(Number.isInteger))];
  const keys = wardens.filter((i) => saved.includes(i));
  for (const i of wardens) if (keys.length < Math.min(saved.length, wardens.length) && !keys.includes(i)) keys.push(i);
  return keys;
}
