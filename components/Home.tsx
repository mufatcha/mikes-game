"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GAME_TITLE, gameServerUrl, saveName, useSavedName, wakeGameServer } from "@/lib/settings";
import KeybindSettings, { SettingsButton } from "./KeybindSettings";
import Modal from "./Modal";
import { BlueberryFighter, OrangeFighter, VsClash } from "./TitleArt";

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
    <main className="title-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12">
      {/* Blueberries on the left, Orange Peels on the right, squaring up across the screen. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="title-halftone absolute inset-0" />
        <BlueberryFighter className="absolute bottom-0 left-0 h-[92vh] max-w-[62vw] sm:max-w-[44vw]" />
        <OrangeFighter className="absolute bottom-0 right-0 h-[92vh] max-w-[62vw] sm:max-w-[44vw]" />
      </div>

      <SettingsButton
        onClick={() => setShowSettings(true)}
        className="absolute right-4 top-4 z-10 bg-black/40 text-white"
      />
      {showSettings && (
        <div className="fixed inset-0 z-20">
          <Modal onClose={() => setShowSettings(false)}>
            <KeybindSettings onDone={() => setShowSettings(false)} />
          </Modal>
        </div>
      )}
      <div className="relative z-10 flex w-full max-w-md flex-col gap-6 rounded-2xl border border-white/15 bg-black/60 p-6 shadow-2xl backdrop-blur-md">
        <VsClash className="absolute -top-16 left-1/2 h-28 -translate-x-1/2" />
        <div className="pt-6 text-center">
          <h1 className="bg-gradient-to-r from-blue-400 via-amber-200 to-orange-400 bg-clip-text text-5xl font-black uppercase italic tracking-tight text-transparent drop-shadow-[0_3px_0_rgba(0,0,0,0.6)] sm:text-6xl">
            {GAME_TITLE}
          </h1>
          <p className="mt-3 text-zinc-300">
            Pick a side and settle it in the halls. Team battles or 7 vs the Principal. Invite your friends with a
            code; bots fill any empty slots.
          </p>
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-300">Your name</span>
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

        <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-zinc-400">
          <div className="h-px flex-1 bg-white/20" />
          or join a friend
          <div className="h-px flex-1 bg-white/20" />
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
