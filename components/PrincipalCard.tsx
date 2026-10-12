"use client";

import { ABILITIES, ARCHETYPES } from "@/shared/archetypes";
import { ABILITY_ACTIONS, keyLabel, useKeybinds } from "@/lib/settings";

/** What the Principal can do, shown to whoever takes the Principal seat. */
export default function PrincipalCard() {
  const binds = useKeybinds();
  const p = ARCHETYPES.principal;
  return (
    <div className="rounded-xl border border-orange-500/40 bg-orange-500/10 p-4">
      <p className="text-lg font-bold text-white">
        {p.emoji} You are the Principal
      </p>
      <p className="mt-1 text-sm text-zinc-300">
        {p.maxHp} health, takes {Math.round((1 - p.defense) * 100)}% damage, and doesn&apos;t respawn. Survive until the
        bell to win. The Nurse&apos;s Office won&apos;t help you.
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {ABILITIES.map((a, i) => (
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
