"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GAME_TITLE, gameServerUrl, saveName, useSavedName, wakeGameServer } from "@/lib/settings";
import KeybindSettings, { SettingsButton } from "./KeybindSettings";
import Modal from "./Modal";

export default function Home() {
  const router = useRouter();
  const savedName = useSavedName();
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const name = nameDraft ?? savedName;
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waking, setWaking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Start waking the game server as soon as someone opens the site.
  useEffect(() => {
    fetch(`${gameServerUrl()}/health`, { cache: "no-store" }).catch(() => {});
  }, []);

  const ensureName = () => {
    if (!name.trim()) {
      setError("Enter a name first.");
      return false;
    }
    saveName(name);
    return true;
  };

  const create = async () => {
    if (!ensureName()) return;
    setBusy(true);
    setError(null);
    try {
      const awake = await wakeGameServer(() => setWaking(true));
      setWaking(false);
      if (!awake) throw new Error("The game server didn't respond. Try again in a moment.");
      const res = await fetch(`${gameServerUrl()}/rooms`, { method: "POST" });
      const body = (await res.json()) as { code?: string; error?: string };
      if (!res.ok || !body.code) throw new Error(body.error ?? "Could not create a match.");
      router.push(`/play/${body.code}`);
    } catch (e) {
      setError(e instanceof TypeError ? "The game server is offline." : (e as Error).message);
      setWaking(false);
      setBusy(false);
    }
  };

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (!c) return setError("Enter an invite code.");
    if (!ensureName()) return;
    router.push(`/play/${c}`);
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <SettingsButton onClick={() => setShowSettings(true)} className="absolute right-4 top-4" />
      {showSettings && (
        <div className="fixed inset-0 z-10">
          <Modal onClose={() => setShowSettings(false)}>
            <KeybindSettings onDone={() => setShowSettings(false)} />
          </Modal>
        </div>
      )}
      <div className="flex w-full max-w-md flex-col gap-8">
        <div className="text-center">
          <h1 className="text-5xl font-black tracking-tight text-white">{GAME_TITLE}</h1>
          <p className="mt-3 text-zinc-400">
            Top-down 4v4 team deathmatch. Invite your friends with a code; bots fill any empty slots.
          </p>
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Your name</span>
          <input
            value={name}
            maxLength={16}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => name.trim() && saveName(name)}
            placeholder="Enter a name"
            className="rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-white outline-none focus:border-amber-400"
          />
        </label>

        <button
          type="button"
          onClick={create}
          disabled={busy}
          className="rounded-xl bg-amber-400 px-6 py-4 text-lg font-bold text-black transition hover:bg-amber-300 disabled:opacity-50"
        >
          {waking ? "Waking up the game server…" : busy ? "Creating…" : "Create private match"}
        </button>

        <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-zinc-500">
          <div className="h-px flex-1 bg-white/10" />
          or join a friend
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <form onSubmit={join} className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={8}
            placeholder="INVITE CODE"
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-4 py-3 font-mono tracking-[0.2em] text-white outline-none focus:border-amber-400"
          />
          <button
            type="submit"
            className="rounded-lg border border-white/20 px-5 py-3 font-semibold text-white hover:border-white/50"
          >
            Join
          </button>
        </form>

        {waking && (
          <p className="text-center text-sm text-zinc-400">
            The server sleeps when nobody is playing. It can take up to a minute to wake up.
          </p>
        )}
        {error && <p className="text-center text-sm text-red-400">{error}</p>}
      </div>
    </main>
  );
}
