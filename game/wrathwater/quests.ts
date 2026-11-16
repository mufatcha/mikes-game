/**
 * Quests from the quest givers who stand outside the taverns in the towns
 * and at Blackwater Cove. You carry one at a time:
 *  - sink: sink a number of one kind of ship;
 *  - bandits: clear out the bandit camp on an island;
 *  - bring: bring the giver some timber, iron or gunpowder;
 *  - treasure: dig up the treasure buried on an island.
 * Sinking, clearing and digging finish the moment you've done them; a
 * delivery finishes when you hand it over. The reward is gold and XP.
 */
import type { Faction } from "./data";
import { MATERIAL_NAMES, type MaterialId } from "./items";
import { ISLANDS } from "./world";

export type QuestKind = "sink" | "bandits" | "bring" | "treasure";

export interface Quest {
  kind: QuestKind;
  /** The island whose quest giver handed it out. */
  giver: number;
  title: string;
  text: string;
  count: number;
  progress: number;
  /** sink: which ships count. */
  faction?: Faction;
  /** bandits and treasure: where. treasure: the spot to dig up. */
  island?: number;
  spot?: string;
  /** bring: what to bring. */
  material?: MaterialId;
  gold: number;
  xp: number;
}

const GIVER_NAMES = ["Old Marla", "One-Eyed Tobin", "Captain Wrexley", "Hattie Brine", "Silas the Cartographer", "Mother Gull", "Rook Halloway", "Petra Saltwind"];
export function giverName(island: number) {
  return GIVER_NAMES[island % GIVER_NAMES.length];
}

/**
 * A fresh quest from an island's quest giver. Marines are asked to hunt
 * pirates; pirates are asked to hunt Marines and merchants.
 */
export function makeQuest(giver: number, side: "pirate" | "marine", level: number): Quest {
  const kinds: QuestKind[] = ["sink", "bandits", "bring", "treasure"];
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  const name = giverName(giver);
  const scale = 1 + Math.min(level, 30) * 0.08;
  const far = (pred: (i: (typeof ISLANDS)[number]) => boolean) => {
    const list = ISLANDS.filter((i) => i.index !== giver && pred(i));
    return list[Math.floor(Math.random() * list.length)];
  };
  if (kind === "bandits") {
    const isl = far((i) => i.bandits.length > 0);
    if (isl) {
      const n = isl.bandits.length;
      return {
        kind, giver, island: isl.index, count: n, progress: 0,
        title: `Clear the bandits on ${isl.name}`,
        text: `"Bandits have dug in on ${isl.name}. Beat all ${n} of them and I'll make it worth your while." (${name})`,
        gold: Math.round(220 * scale), xp: Math.round(120 * scale),
      };
    }
  }
  if (kind === "treasure") {
    const isl = far((i) => i.spots.some((s) => s.kind === "buried"));
    const spot = isl?.spots.find((s) => s.kind === "buried");
    if (isl && spot) {
      return {
        kind, giver, island: isl.index, spot: spot.id, count: 1, progress: 0,
        title: `Dig up the treasure on ${isl.name}`,
        text: `"My old map shows an X on ${isl.name}. Dig it up and the reward's yours on top of whatever's down there." (${name})`,
        gold: Math.round(180 * scale), xp: Math.round(100 * scale),
      };
    }
  }
  if (kind === "bring") {
    const mats: MaterialId[] = ["wood", "iron", "powder"];
    const material = mats[Math.floor(Math.random() * mats.length)];
    const n = 6 + Math.floor(Math.random() * 6);
    return {
      kind, giver, material, count: n, progress: 0,
      title: `Bring ${n} ${MATERIAL_NAMES[material].toLowerCase()} to ${name}`,
      text: `"I need ${n} ${MATERIAL_NAMES[material].toLowerCase()}, and I pay well. Bring it back to me here." (${name})`,
      gold: Math.round(n * 30 * scale), xp: Math.round(n * 12 * scale),
    };
  }
  // Sink ships.
  const targets: { faction: Faction; what: string }[] =
    side === "marine"
      ? [{ faction: "pirate", what: "pirate brigs" }]
      : [
          { faction: "merchant", what: "merchant ships" },
          { faction: "marine", what: "Marine ships" },
          { faction: "pirate", what: "rival pirate brigs" },
        ];
  const t = targets[Math.floor(Math.random() * targets.length)];
  const n = 2 + Math.floor(Math.random() * 3);
  return {
    kind: "sink", giver, faction: t.faction, count: n, progress: 0,
    title: `Sink ${n} ${t.what}`,
    text: `"Sink ${n} ${t.what} for me. Don't ask why." (${name})`,
    gold: Math.round(n * 120 * scale), xp: Math.round(n * 70 * scale),
  };
}

/** Make sure a saved quest is still sane (islands can move between versions). */
export function cleanQuest(q: unknown): Quest | null {
  if (!q || typeof q !== "object") return null;
  const x = q as Partial<Quest>;
  if (!x.kind || !["sink", "bandits", "bring", "treasure"].includes(x.kind)) return null;
  if (typeof x.title !== "string" || typeof x.count !== "number") return null;
  if (typeof x.giver !== "number" || !ISLANDS[x.giver]) return null;
  if (x.island !== undefined && !ISLANDS[x.island]) return null;
  return {
    kind: x.kind,
    giver: x.giver,
    title: x.title,
    text: String(x.text ?? ""),
    count: Math.max(1, x.count),
    progress: Math.max(0, Number(x.progress) || 0),
    faction: x.faction,
    island: x.island,
    spot: x.spot,
    material: x.material,
    gold: Number(x.gold) || 0,
    xp: Number(x.xp) || 0,
  };
}
