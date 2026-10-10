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

export const SCORE_TO_WIN = 50;
export const MATCH_DURATION = 8 * 60;
export const RESULTS_DURATION = 12;

export const TEAM_NAMES = ["Blue", "Orange"] as const;
export const TEAM_COLORS = ["#3b82f6", "#f97316"] as const;

export type Team = 0 | 1;
