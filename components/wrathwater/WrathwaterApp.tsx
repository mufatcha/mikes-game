"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  KING_BOUNTY,
  UPGRADES,
  formatBerries,
  playerStats,
  rankFor,
  shortBerries,
  upgradeCost,
  type UpgradeId,
} from "@/game/wrathwater/data";
import type { HudState, Notice, WrathwaterEngine } from "@/game/wrathwater/engine";
import {
  FRUITS,
  FRUIT_SELL_PRICE,
  MATERIAL_NAMES,
  RECIPES,
  SHOT_RECIPE,
  WEAPONS,
  WEAPON_ORDER,
  type FruitId,
  type MaterialId,
} from "@/game/wrathwater/items";
import { deleteSave, loadSave, newSave, writeSave, type SaveData } from "@/game/wrathwater/save";

type Screen = "menu" | "naming" | "playing";
type Overlay = "none" | "pause" | "shop" | "market" | "sunk" | "defeated" | "king" | "help" | "inventory" | "fruit";

const SAVE_KEY = "ww.save.v1";

// The saved game, read from localStorage without a hydration mismatch.
const noop = () => () => {};
function useSavedRaw() {
  return useSyncExternalStore(
    noop,
    () => {
      try {
        return localStorage.getItem(SAVE_KEY);
      } catch {
        return null;
      }
    },
    () => null,
  );
}

export default function WrathwaterApp() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [save, setSave] = useState<SaveData | null>(null);
  const rawSave = useSavedRaw();
  const existing = rawSave ? loadSave() : null;

  if (screen === "playing" && save) {
    return <Voyage save={save} onQuit={() => setScreen("menu")} />;
  }
  return (
    <TitleMenu
      existing={existing}
      naming={screen === "naming"}
      onContinue={() => {
        if (!existing) return;
        setSave(existing);
        setScreen("playing");
      }}
      onNew={() => setScreen("naming")}
      onCancelNew={() => setScreen("menu")}
      onStart={(captain) => {
        deleteSave();
        const s = newSave(captain);
        writeSave(s);
        setSave(s);
        setScreen("playing");
      }}
    />
  );
}

// ---------------------------------------------------------------- title menu

function TitleMenu({
  existing,
  naming,
  onContinue,
  onNew,
  onCancelNew,
  onStart,
}: {
  existing: SaveData | null;
  naming: boolean;
  onContinue: () => void;
  onNew: () => void;
  onCancelNew: () => void;
  onStart: (captain: string) => void;
}) {
  const [name, setName] = useState("");
  const [help, setHelp] = useState(false);
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-black px-4 py-10">
      <div className="pointer-events-none absolute inset-0 animate-[pulse_8s_ease-in-out_infinite] opacity-70">
        <Image src="/wrathwater/title.jpg" alt="" fill priority sizes="100vw" className="object-cover" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.85))]" />
      <Link
        href="/"
        className="absolute left-4 top-4 z-10 rounded-lg bg-black/60 px-3 py-2 text-sm text-zinc-300 ring-1 ring-white/15 hover:text-white"
      >
        ← School Wars
      </Link>
      <div className="relative z-10 mt-[38vh] flex w-full max-w-sm flex-col gap-3">
        {naming ? (
          <form
            className="flex flex-col gap-3 rounded-xl bg-black/75 p-5 ring-1 ring-white/15 backdrop-blur"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) onStart(name.trim().slice(0, 20));
            }}
          >
            <label className="font-serif text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">Name your captain</label>
            <input
              autoFocus
              value={name}
              maxLength={20}
              onChange={(e) => setName(e.target.value)}
              placeholder="Captain ..."
              className="rounded-lg border border-white/15 bg-white/5 px-4 py-3 font-serif text-lg text-white outline-none focus:border-red-700"
            />
            {existing && (
              <p className="text-xs text-red-300">
                This starts over: Captain {existing.captain}&apos;s {shortBerries(existing.bounty)} bounty will be lost.
              </p>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={onCancelNew} className="flex-1 rounded-lg border border-white/20 py-3 text-zinc-300 hover:text-white">
                Back
              </button>
              <button
                type="submit"
                disabled={!name.trim()}
                className="flex-[2] rounded-lg bg-red-800 py-3 font-bold uppercase tracking-widest text-white hover:bg-red-700 disabled:opacity-40"
              >
                Set sail
              </button>
            </div>
          </form>
        ) : (
          <>
            {existing && (
              <MenuButton primary onClick={onContinue}>
                Continue · Captain {existing.captain}
                <span className="block text-xs font-normal normal-case tracking-normal text-red-100/80">
                  {rankFor(existing.bounty).title} · bounty {shortBerries(existing.bounty)}
                  {existing.fruit ? ` · ${FRUITS[existing.fruit].name}` : ""}
                </span>
              </MenuButton>
            )}
            <MenuButton primary={!existing} onClick={onNew}>
              New voyage
            </MenuButton>
            <MenuButton onClick={() => setHelp(true)}>How to play</MenuButton>
          </>
        )}
      </div>
      {help && (
        <Modal onClose={() => setHelp(false)}>
          <HowToPlay />
          <PanelButton primary onClick={() => setHelp(false)}>
            Got it
          </PanelButton>
        </Modal>
      )}
    </main>
  );
}

