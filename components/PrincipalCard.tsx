"use client";

import {
  ARCHETYPES,
  BOSS_DAMAGE_BONUS,
  BOSS_SPEED_BONUS,
  DUEL_PRINCIPAL_HP,
  STUDENT_LIVES,
  abilitiesFor,
} from "@/shared/archetypes";
import { winScoreFor, type GameMode } from "@/shared/constants";
import { ABILITY_ACTIONS, keyLabel, useKeybinds } from "@/lib/settings";
import SkinPortrait from "./SkinPortrait";

/** What the Principal can do in this mode, shown to whoever takes a Principal seat. */
export default function PrincipalCard({ mode }: { mode: GameMode }) {
  const binds = useKeybinds();
  const p = ARCHETYPES.principal;
  const duel = mode === "duel";
  return (
    <div className="rounded-xl border border-orange-500/40 bg-orange-500/10 p-4">
      <p className="flex items-center gap-2 text-lg font-bold text-white">
        <SkinPortrait archetype="principal" size={44} />
        You are {duel ? "a dueling Principal" : "the Principal"}
      </p>
      <p className="mt-1 text-sm text-zinc-300">
        {duel ? (
          <>
            {DUEL_PRINCIPAL_HP} health and takes {Math.round((1 - p.defense) * 100)}% damage. You respawn, and the first
            Principal to {winScoreFor(mode)} knockouts wins.
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
        {abilitiesFor(mode).map((a, i) => (
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
