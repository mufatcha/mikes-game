/** Type this during a match to unlock the prank menu. */
export const CHEAT_CODE = "wwssdada";

/** Pranks you do to another player. */
export type TargetPrank = "freeze" | "detention" | "reverse" | "slow" | "bring" | "yeet" | "onehp" | "knockout";
/** Toggles and boosts for yourself. */
export type SelfPrank = "god" | "ammo" | "turbo" | "super" | "heal";
export type PrankAction = TargetPrank | SelfPrank;

export const TARGET_PRANKS: { id: TargetPrank; label: string; emoji: string }[] = [
  { id: "freeze", label: "Freeze 5s", emoji: "🧊" },
  { id: "detention", label: "Detention 15s", emoji: "🔒" },
  { id: "reverse", label: "Reverse controls 15s", emoji: "🔄" },
  { id: "slow", label: "Slow 15s", emoji: "🐌" },
  { id: "bring", label: "Bring to me", emoji: "🧲" },
  { id: "yeet", label: "Yeet", emoji: "🚀" },
  { id: "onehp", label: "1 HP", emoji: "💔" },
  { id: "knockout", label: "Knock out", emoji: "💤" },
];

export const SELF_PRANKS: { id: SelfPrank; label: string; emoji: string; toggle: boolean }[] = [
  { id: "god", label: "God mode", emoji: "🛡️", toggle: true },
  { id: "ammo", label: "Infinite ammo", emoji: "♾️", toggle: true },
  { id: "turbo", label: "Turbo speed", emoji: "⚡", toggle: true },
  { id: "super", label: "Super speed", emoji: "💨", toggle: true },
  { id: "heal", label: "Full heal", emoji: "❤️", toggle: false },
];

export const PRANK_IDS: PrankAction[] = [...TARGET_PRANKS.map((p) => p.id), ...SELF_PRANKS.map((p) => p.id)];

export const FREEZE_TIME = 5;
export const PRANK_TIME = 15;
export const SLOW_MULT = 0.4;
export const TURBO_MULT = 1.8;
/** Super speed: really fast, still slow enough per tick that walls stay solid. */
export const SUPER_MULT = 3.5;