function MenuButton({ children, onClick, primary }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-6 py-3 font-serif text-lg font-bold uppercase tracking-widest transition hover:scale-[1.02] ${
        primary
          ? "bg-red-900/90 text-white shadow-[0_0_30px_rgba(127,29,29,0.6)] ring-1 ring-red-500/40 hover:bg-red-800"
          : "bg-black/70 text-zinc-200 ring-1 ring-white/15 hover:text-white hover:ring-white/40"
      }`}
    >
      {children}
    </button>
  );
}

function HowToPlay() {
  const sea: [string, string][] = [
    ["W / S", "Raise or lower the sails"],
    ["A / D", "Steer"],
    ["Mouse", "Look around (click the game first)"],
    ["Click / Space", "Fire the broadside you're looking toward"],
    ["Q / E", "Fire the left / right broadside"],
    ["F", "Dock at Blackwater Cove, or go ashore at an island"],
  ];
  const land: [string, string][] = [
    ["WASD / Shift", "Walk / sprint"],
    ["Click / Right-click", "Attack / aim"],
    ["E (hold)", "Loot chests, dig treasure, rob buildings"],
    ["F", "Board your ship"],
    ["1-7 / Q", "Switch weapons"],
  ];
  const both: [string, string][] = [
    ["R", "Use your Devil Fruit power"],
    ["I / Tab", "Inventory and crafting"],
    ["Esc", "Pause"],
  ];
  const table = (title: string, rows: [string, string][]) => (
    <div>
      <p className="mb-1 mt-3 text-xs font-bold uppercase tracking-widest text-red-300">{title}</p>
      <table className="w-full">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="w-36 py-0.5 pr-3 font-mono text-xs text-amber-200">{k}</td>
              <td className="py-0.5">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="text-sm text-zinc-300">
      <h2 className="mb-2 font-serif text-2xl font-black uppercase tracking-wide text-white">How to play</h2>
      <p className="mb-2">
        Raise your bounty to <span className="font-semibold text-amber-300">{formatBerries(KING_BOUNTY)}</span> and
        become the King of Wrathwater. Sink ships, raid islands, rob towns, and hunt for Devil Fruits.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Crimes raise your wanted level (★). More stars, more Marines. Hide, or flee to Blackwater Cove.</li>
        <li>Anchor near an island and press F to go ashore. Chests, buried treasure (X) and supply crates hold gold and materials.</li>
        <li>Towns have banks, shops and armories to rob, guarded by Marines.</li>
        <li>Craft weapons from timber, iron and gunpowder (I). Armories have weapons to steal.</li>
        <li>Devil Fruits grant a power, but fruit eaters can never swim again.</li>
      </ul>
      {table("At sea", sea)}
      {table("On foot", land)}
      {table("Anywhere", both)}
    </div>
  );
}

function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose?: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className={`max-h-full w-full overflow-y-auto rounded-2xl bg-gradient-to-b from-zinc-900 to-zinc-950 p-6 shadow-2xl ring-1 ring-white/15 ${wide ? "max-w-3xl" : "max-w-lg"}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function PanelButton({ children, onClick, primary, disabled }: { children: React.ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`mt-3 w-full rounded-lg px-4 py-2.5 font-semibold transition disabled:opacity-40 ${
        primary ? "bg-red-800 text-white hover:bg-red-700" : "bg-white/5 text-zinc-200 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- the voyage

function Voyage({ save, onQuit }: { save: SaveData; onQuit: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<WrathwaterEngine | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [foundFruit, setFoundFruit] = useState<FruitId | null>(null);
  const [hurt, setHurt] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let created: WrathwaterEngine | null = null;
    let hurtTimer = 0;
    import("@/game/wrathwater/engine")
      .then(({ WrathwaterEngine }) => {
        if (disposed || !hostRef.current || !minimapRef.current) return;
        created = new WrathwaterEngine(hostRef.current, minimapRef.current, save, {
          onHud: setHud,
          onNotice: (n) => {
            setNotices((list) => [...list.slice(-3), n]);
            window.setTimeout(() => setNotices((list) => list.filter((x) => x.id !== n.id)), 5500);
          },
          onSunk: (onFoot) => setOverlay(onFoot ? "defeated" : "sunk"),
          onKing: () => setOverlay("king"),
          onPauseRequest: () => setOverlay((o) => (o === "none" ? "pause" : o)),
          onService: (kind) => setOverlay(kind === "shipwright" ? "shop" : kind === "blacksmith" ? "inventory" : "market"),
          onFruit: (f) => {
            setFoundFruit(f);
            setOverlay("fruit");
          },
          onInventory: () => setOverlay((o) => (o === "none" ? "inventory" : o)),
          onHurt: () => {
            setHurt(true);
            window.clearTimeout(hurtTimer);
            hurtTimer = window.setTimeout(() => setHurt(false), 350);
          },
        });
        setEngine(created);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Could not start the game."));
    return () => {
      disposed = true;
      window.clearTimeout(hurtTimer);
      created?.dispose();
      setEngine(null);
    };
  }, [save]);

  // Pause the sea whenever a menu is open.
  useEffect(() => {
    engine?.setPaused(overlay !== "none");
  }, [overlay, engine]);

  const resume = () => {
    setOverlay("none");
    engine?.requestPointer();
  };

  if (loadError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black p-6 text-center text-zinc-300">
        <p>Wrathwater couldn&apos;t start: {loadError}</p>
        <p className="text-sm text-zinc-500">It needs a browser with WebGL (3D graphics) turned on.</p>
        <button type="button" onClick={onQuit} className="rounded-lg bg-red-800 px-4 py-2 text-white">
          Back to menu
        </button>
      </main>
    );
  }

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-black font-sans text-white">
      <div ref={hostRef} className="absolute inset-0" />
      {/* Cinematic vignette, plus a red flash when you take a hit. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.55))]" />
      <div
        className={`pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(220,38,38,0.45))] transition-opacity duration-300 ${hurt ? "opacity-100" : "opacity-0"}`}
      />
      {hud && <Hud hud={hud} />}
      <canvas ref={minimapRef} className="pointer-events-none absolute bottom-4 right-4 h-44 w-44 sm:h-52 sm:w-52" />

      <div className="pointer-events-none absolute left-1/2 top-24 flex w-full max-w-xl -translate-x-1/2 flex-col items-center gap-2 px-4">
        {notices.map((n) => (
          <div
            key={n.id}
            className={`rounded-lg px-4 py-2 text-center text-sm font-semibold shadow-lg backdrop-blur ${
              {
                gold: "bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/40",
                bounty: "bg-red-900/50 text-red-50 ring-1 ring-red-400/40",
                danger: "bg-black/70 text-red-300 ring-1 ring-red-500/50",
                info: "bg-black/60 text-zinc-200 ring-1 ring-white/15",
              }[n.tone]
            }`}
          >
            {n.text}
          </div>
        ))}
      </div>

      {hud && !hud.pointerLocked && overlay === "none" && (
        <button
          type="button"
          onClick={() => engine?.requestPointer()}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-black/70 px-5 py-3 text-sm font-semibold ring-1 ring-white/20 hover:ring-white/50"
        >
          Click to take the helm (mouse to look around)
        </button>
      )}

      {overlay === "pause" && (
        <Modal onClose={resume}>
          <h2 className="mb-2 font-serif text-3xl font-black uppercase tracking-wide">Paused</h2>
          <PanelButton onClick={resume} primary>
            Resume
          </PanelButton>
          <PanelButton onClick={() => setOverlay("inventory")}>Inventory &amp; crafting</PanelButton>
          <PanelButton onClick={() => setOverlay("help")}>How to play</PanelButton>
          <PanelButton
            onClick={() => {
              engine?.save();
              onQuit();
            }}
          >
            Save &amp; quit to menu
          </PanelButton>
        </Modal>
      )}
      {overlay === "help" && (
        <Modal onClose={() => setOverlay("pause")}>
          <HowToPlay />
          <PanelButton onClick={() => setOverlay("pause")} primary>
            Back
          </PanelButton>
        </Modal>
      )}
      {overlay === "inventory" && engine && <Inventory engine={engine} onClose={resume} />}
      {overlay === "shop" && engine && <Shipwright engine={engine} onClose={resume} />}
      {overlay === "market" && engine && <BlackMarket engine={engine} onClose={resume} />}
      {overlay === "fruit" && engine && foundFruit && (
        <FruitFound
          engine={engine}
          fruit={foundFruit}
          onClose={() => {
            setFoundFruit(null);
            resume();
          }}
        />
      )}
      {(overlay === "sunk" || overlay === "defeated") && (
        <Modal>
          <h2 className="font-serif text-3xl font-black uppercase tracking-wide text-red-400">
            {overlay === "sunk" ? "Your ship went down" : "You were defeated"}
          </h2>
          <p className="mt-2 text-zinc-300">
            You lose a quarter of your gold. Your bounty stands: the world won&apos;t forget your name.
          </p>
          <PanelButton
            primary
            onClick={() => {
              engine?.respawn();
              resume();
            }}
          >
            Return to Blackwater Cove
          </PanelButton>
        </Modal>
      )}
      {overlay === "king" && hud && (
        <Modal>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.4em] text-amber-300">Bounty {formatBerries(hud.bounty)}</p>
          <h2 className="mt-2 text-center font-serif text-4xl font-black uppercase text-amber-200">King of Wrathwater</h2>
          <p className="mt-3 text-center text-zinc-300">
            Captain {hud.captain}, no pirate has ever been worth more. Every sea is yours. Keep sailing; the Marines
            will never stop coming.
          </p>
          <PanelButton primary onClick={resume}>
            Keep sailing
          </PanelButton>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- HUD

function Hud({ hud }: { hud: HudState }) {
  const nextFrac = hud.nextRank ? Math.min(1, hud.bounty / hud.nextRank.bounty) : 1;
  return (
    <>
      <Compass hud={hud} />

      {/* Wanted poster */}
      <div className="pointer-events-none absolute left-4 top-4 w-56 rotate-[-1.5deg] rounded-sm bg-[#e9dcc0] bg-[radial-gradient(ellipse_at_center,#efe3c8,#d8c39a)] px-4 py-3 text-center text-[#2b1d10] shadow-2xl ring-1 ring-black/40">
        <p className="font-serif text-3xl font-black tracking-[0.15em]">WANTED</p>
        <p className="-mt-1 font-serif text-[10px] font-bold tracking-[0.3em]">DEAD OR ALIVE</p>
        <p className="mt-1 truncate font-serif text-lg font-bold">{hud.captain}</p>
        <p className="font-serif text-xl font-black">{formatBerries(hud.bounty)}</p>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6b4a2b]">{hud.rankTitle}</p>
        {hud.nextRank && (
          <div className="mt-1.5">
            <div className="h-1.5 w-full rounded-full bg-[#2b1d10]/20">
              <div className="h-1.5 rounded-full bg-[#7f1d1d]" style={{ width: `${nextFrac * 100}%` }} />
            </div>
            <p className="mt-0.5 text-[10px] text-[#6b4a2b]">
              Next: {hud.nextRank.title} at {shortBerries(hud.nextRank.bounty)}
            </p>
          </div>
        )}
      </div>

      {/* Wanted level and purse */}
      <div className="pointer-events-none absolute right-4 top-4 text-right">
        <div className={`text-3xl tracking-wider ${hud.hunted ? "animate-pulse" : ""}`}>
          {[1, 2, 3, 4, 5].map((i) => (
            <span key={i} className={i <= hud.stars ? "text-red-500 drop-shadow-[0_0_6px_rgba(239,68,68,0.8)]" : "text-white/20"}>
              ★
            </span>
          ))}
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-300 drop-shadow">
          {hud.hidden ? "Hidden in smoke" : hud.inHaven ? "Safe in Blackwater Cove" : hud.stars > 0 ? "Marines hunting you" : "Not wanted"}
        </p>
        <p className="mt-2 text-lg font-bold text-amber-300 drop-shadow">{hud.gold.toLocaleString("en-US")} gold</p>
      </div>

      {hud.mode === "ship" ? <ShipPanel hud={hud} /> : <FootPanel hud={hud} />}
      {hud.fruit && <PowerBadge fruit={hud.fruit} />}

      <Prompt hud={hud} />
      {hud.nearStorm && (
        <div className="pointer-events-none absolute bottom-44 left-1/2 -translate-x-1/2 rounded-xl bg-red-950/80 px-5 py-2 text-sm font-semibold text-red-200">
          The storm wall drives you back. Wrathwater ends here.
        </div>
      )}
      {((hud.mode === "ship" && hud.aimSide !== null && !hud.inHaven) || (hud.mode === "foot" && hud.pointerLocked)) && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2">
          <div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-white/80" />
          <div className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-white/80" />
        </div>
      )}
    </>
  );
}

/** A heading strip across the top showing compass points and nearby islands. */
function Compass({ hud }: { hud: HudState }) {
  const width = 420;
  const span = Math.PI * 0.75; // the strip shows 135 degrees either way
  const place = (bearing: number) => (bearing / span) * (width / 2) + width / 2;
  const points: [string, number][] = [
    ["N", -Math.PI / 2],
    ["E", 0],
    ["S", Math.PI / 2],
    ["W", Math.PI],
  ];
  const rel = (angle: number) => {
    let b = angle - hud.compass.heading;
    while (b > Math.PI) b -= Math.PI * 2;
    while (b < -Math.PI) b += Math.PI * 2;
    return b;
  };
  return (
    <div className="pointer-events-none absolute left-1/2 top-4 h-12 -translate-x-1/2 overflow-hidden rounded-lg bg-gradient-to-r from-transparent via-black/50 to-transparent" style={{ width }}>
      <div className="absolute left-1/2 top-0 h-2 w-0.5 bg-amber-300" />
      {points.map(([label, a]) => {
        const b = rel(a);
        if (Math.abs(b) > span) return null;
        return (
          <span key={label} className="absolute top-1 -translate-x-1/2 font-serif text-sm font-bold text-white/90" style={{ left: place(b) }}>
            {label}
          </span>
        );
      })}
      {hud.compass.markers.map((m) => {
        if (Math.abs(m.bearing) > span) return null;
        const color = m.kind === "town" ? "text-sky-300" : m.kind === "haven" ? "text-amber-300" : m.kind === "mystery" ? "text-fuchsia-300" : "text-emerald-200";
        return (
          <span key={m.label} className={`absolute top-6 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold ${color}`} style={{ left: place(m.bearing) }}>
            ▾ {m.label} {Math.max(0, Math.round(m.distance / 10) * 10)}m
          </span>
        );
      })}
    </div>
  );
}

function Bar({ frac, color }: { frac: number; color: string }) {
  return (
    <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
      <div className={`h-2.5 rounded-full transition-[width] duration-200 ${color}`} style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%` }} />
    </div>
  );
}

