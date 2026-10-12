import type { ArchetypeId } from "./archetypes";

/**
 * Class XP and levels. Playing a class earns XP for that class, and each level
 * makes it a little stronger. XP lives in the player's browser; the server
 * only trusts the level number, which is fine for private games with friends.
 */
export const MAX_LEVEL = 10;

export const XP_PER_DAMAGE = 0.5;
export const XP_PER_KILL = 50;
export const XP_FOR_PLAYING = 100;
export const XP_FOR_WINNING = 100;

/** Total XP needed to reach a level: 100, 400, 900, 1600, … */
export function xpForLevel(level: number) {
  return 100 * (level - 1) ** 2;
}

export function levelFromXp(xp: number) {
  return Math.min(MAX_LEVEL, Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1);
}

/** Each level above 1 adds 3% damage and 3% max health. */
export function levelBonus(level: number) {
  return 1 + 0.03 * (clampLevel(level) - 1);
}

export function clampLevel(level: unknown) {
  const n = Math.floor(Number(level) || 1);
  return Math.max(1, Math.min(MAX_LEVEL, n));
}

export type ClassLevels = Partial<Record<ArchetypeId, number>>;
export type ClassXp = Partial<Record<ArchetypeId, number>>;

export function sanitizeLevels(value: unknown, ids: readonly ArchetypeId[]): ClassLevels {
  const v = (value ?? {}) as Record<string, unknown>;
  const out: ClassLevels = {};
  for (const id of ids) if (v[id] !== undefined) out[id] = clampLevel(v[id]);
  return out;
}

export function levelsFromXp(xp: ClassXp): ClassLevels {
  const out: ClassLevels = {};
  for (const [id, amount] of Object.entries(xp)) out[id as ArchetypeId] = levelFromXp(amount ?? 0);
  return out;
}
