"use client";

import { useRef, useState } from "react";
import { createProfile, exportCode, importCode, profileSummary, signOut, useProfile } from "@/lib/profile";
import Modal from "./Modal";

/** The profile button for the title screens: shows your name once you've made an account. */
export function ProfileButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  const profile = useProfile();
  return (
    <button
      type="button"
      onClick={onClick}
      title={profile ? "Your account" : "Make an account"}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition hover:bg-white/10 ${className}`}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
      </svg>
      <span className="max-w-[9rem] truncate">{profile ? profile.name : "Make an account"}</span>
    </button>
  );
}

/** The account screen: make a profile, copy a save code, or load one from another computer. */
export function ProfileModal({ onClose }: { onClose: () => void }) {
  const profile = useProfile();
  const [name, setName] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [paste, setPaste] = useState("");
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const [confirmOut, setConfirmOut] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const summary = profile ? profileSummary() : null;

  const makeCode = async () => {
    try {
      const c = await exportCode();
      setCode(c);
      return c;
    } catch {
      setMessage({ text: "This browser can't make a save code.", bad: true });
      return null;
    }
  };
  const copy = async () => {
    const c = code ?? (await makeCode());
    if (!c) return;
    try {
      await navigator.clipboard.writeText(c);
      setCopied(true);
    } catch {
      setMessage({ text: "Couldn't copy. Select the code and copy it yourself.", bad: true });
    }
  };
  const download = async () => {
    const c = code ?? (await makeCode());
    if (!c || !profile) return;
    const url = URL.createObjectURL(new Blob([c], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${profile.name.replace(/[^a-z0-9]+/gi, "-") || "profile"}.save.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const load = async (text: string) => {
    setLoading(true);
    const r = await importCode(text);
    setLoading(false);
    if (!r.ok) return setMessage({ text: r.error ?? "That code didn't work.", bad: true });
    setPaste("");
    setCode(null);
    setMessage({ text: `${r.name ? `Welcome back, ${r.name}! ` : ""}Your progress in both games is loaded. Restarting the page so everything picks it up...` });
    // Start the page fresh so nothing still holding the old progress can save over it.
    window.setTimeout(() => window.location.reload(), 1500);
  };

  const loadBox = (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Have a save code from another computer?</p>
      <textarea
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
        rows={3}
        placeholder="Paste your SWW1-... code here"
        className="resize-none rounded-lg border border-white/15 bg-white/5 px-3 py-2 font-mono text-xs text-white outline-none focus:border-amber-400"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!paste.trim() || loading}
          onClick={() => load(paste)}
          className="flex-1 rounded-lg bg-white/10 py-2 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-40"
        >
          {loading ? "Loading..." : "Load code"}
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className="flex-1 rounded-lg border border-white/15 py-2 text-sm text-zinc-300 hover:text-white">
          Load save file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,text/plain"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) load(await f.text());
          }}
        />
      </div>
      {profile && <p className="text-xs text-zinc-500">Loading a code replaces what&apos;s saved on this computer.</p>}
    </div>
  );

  return (
    <Modal onClose={onClose}>
      {!profile ? (
        <>
          <h2 className="text-2xl font-black uppercase tracking-wide text-white">Make an account</h2>
          <p className="text-sm text-zinc-300">
            One profile for <span className="font-semibold text-amber-300">School Wars</span> and{" "}
            <span className="font-semibold text-red-400">Wrathwater</span>. It keeps your levels, settings and voyage together, and gives you a
            save code to take them to any other computer. No password, no email, nothing sent anywhere.
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              createProfile(name);
              setMessage({ text: `Account made. Welcome, ${name.trim().slice(0, 16)}!` });
            }}
          >
            <input
              autoFocus
              value={name}
              maxLength={16}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pick a name"
              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-white outline-none focus:border-amber-400"
            />
            <button type="submit" disabled={!name.trim()} className="rounded-lg bg-amber-400 px-5 py-3 font-bold text-black hover:bg-amber-300 disabled:opacity-40">
              Create
            </button>
          </form>
          <div className="h-px bg-white/10" />
          {loadBox}
        </>
      ) : (
        <>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Your account</p>
            <h2 className="text-3xl font-black text-white">{profile.name}</h2>
            <ul className="mt-2 space-y-0.5 text-sm text-zinc-300">
              <li>
                <span className="text-amber-300">School Wars:</span>{" "}
                {summary && summary.classesPlayed > 0 ? `${summary.classesPlayed} class${summary.classesPlayed === 1 ? "" : "es"} leveled` : "no levels yet"}
              </li>
              <li>
                <span className="text-red-400">Wrathwater:</span>{" "}
                {summary?.wrathwater ? `Captain ${summary.wrathwater.captain}, bounty ${summary.wrathwater.bounty.toLocaleString("en-US")}` : "no voyage yet"}
              </li>
            </ul>
          </div>
          <div className="flex flex-col gap-2 rounded-lg bg-white/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Play on another computer</p>
            <p className="text-xs text-zinc-400">
              Copy your save code (or download it as a file), then open this site on the other computer, press{" "}
              <span className="font-semibold text-zinc-200">Make an account</span> and load it there. Make a new code whenever you want to bring your
              latest progress.
            </p>
            {code && (
              <textarea
                readOnly
                value={code}
                rows={3}
                onFocus={(e) => e.currentTarget.select()}
                className="resize-none rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[11px] text-zinc-200"
              />
            )}
            <div className="flex gap-2">
              <button type="button" onClick={copy} className="flex-1 rounded-lg bg-amber-400 py-2 text-sm font-bold text-black hover:bg-amber-300">
                {copied ? "Copied!" : "Copy save code"}
              </button>
              <button type="button" onClick={download} className="flex-1 rounded-lg border border-white/15 py-2 text-sm text-zinc-200 hover:text-white">
                Download save file
              </button>
            </div>
          </div>
          {loadBox}
          <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-3">
            {confirmOut ? (
              <>
                <span className="text-xs text-red-300">This erases both games&apos; progress here. Copied your code?</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setConfirmOut(false)} className="rounded-lg px-3 py-1.5 text-sm text-zinc-300 hover:text-white">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      signOut();
                      setConfirmOut(false);
                      setCode(null);
                      setMessage({ text: "Signed out. This computer is clean." });
                    }}
                    className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-bold text-white hover:bg-red-600"
                  >
                    Sign out
                  </button>
                </div>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmOut(true)} className="text-sm text-zinc-500 hover:text-red-300">
                Sign out of this computer
              </button>
            )}
          </div>
        </>
      )}
      {message && <p className={`text-center text-sm ${message.bad ? "text-red-400" : "text-emerald-300"}`}>{message.text}</p>}
      <button type="button" onClick={onClose} className="rounded-lg border border-white/15 py-2 text-sm text-zinc-300 hover:text-white">
        Done
      </button>
    </Modal>
  );
}