function ShipPanel({ hud }: { hud: HudState }) {
  const hpFrac = hud.maxHp ? hud.hp / hud.maxHp : 0;
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 w-64 rounded-xl bg-black/60 p-3 ring-1 ring-white/10 backdrop-blur">
      <div className="flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-400">
        <span>Hull</span>
        <span className="text-sm font-bold text-white">
          {hud.hp} / {hud.maxHp}
        </span>
      </div>
      <Bar frac={hpFrac} color={hpFrac > 0.5 ? "bg-emerald-400" : hpFrac > 0.25 ? "bg-amber-400" : "bg-red-500"} />
      <div className="mt-3 flex items-center justify-between text-xs uppercase tracking-widest text-zinc-400">
        <span>Sails</span>
        <span className="flex gap-1">
          {[1, 2, 3].map((i) => (
            <span key={i} className={`h-3 w-5 rounded-sm ${i <= hud.sails ? "bg-zinc-100" : "bg-white/10"}`} />
          ))}
        </span>
        <span className="text-sm font-bold text-white">{hud.knots} kn</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] uppercase tracking-widest text-zinc-400">
        <ReloadBar label="Port (Q)" frac={hud.reload.port} active={hud.aimSide === -1} />
        <ReloadBar label="Starboard (E)" frac={hud.reload.starboard} active={hud.aimSide === 1} />
      </div>
    </div>
  );
}

