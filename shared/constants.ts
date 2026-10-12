export const TICK_RATE = 30;
export const TICK_MS = 1000 / TICK_RATE;
export const DT = 1 / TICK_RATE;

export const TEAM_SIZE = 4;
export const MAX_HUMANS = TEAM_SIZE * 2;

export const PLAYER_RADIUS = 18;
export const BASE_SPEED = 250;
export const MAX_HP = 100;

/** How tall a regular player is, for 3D hits and drawing (bigger classes scale with their radius). */
export const PLAYER_HEIGHT = 56;

// 3D throw physics, used only when a match is played in the 3D view.
/** Downward pull on thrown things, in units per second squared. */
export const GRAVITY = 600;
/** In 3D you see from this height: a little below the top of your head. */
export const EYE_HEIGHT = 48;
/** Throws leave your hand at this height. */
export const THROW_HEIGHT = 44;
/** The ceiling (and the top of the walls). */
export const CEILING_HEIGHT = 80;
/** How far you can look (and throw) up or down, in radians. */
export const MAX_PITCH = 1.0;

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

/**
 * Game modes:
 * - "teams": the classic 4v4.
 * - "fog": 4v4 where you only see a small circle around you.
 * - "boss": 7 students against 1 Principal.
 * - "duel": 1v1, the two school mascots, each with their own powers.
 * Every mode can be played top-down or in 3D first person (see VIEWS).
 */
export type GameMode = "teams" | "fog" | "boss" | "duel";
export const GAME_MODE_IDS: GameMode[] = ["teams", "fog", "boss", "duel"];
export const GAME_MODES: { id: GameMode; name: string; emoji: string; blurb: string }[] = [
  { id: "teams", name: "Team Battle · 4v4", emoji: "⚔️", blurb: "Blueberries vs Orange Peels. First to 50 knockouts wins." },
  {
    id: "fog",
    name: "Fog of War · 4v4",
    emoji: "🌫️",
    blurb: "Same as Team Battle, but you can only see a small circle around you. Listen for footsteps.",
  },
  {
    id: "boss",
    name: "The Principal · 7v1",
    emoji: "👔",
    blurb: "Seven students against one Principal boss with huge health and special powers. Knock them out before the bell.",
  },
  {
    id: "duel",
    name: "Mascot Duel · 1v1",
    emoji: "🥊",
    blurb: "Barry the Blueberry vs Peely the Orange, each with their own four powers. First to 3 knockouts.",
  },
];

/** How the match is seen, picked by the host for any mode: top-down, or 3D through your own eyes. */
export const VIEWS: { view3d: boolean; name: string; emoji: string; blurb: string }[] = [
  { view3d: false, name: "Top-down", emoji: "🗺️", blurb: "The classic view from above. Aim with the mouse." },
  {
    view3d: true,
    name: "3D first person",
    emoji: "🎯",
    blurb: "See the school through your own eyes. Click to grab the mouse, look around in every direction, WASD to walk.",
  },
];

/** Players allowed on each team. */
export function teamSizeFor(mode: GameMode, team: Team) {
  if (mode === "boss") return team === 0 ? 7 : 1;
  if (mode === "duel") return 1;
  return TEAM_SIZE;
}

export function teamNamesFor(mode: GameMode): readonly [string, string] {
  if (mode === "boss") return ["Students", "Principal"];
  if (mode === "duel") return ["Barry the Blueberry", "Peely the Orange"];
  return TEAM_NAMES;
}

/** Seats with a fixed character instead of a class pick: the 7v1 Principal, and both duel mascots. */
export function isPrincipalSeat(mode: GameMode, team: Team) {
  return mode === "duel" || (mode === "boss" && team === 1);
}

/** Boss and duel matches are shorter. In boss mode the Principal wins if still standing at the bell. */
export function matchDurationFor(mode: GameMode) {
  if (mode === "boss") return 6 * 60;
  if (mode === "duel") return 5 * 60;
  return MATCH_DURATION;
}

/** Knockouts needed to win (boss mode is won by knocking out the Principal instead). */
export function winScoreFor(mode: GameMode) {
  if (mode === "duel") return 3;
  if (mode === "boss") return Infinity;
  return SCORE_TO_WIN;
}
