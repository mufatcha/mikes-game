import type { GameMode, Team } from "./constants";
import type { PrankAction } from "./pranks";
import type { AbilityId, ArchetypeId, Loadout, SuperId, WeaponId } from "./archetypes";
import type { ClassLevels, ClassXp } from "./progress";

export type Phase = "lobby" | "match" | "results";

export interface InputFrame {
  seq: number;
  /** Movement vector, each axis in [-1, 1]. */
  mx: number;
  my: number;
  /** Aim angle in radians. */
  aim: number;
  fire: boolean;
  reload: boolean;
  /** Slot to switch to (0 primary, 1 secondary), or -1 for no change. */
  swap: number;
}

export type ClientMessage =
  | { t: "hello"; name: string; loadout: Loadout; levels?: ClassLevels }
  /** Your class levels changed (after earning XP). */
  | { t: "levels"; levels: ClassLevels }
  /** Use your class super (fires where you aim). */
  | { t: "super" }
  | { t: "team"; team: Team }
  | { t: "loadout"; loadout: Loadout }
  | { t: "start" }
  /** Host only, in the lobby. */
  | { t: "mode"; mode: GameMode }
  /** Host only, in the lobby: play this match in 3D first person, or top-down. */
  | { t: "view"; view3d: boolean }
  /** Principal only. `target` and `score` (skill check, 0 to 1) are for Detention. */
  | { t: "ability"; ability: AbilityId; target?: string; score?: number }
  /** Secret prank menu: "unlock" with the cheat code first, then pranks. */
  | { t: "prank"; action: "unlock" | PrankAction; code?: string; target?: string }
  | { t: "end" }
  | ({ t: "input" } & InputFrame);

export interface RosterEntry {
  id: string;
  name: string;
  team: Team;
  loadout: Loadout;
  isBot: boolean;
  isHost: boolean;
  /** Level of the class they're playing. */
  level: number;
}

export interface RoomState {
  code: string;
  phase: Phase;
  hostId: string | null;
  mode: GameMode;
  /** The match is seen in 3D first person instead of top-down. */
  view3d: boolean;
  roster: RosterEntry[];
}

export interface PlayerSnap {
  id: string;
  x: number;
  y: number;
  aim: number;
  hp: number;
  alive: boolean;
  /** Seconds until respawn while dead. */
  respawn: number;
  protected: boolean;
  weapon: WeaponId;
  archetype: ArchetypeId;
  slot: number;
  ammo: number;
  /** Reload progress from 0 to 1, or -1 when not reloading. */
  reload: number;
  kills: number;
  deaths: number;
  /** Seconds spent in the Nurse's Office (drains while outside). */
  zone: number;
  /** Times you've entered the Nurse's Office recently; too many and you pass out. */
  visits: number;
  maxHp: number;
  /** 7v1 students: lives left (0 = out for the match). */
  lives?: number;
  /** Seconds left in detention, or 0. */
  jailed: number;
  stunned: boolean;
  /** Principal's Intercom is on: they can see every student. */
  reveal: boolean;
  /** Principal only: seconds until each ability is ready, in ABILITIES order. */
  cds?: number[];
  /** Prank effects, only sent when active. Movement speed multiplier. */
  speed?: number;
  /** Movement keys are flipped. */
  reversed?: boolean;
  god?: boolean;
  infAmmo?: boolean;
  turbo?: boolean;
  superSpeed?: boolean;
  /** Duel Principal's Staff Meeting is on: can't be hurt. */
  shielded?: boolean;
  /** Super charge, 0 to 1. */
  sup: number;
  /** Overclock (Nerd super) is running. */
  boosted?: boolean;
}

export interface BulletSnap {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  team: Team;
  w: WeaponId;
}

export type GameEvent =
  | { k: "kill"; killer: string; victim: string; weapon: WeaponId }
  /** Stayed in the Nurse's Office too long, or kept running in and out of it. */
  | { k: "passout"; victim: string; reason: "time" | "visits" | "prank" }
  | { k: "hit"; by: string; target: string; x: number; y: number; dmg: number }
  | { k: "impact"; x: number; y: number }
  | { k: "shot"; by: string; weapon: WeaponId }
  /** The Principal used an ability (for effects and sounds). */
  | { k: "ability"; by: string; ability: AbilityId; x: number; y: number }
  | { k: "jailed"; by: string; target: string; secs: number }
  /** Someone used their class super. */
  | { k: "super"; by: string; super: SuperId; x: number; y: number };

export interface Snapshot {
  t: "snap";
  tick: number;
  /** Last input seq the server processed for the receiving client. */
  ack: number;
  scores: [number, number];
  timeLeft: number;
  players: PlayerSnap[];
  bullets: BulletSnap[];
  events: GameEvent[];
}

export interface ResultsMessage {
  t: "results";
  /** Boss mode: how it ended. */
  reason?: "knockout" | "wipe" | "bell";
  mode: GameMode;
  scores: [number, number];
  winner: Team | null;
  players: {
    id: string;
    name: string;
    team: Team;
    kills: number;
    deaths: number;
    isBot: boolean;
    /** XP earned this match, per class played. */
    xp: ClassXp;
  }[];
  returnIn: number;
}

export type ServerMessage =
  | { t: "welcome"; id: string; code: string }
  | { t: "error"; message: string; fatal?: boolean }
  /** The cheat code worked: this player can use the prank menu. */
  | { t: "prank-unlocked" }
  | ({ t: "room" } & RoomState)
  | Snapshot
  | ResultsMessage;