function FootPanel({ hud }: { hud: HudState }) {
  const hpFrac = hud.heroMaxHp ? hud.heroHp / hud.heroMaxHp : 0;
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 w-64 rounded-xl bg-black/60 p-3 ring-1 ring-white/10 backdrop-blur">
      <div className="flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-400">
        <span>Health</span>
        <span className="text-sm font-bold text-white">
          {hud.heroHp} / {hud.heroMaxHp}
        </span>
      </div>
      <Bar frac={hpFrac} color={hpFrac > 0.5 ? "bg-emerald-400" : hpFrac > 0.25 ? "bg-amber-400" : "bg-red-500"} />
      <div className="mt-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-400">
        <span>Weapon</span>
        <span className="text-sm font-bold normal-case tracking-normal text-white">
          {hud.weapon.name}
          {hud.weapon.ammo !== null && <span className={hud.weapon.ammo > 0 ? "text-amber-300" : "text-red-400"}> · {hud.weapon.ammo} shot</span>}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-white/10">
        <div className={`h-1.5 rounded-full ${hud.weapon.ready >= 0.999 ? "bg-amber-300" : "bg-zinc-500"}`} style={{ width: `${Math.min(1, hud.weapon.ready) * 100}%` }} />
      </div>
      <p className="mt-2 text-[10px] uppercase tracking-widest text-zinc-500">Ship hull {hud.hp} / {hud.maxHp}</p>
    </div>
  );
}

