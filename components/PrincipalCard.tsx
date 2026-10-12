"use client";

import {
  ARCHETYPES,
  BOSS_DAMAGE_BONUS,
  BOSS_SPEED_BONUS,
  STUDENT_LIVES,
  WEAPONS,
  abilitiesOf,
  type ArchetypeId,
} from "@/shared/archetypes";
import { winScoreFor, type GameMode } from "@/shared/constants";
import { ABILITY_ACTIONS, keyLabel, useKeybinds } from "@/lib/settings";
import SkinPortrait from "./SkinPortrait";

/**
 * What a fixed seat's character can do, shown to whoever takes it: the 7v1
 * Principal, or Barry the Blueberry or Peely the Orange in the duel.
 */
export default function PrincipalCard({ mode, archetype }: { mode: GameMode; archetype: ArchetypeId }) {
  const binds = useKeybinds();
  const p = ARCHETYPES[archetype];
  const duel = mode === "duel";
  return (
    <div
      className={`rounded-xl border p-4 ${
        archetype === "blueberry" ? "border-indigo-500/40 bg-indigo-500/10" : "border-orange-500/40 bg-orange-500/10"
      }`}
    >
      <p className="flex items-center gap-2 text-lg font-bold text-white">
        <SkinPortrait archetype={archetype} size={44} />
        You are {duel ? p.name : "the Principal"}
      </p>
      {duel && <p className="mt-1 text-sm italic text-zinc-400">{p.tagline}</p>}
      <p className="mt-1 text-sm text-zinc-300">
        {duel ? (
          <>
            {p.maxHp} health and takes {Math.round((1 - p.defense) * 100)}% damage. Throws {p.emoji}{" "}
            {weaponNames(archetype)}. You respawn, and the first mascot to {winScoreFor(mode)} knockouts
            wins.
          </>
        ) : (
          <>
            {p.maxHp} health, takes {Math.round((1 - p.defense) * 100)}% damage, moves{" "}
            {Math.round((BOSS_SPEED_BONUS - 1) * 100)}% faster and hits {Math.round((BOSS_DAMAGE_BONUS - 1) * 100)}% harder
            than usual, and doesn&apos;t respawn. Students only have {STUDENT_LIVES} lives each: survive until the
            bell or knock every student out of lives to win. The Nurse&apos;s Office won&apos;t help you.
          </>
        )}
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {abilitiesOf(archetype).map((a, i) => (
          <li key={a.id} className="rounded-lg bg-black/30 p-3">
            <p className="font-semibold text-white">
              {a.emoji} {a.name}{" "}
              <kbd className="ml-1 rounded border border-white/20 bg-white/5 px-1.5 py-0.5 font-mono text-xs text-zinc-200">
                {keyLabel(binds[ABILITY_ACTIONS[i]])}
              </kbd>
              <span className="ml-2 text-xs text-zinc-500">{a.cooldown}s cooldown</span>
            </p>
            <p className="mt-1 text-sm text-zinc-400">{a.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Blueberries and Giant Berry": the two weapons a character holds. */
function weaponNames(archetype: ArchetypeId) {
  const a = ARCHETYPES[archetype];
  return `${WEAPONS[a.primary].name} and ${WEAPONS[a.secondary].name}`;
}
