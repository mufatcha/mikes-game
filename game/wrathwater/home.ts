/**
 * Your own island: Driftwood Atoll is for sale (a signpost on its shore).
 * Buy it, then build on it: a dock that repairs your ship, a house you come
 * back to life at, a farm, mine and workshop that make food, iron, timber and
 * gunpowder while you're away, a watchtower that fires on enemy ships, and a
 * vault that keeps gold safe when your ship goes down.
 */
import { ISLANDS } from "./world";

export const HOME_ISLAND = ISLANDS.find((i) => i.name === "Driftwood Atoll") ?? ISLANDS.find((i) => i.kind === "wild" && !i.reach && i.bandits.length === 0)!;
export const HOME_PRICE = 15000;

export type HomeBuildingId = "dock" | "house" | "farm" | "mine" | "workshop" | "watchtower" | "vault";
export const HOME_BUILDINGS: Record<HomeBuildingId, { id: HomeBuildingId; name: string; cost: number; effect: string }> = {
  dock: { id: "dock", name: "Dock", cost: 2000, effect: "Your ship is repaired whenever you land here." },
  house: { id: "house", name: "House", cost: 3000, effect: "If you go down, you come back here instead of Blackwater Cove." },
  farm: { id: "farm", name: "Farm", cost: 2500, effect: "Grows food: one fresh fruit or fish every 2 minutes (up to 20)." },
  mine: { id: "mine", name: "Mine", cost: 4000, effect: "Digs one iron a minute (up to 30)." },
  workshop: { id: "workshop", name: "Workshop", cost: 4000, effect: "Makes one gunpowder and one timber a minute (up to 30 each)." },
  watchtower: { id: "watchtower", name: "Watchtower", cost: 5000, effect: "Its cannon fires on enemy ships that come near your island." },
  vault: { id: "vault", name: "Vault", cost: 6000, effect: "Store gold here: it's safe when your ship sinks." },
};
export const HOME_BUILDING_IDS = Object.keys(HOME_BUILDINGS) as HomeBuildingId[];

export interface HomeState {
  owned: boolean;
  built: HomeBuildingId[];
  /** Made while you were away, waiting to be collected. */
  stock: { food: number; iron: number; powder: number; wood: number };
  /** Gold kept in the vault. */
  vault: number;
  /** Play time (seconds) production was last counted up to. */
  lastTick: number;
}

export function newHome(): HomeState {
  return { owned: false, built: [], stock: { food: 0, iron: 0, powder: 0, wood: 0 }, vault: 0, lastTick: 0 };
}

export function cleanHome(raw: unknown): HomeState {
  const h = newHome();
  if (!raw || typeof raw !== "object") return h;
  const x = raw as Partial<HomeState>;
  h.owned = !!x.owned;
  h.built = Array.isArray(x.built) ? [...new Set(x.built.filter((b): b is HomeBuildingId => HOME_BUILDING_IDS.includes(b as HomeBuildingId)))] : [];
  const st = (x.stock ?? {}) as Partial<HomeState["stock"]>;
  h.stock = { food: Number(st.food) || 0, iron: Number(st.iron) || 0, powder: Number(st.powder) || 0, wood: Number(st.wood) || 0 };
  h.vault = Math.max(0, Number(x.vault) || 0);
  h.lastTick = Math.max(0, Number(x.lastTick) || 0);
  return h;
}

/** Count up what the farm, mine and workshop have made since last time (fractions carry over). */
export function produce(h: HomeState, playTime: number) {
  if (!h.owned) {
    h.lastTick = playTime;
    return;
  }
  const minutes = Math.max(0, (playTime - h.lastTick) / 60);
  h.lastTick = playTime;
  const has = (b: HomeBuildingId) => h.built.includes(b);
  if (has("farm")) h.stock.food = Math.min(20, h.stock.food + minutes / 2);
  if (has("mine")) h.stock.iron = Math.min(30, h.stock.iron + minutes);
  if (has("workshop")) {
    h.stock.powder = Math.min(30, h.stock.powder + minutes);
    h.stock.wood = Math.min(30, h.stock.wood + minutes);
  }
}

/** Where things stand on the island: the signpost on the shore toward the haven, the rest around the middle. */
export function homeLayout() {
  const isl = HOME_ISLAND;
  const toHaven = Math.atan2(-isl.z, -isl.x);
  const at = (a: number, f: number) => ({ x: isl.x + Math.cos(toHaven + a) * isl.radius * f, z: isl.z + Math.sin(toHaven + a) * isl.radius * f });
  return {
    sign: at(0, 0.78),
    plots: {
      dock: at(0.35, 0.97),
      house: at(Math.PI, 0.15),
      farm: at(-1.4, 0.45),
      mine: at(1.5, 0.45),
      workshop: at(2.4, 0.45),
      watchtower: at(-2.4, 0.5),
      vault: at(Math.PI + 0.9, 0.3),
    } as Record<HomeBuildingId, { x: number; z: number }>,
  };
}