function PowerBadge({ fruit }: { fruit: NonNullable<HudState["fruit"]> }) {
  const def = FRUITS[fruit.id];
  const ready = fruit.ready >= 0.999;
  return (
    <div className="pointer-events-none absolute bottom-4 left-72 flex items-center gap-3 rounded-xl bg-black/60 p-2 pr-4 ring-1 ring-white/10 backdrop-blur">
      <div
        className="relative h-12 w-12 rounded-full"
        style={{ background: `conic-gradient(${def.color} ${Math.min(1, fruit.ready) * 360}deg, rgba(255,255,255,0.08) 0deg)` }}
      >
        <div className={`absolute inset-1 flex items-center justify-center rounded-full bg-black/80 font-mono text-sm font-bold ${ready ? "text-white" : "text-zinc-500"}`}>R</div>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-widest text-zinc-400">{fruit.name}</p>
        <p className={`text-sm font-bold ${ready ? "text-white" : "text-zinc-500"}`}>{fruit.power}</p>
      </div>
    </div>
  );
}

function Prompt({ hud }: { hud: HudState }) {
  let key = "";
  let label = "";
  let progress = 0;
  let hold = false;
  if (hud.mode === "ship") {
    if (hud.landing) {
      key = "F";
      label = `Dock at ${hud.landing}`;
    }
  } else if (hud.prompt) {
    key = hud.prompt.key === "board" ? "F / E" : "E";
    label = hud.prompt.label;
    hold = hud.prompt.hold > 0;
    progress = hud.prompt.progress;
  }
  if (!label) return null;
  return (
    <div className="pointer-events-none absolute bottom-28 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5">
      <div className="flex items-center gap-2 rounded-xl bg-black/70 px-4 py-2 font-semibold shadow-xl ring-1 ring-amber-400/40">
        <kbd className="rounded bg-amber-400 px-2 py-0.5 font-mono text-sm font-black text-black">{key}</kbd>
        <span>
          {hold ? "Hold to " : ""}
          {hold ? label.charAt(0).toLowerCase() + label.slice(1) : label}
        </span>
      </div>
      {hold && progress > 0 && (
        <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/15">
          <div className="h-1.5 rounded-full bg-amber-300" style={{ width: `${Math.min(1, progress) * 100}%` }} />
        </div>
      )}
    </div>
  );
}

