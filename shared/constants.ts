export const TICK_RATE = 30;
export const TICK_MS = 1000 / TICK_RATE;
export const DT = 1 / TICK_RATE;

export const TEAM_SIZE = 4;
export const MAX_HUMANS = TEAM_SIZE * 2;

export const PLAYER_RADIUS = 18;
export const BASE_SPEED = 250;
export const MAX_HP = 100;

export const RESPAWN_TIME = 3;
export const SPAWN_PROTECTION = 2;
export const SWAP_TIME = 0.35;

/** Nurse's Office: HP healed per second, and how long you can stay before passing out. */
export const SAFE_ZONE_HEAL = 20;
export const SAFE_ZONE_MAX_TIME = 30;
/** Ducking in and out to heal: this many entries within the window makes you pass out too. */
export const SAFE_ZONE_MAX_VISITS = 3;
export const SAFE_ZONE_VISIT_WINDOW = 20;
/** Stepping back in this soon after leaving (e.g. jittering on the doorway) doesn't count as a new visit. */
export const SAFE_ZONE_REENTRY_GRACE = 0.5;

export const SCORE_TO_WIN = 50;
export const MATCH_DURATION = 8 * 60;
export const RESULTS_DURATION = 12;

export const TEAM_NAMES = ["Blueberries", "Orange Peels"] as const;
export const TEAM_COLORS = ["#3b82f6", "#f97316"] as const;

export type Team = 0 | 1;

/** "teams" is the classic 4v4; "boss" is 7 students against 1 Principal. */
export type GameMode = "teams" | "boss";
export const GAME_MODES: { id: GameMode; name: string; blurb: string }[] = [
  { id: "teams", name: "Team Battle · 4v4", blurb: "Blueberries vs Orange Peels. First to 50 knockouts wins." },
  {
    id: "boss",
    name: "The Principal · 7v1",
    blurb: "Seven students against one Principal boss with huge health and special powers. Knock them out before the bell.",
  },
];

/** Players allowed on each team. */
export function teamSizeFor(mode: GameMode, team: Team) {
  if (mode === "boss") return team === 0 ? 7 : 1;
  return TEAM_SIZE;
}

export function teamNamesFor(mode: GameMode): readonly [string, string] {
  return mode === "boss" ? ["Students", "Principal"] : TEAM_NAMES;
}

/** A boss match is shorter; the Principal wins if they're still standing at the bell. */
export const BOSS_MATCH_DURATION = 6 * 60;
