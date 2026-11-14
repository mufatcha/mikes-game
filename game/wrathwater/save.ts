import { NO_UPGRADES, type Upgrades } from "./data";
import { FRUIT_IDS, NO_MATERIALS, STARTING_AMMO, STARTING_WEAPONS, WEAPON_ORDER, type FruitId, type Materials, type WeaponId } from "./items";

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
}

const KEY = "ww.save.v1";

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