function ReloadBar({ label, frac, active }: { label: string; frac: number; active: boolean }) {
  const ready = frac >= 0.999;
  return (
    <div className={active ? "text-amber-200" : ""}>
      <span>{label}</span>
      <div className="mt-1 h-1.5 w-full rounded-full bg-white/10">
        <div className={`h-1.5 rounded-full ${ready ? "bg-amber-300" : "bg-zinc-500"}`} style={{ width: `${Math.min(1, frac) * 100}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- inventory and crafting

function Inventory({ engine, onClose }: { engine: WrathwaterEngine; onClose: () => void }) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const save = engine.sim.save;
  const inHaven = engine.sim.inHaven;
  return (
    <Modal wide onClose={onClose}>
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-3xl font-black uppercase tracking-wide">Inventory</h2>
        <span className="text-lg font-bold text-amber-300">{save.gold.toLocaleString("en-US")} gold</span>
      </div>

      <section className="mt-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-red-300">Materials</h3>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {(Object.keys(MATERIAL_NAMES) as MaterialId[]).map((m) => (
            <div key={m} className="rounded-lg bg-white/5 p-3 text-center">
              <p className="text-2xl font-black">{save.materials[m]}</p>
              <p className="text-xs uppercase tracking-widest text-zinc-400">{MATERIAL_NAMES[m]}</p>
            </div>
          ))}
          <div className="flex flex-col rounded-lg bg-white/5 p-3 text-center">
            <p className="text-2xl font-black text-amber-300">{save.ammo}</p>
            <p className="text-xs uppercase tracking-widest text-zinc-400">Shot</p>
            <button
              type="button"
              disabled={!engine.canMakeShot()}
              onClick={() => {
                engine.makeShot();
                refresh();
              }}
              className="mt-2 rounded-md bg-red-800 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:bg-white/5 disabled:text-zinc-500"
              title="Make lead shot for your guns"
            >
              +{SHOT_RECIPE.rounds}: {Object.entries(SHOT_RECIPE.materials).map(([m, n]) => `${n} ${MATERIAL_NAMES[m as MaterialId].toLowerCase()}`).join(", ")}
            </button>
          </div>
        </div>
      </section>

      <section className="mt-5">
        <h3 className="text-xs font-bold uppercase tracking-widest text-red-300">Weapons (on foot)</h3>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {WEAPON_ORDER.map((id, i) => {
            const w = WEAPONS[id];
            const owned = id === "fists" || save.weapons.includes(id);
            const recipe = RECIPES.find((r) => r.weapon === id);
            const equipped = save.equipped === id;
            return (
              <div key={id} className={`flex flex-col rounded-lg p-3 ring-1 ${equipped ? "bg-amber-400/10 ring-amber-400/60" : "bg-white/5 ring-white/5"}`}>
                <div className="flex items-baseline justify-between">
                  <p className="font-semibold">{w.name}</p>
                  <span className="font-mono text-xs text-zinc-500">{i + 1}</span>
                </div>
                <p className="text-xs text-zinc-400">{w.description}</p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {w.kind === "gun" ? "Gun" : "Melee"} · {w.damage}
                  {w.pellets > 1 ? `×${w.pellets}` : ""} dmg · {w.cooldown}s
                </p>
                <div className="mt-auto pt-2">
                  {owned ? (
                    <button
                      type="button"
                      disabled={equipped}
                      onClick={() => {
                        engine.equip(id);
                        refresh();
                      }}
                      className="w-full rounded-md bg-white/10 py-1.5 text-sm font-semibold hover:bg-white/20 disabled:bg-amber-400 disabled:text-black"
                    >
                      {equipped ? "Equipped" : "Equip"}
                    </button>
                  ) : recipe ? (
                    <button
                      type="button"
                      disabled={!engine.canCraft(id)}
                      onClick={() => {
                        engine.craft(id);
                        refresh();
                      }}
                      className="w-full rounded-md bg-red-800 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:bg-white/5 disabled:text-zinc-500"
                      title="Craft it, or steal one from a town armory"
                    >
                      Craft: {Object.entries(recipe.materials).map(([m, n]) => `${n} ${MATERIAL_NAMES[m as MaterialId].toLowerCase()}`).join(", ")}, {recipe.gold}g
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-5">
        <h3 className="text-xs font-bold uppercase tracking-widest text-red-300">Devil Fruit</h3>
        {save.fruit ? (
          <FruitCard fruit={save.fruit} note="Eaten. Press R to use its power. You can never swim." />
        ) : (
          <p className="mt-1 text-sm text-zinc-400">You haven&apos;t eaten one. They hide in treasure, and one waits on Kraken&apos;s Tooth.</p>
        )}
        {save.heldFruits.map((f) => (
          <div key={f} className="mt-2">
            <FruitCard fruit={f} note="Carried, not eaten." />
            <div className="flex gap-2">
              <PanelButton
                primary
                disabled={!!save.fruit}
                onClick={() => {
                  engine.eatFruit(f);
                  refresh();
                }}
              >
                {save.fruit ? "A second fruit would kill you" : "Eat it"}
              </PanelButton>
              <PanelButton
                disabled={!inHaven}
                onClick={() => {
                  engine.sellFruit(f);
                  refresh();
                }}
              >
                {inHaven ? `Sell for ${FRUIT_SELL_PRICE} gold` : "Sell at Blackwater Cove"}
              </PanelButton>
            </div>
          </div>
        ))}
      </section>
      <PanelButton primary onClick={onClose}>
        Close
      </PanelButton>
    </Modal>
  );
}

function FruitCard({ fruit, note }: { fruit: FruitId; note: string }) {
  const def = FRUITS[fruit];
  return (
    <div className="mt-2 flex items-center gap-4 rounded-xl bg-white/5 p-3">
      <div
        className="h-14 w-14 shrink-0 rounded-full shadow-[0_0_25px_rgba(255,255,255,0.15)]"
        style={{ background: `repeating-radial-gradient(circle at 40% 40%, ${def.color} 0 6px, ${def.swirl} 6px 9px)` }}
      />
      <div>
        <p className="font-serif text-lg font-bold">{def.name}</p>
        <p className="text-sm text-zinc-300">
          <span className="font-semibold text-amber-200">{def.power}:</span> {def.description}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">{note}</p>
      </div>
    </div>
  );
}

function FruitFound({ engine, fruit, onClose }: { engine: WrathwaterEngine; fruit: FruitId; onClose: () => void }) {
  const has = !!engine.sim.save.fruit;
  return (
    <Modal>
      <p className="text-center text-xs font-bold uppercase tracking-[0.4em] text-fuchsia-300">You found a Devil Fruit!</p>
      <FruitCard fruit={fruit} note="It tastes terrible, they say. And whoever eats one can never swim again." />
      <div className="flex gap-2">
        <PanelButton
          primary
          disabled={has}
          onClick={() => {
            engine.eatFruit(fruit);
            onClose();
          }}
        >
          {has ? "You already have a power" : "Eat it now"}
        </PanelButton>
        <PanelButton onClick={onClose}>Keep it for later</PanelButton>
      </div>
      {has && <p className="mt-2 text-center text-xs text-zinc-400">A second Devil Fruit would kill you. Sell it at Blackwater Cove instead.</p>}
    </Modal>
  );
}

// ---------------------------------------------------------------- shipwright

function Shipwright({ engine, onClose }: { engine: WrathwaterEngine; onClose: () => void }) {
  const [, setTick] = useState(0);
  const save = engine.sim.save;
  const stats = playerStats(save.upgrades);
  return (
    <Modal wide>
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-3xl font-black uppercase tracking-wide">Shipwright</h2>
        <span className="text-lg font-bold text-amber-300">{save.gold.toLocaleString("en-US")} gold</span>
      </div>
      <p className="mt-1 text-sm text-zinc-400">&ldquo;Your hull&apos;s patched, Captain. Now, what&apos;ll it be?&rdquo; Spend your gold on upgrades.</p>
      <p className="mt-2 text-xs text-zinc-500">
        Hull {Math.round(stats.hull)} · {stats.cannonsPerSide} cannons a side · damage {Math.round(stats.damage)} · reload{" "}
        {stats.reload.toFixed(1)}s · speed {Math.round(stats.speed)}
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {UPGRADES.map((u) => {
          const level = save.upgrades[u.id as UpgradeId];
          const maxed = level >= u.maxLevel;
          const cost = maxed ? 0 : upgradeCost(u, level);
          const afford = save.gold >= cost;
          return (
            <div key={u.id} className="flex items-center gap-3 rounded-lg bg-white/5 p-3">
              <div className="flex-1">
                <p className="font-semibold">{u.name}</p>
                <p className="text-xs text-zinc-400">{u.description}</p>
                <div className="mt-1 flex gap-1">
                  {Array.from({ length: u.maxLevel }, (_, i) => (
                    <span key={i} className={`h-1.5 w-5 rounded-sm ${i < level ? "bg-amber-300" : "bg-white/10"}`} />
                  ))}
                </div>
              </div>
              <button
                type="button"
                disabled={maxed || !afford}
                onClick={() => {
                  engine.buyUpgrade(u.id as UpgradeId);
                  setTick((t) => t + 1);
                }}
                className="w-24 rounded-lg bg-amber-500 px-3 py-2 text-sm font-bold text-black hover:bg-amber-400 disabled:bg-white/10 disabled:text-zinc-500"
              >
                {maxed ? "Maxed" : `${cost.toLocaleString("en-US")} g`}
              </button>
            </div>
          );
        })}
      </div>
      <PanelButton primary onClick={onClose}>
        Leave the shipwright
      </PanelButton>
    </Modal>
  );
}

function BlackMarket({ engine, onClose }: { engine: WrathwaterEngine; onClose: () => void }) {
  const [, setTick] = useState(0);
  const save = engine.sim.save;
  return (
    <Modal onClose={onClose}>
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-3xl font-black uppercase tracking-wide">Black Market</h2>
        <span className="text-lg font-bold text-amber-300">{save.gold.toLocaleString("en-US")} gold</span>
      </div>
      <p className="mt-1 text-sm text-zinc-400">&ldquo;No questions asked. Got any of those strange fruits?&rdquo;</p>
      {save.heldFruits.length === 0 && <p className="mt-4 text-sm text-zinc-500">You&apos;ve nothing the dealer wants. Spare Devil Fruits sell for {FRUIT_SELL_PRICE} gold each.</p>}
      {save.heldFruits.map((f) => (
        <div key={f} className="mt-3 flex items-center justify-between rounded-lg bg-white/5 p-3">
          <span>{FRUITS[f].name}</span>
          <button
            type="button"
            onClick={() => {
              engine.sellFruit(f);
              setTick((t) => t + 1);
            }}
            className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-bold text-black hover:bg-amber-400"
          >
            Sell for {FRUIT_SELL_PRICE} g
          </button>
        </div>
      ))}
      <PanelButton primary onClick={onClose}>
        Leave
      </PanelButton>
    </Modal>
  );
}
