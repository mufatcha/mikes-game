import type { Team } from "./constants";
import type { ArchetypeId, Loadout, WeaponId } from "./archetypes";

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
  | { t: "hello"; name: string; loadout: Loadout }
  | { t: "team"; team: Team }
  | { t: "loadout"; loadout: Loadout }
  | { t: "start" }
  | { t: "end" }
  | ({ t: "input" } & InputFrame);

export interface RosterEntry {
  id: string;
  name: string;
  team: Team;
  loadout: Loadout;
  isBot: boolean;
  isHost: boolean;
}

export interface RoomState {
  code: string;
  phase: Phase;
  hostId: string | null;
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
  /** Stayed in the Nurse's Office too long. */
  | { k: "passout"; victim: string }
  | { k: "hit"; by: string; target: string; x: number; y: number; dmg: number }
  | { k: "impact"; x: number; y: number }
  | { k: "shot"; by: string; weapon: WeaponId };

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
  scores: [number, number];
  winner: Team | null;
  players: { id: string; name: string; team: Team; kills: number; deaths: number; isBot: boolean }[];
  returnIn: number;
}

export type ServerMessage =
  | { t: "welcome"; id: string; code: string }
  | { t: "error"; message: string; fatal?: boolean }
  | ({ t: "room" } & RoomState)
  | Snapshot
  | ResultsMessage;
