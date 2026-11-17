"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  KING_BOUNTY,
  UPGRADES,
  formatBerries,
  hireCost,
  flagshipCrew,
  manning,
  ESCORT_COST,
  ESCORT_CREW,
  MAX_ESCORTS,
  STRUCTURES,
  STRUCTURE_IDS,
  playerStats,
  rankFor,
  shipTier,
  shortBerries,
  upgradeCost,
  upgradeMax,
  type UpgradeId,
} from "@/game/wrathwater/data";
import type { HudState, Notice, WrathwaterEngine } from "@/game/wrathwater/engine";
import WrathwaterTouch from "./WrathwaterTouch";
import { PAD_BACK_EVENT, setPadGameplay } from "@/lib/gamepad";
import {
  FRUITS,
  FRUIT_SELL_PRICE,
  MATERIAL_NAMES,
  RECIPES,
  SHOT_RECIPE,
  WEAPONS,
  WEAPON_ORDER,
  fruitInfo,
  KILL_ORDER,
  STRETCH,
  STRETCH_MOVES,
  FOODS,
  FOOD_IDS,
  FRUIT_MOVES,
  ITEMS,
  ITEM_IDS,
  SKILLS,
  SKILL_IDS,
  SKILL_MAX,
  levelFromXp,
  skillEffects,
  type FruitId,
  type MaterialId,
} from "@/game/wrathwater/items";
import type { Quest } from "@/game/wrathwater/quests";
import { HOME_BUILDINGS, HOME_BUILDING_IDS, HOME_ISLAND } from "@/game/wrathwater/home";
import { deleteSave, loadSave, newSave, writeSave, type SaveData } from "@/game/wrathwater/save";
import { ProfileButton, ProfileModal } from "@/components/ProfilePanel";
import { storageWorks, useProfile } from "@/lib/profile";

const noSubscribe = () => () => {};
/** Whether this browser keeps saves (checked in the browser; assumed fine while rendering on the server). */
function useStorageWorks() {
  return useSyncExternalStore(noSubscribe, storageWorks, () => true);
}

type Screen = "menu" | "naming" | "playing";
type Overlay = "none" | "replaced" | "pause" | "shop" | "market" | "tavern" | "sunk" | "defeated" | "king" | "help" | "inventory" | "fruit" | "cheats" | "truename" | "general" | "quest" | "map" | "victory" | "home";

const SAVE_KEY = "ww.save.v1";

// The saved game, read from localStorage without a hydration mismatch.
// Loading a save code on the account screen fires "storage", so the menu updates right away.
const onStorage = (fn: () => void) => {
  window.addEventListener("storage", fn);
  return () => window.removeEventListener("storage", fn);
};
function useSavedRaw() {
  return useSyncExternalStore(
    onStorage,
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
      onStart={(captain, side) => {
        deleteSave();
        const s = newSave(captain);
        s.side = side;
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
  onStart: (captain: string, side: "pirate" | "marine") => void;
}) {
  const profile = useProfile();
  const keeps = useStorageWorks();
  const [name, setName] = useState("");
  const [side, setSide] = useState<"pirate" | "marine">("pirate");
  const [help, setHelp] = useState(false);
  const [account, setAccount] = useState(false);
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
      <ProfileButton onClick={() => setAccount(true)} className="absolute right-4 top-4 z-10 bg-black/60 text-zinc-200 ring-1 ring-white/15" />
      {account && (
        <div className="fixed inset-0 z-20">
          <ProfileModal onClose={() => setAccount(false)} />
        </div>
      )}
      <div className="relative z-10 mt-[38vh] flex w-full max-w-sm flex-col gap-3">
        {!keeps && (
          <p className="rounded-lg bg-red-950/80 p-3 text-center text-sm text-red-200 ring-1 ring-red-500/40">
            This browser isn&apos;t keeping your progress (a private or incognito window, or site data is blocked). Play in a normal window, or
            your voyage is lost when you close it.
          </p>
        )}
        {naming ? (
          <form
            className="flex flex-col gap-3 rounded-xl bg-black/75 p-5 ring-1 ring-white/15 backdrop-blur"
            onSubmit={(e) => {
              e.preventDefault();
              const captain = name.trim() || profile?.name || "";
              if (captain) onStart(captain.slice(0, 20), side);
            }}
          >
            <label className="font-serif text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">Name your captain</label>
            <input
              autoFocus
              value={name}
              maxLength={20}
              onChange={(e) => setName(e.target.value)}
              placeholder={profile ? profile.name : "Captain ..."}
              className="rounded-lg border border-white/15 bg-white/5 px-4 py-3 font-serif text-lg text-white outline-none focus:border-red-700"
            />
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["pirate", "🏴‍☠️ Pirate", "Raise your bounty: rob, plunder and fight the Marines."],
                  ["marine", "⚓ Marine", "Earn merit hunting pirates and bandits. Break the law and you desert."],
                ] as const
              ).map(([id, label, text]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSide(id)}
                  className={`rounded-lg p-2 text-left ring-1 ${side === id ? (id === "marine" ? "bg-sky-900/60 ring-sky-400" : "bg-red-900/60 ring-red-500") : "bg-white/5 ring-white/10 hover:bg-white/10"}`}
                >
                  <p className="font-bold text-white">{label}</p>
                  <p className="text-[11px] text-zinc-300">{text}</p>
                </button>
              ))}
            </div>
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
                disabled={!name.trim() && !profile}
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
                  {rankFor(existing.bounty, existing.side).title} · {existing.side === "marine" ? "merit" : "bounty"} {shortBerries(existing.bounty)}
                  {existing.fruit ? ` · ${fruitInfo(existing.fruit, existing.trueName).name}` : ""}
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
    ["1-9, 0 / Q", "Switch weapons"],
    ["G / H", "Throw a powder bomb / drink a healing tonic"],
  ];
  const both: [string, string][] = [
    ["R", "Use your Devil Fruit power"],
    ["T", "Switch your fruit's move"],
    ["X / N", "Smoke bomb / eat"],
    ["M", "The world map"],
    ["P", "First person / third person"],
    ["V", "Awaken your fruit (if you know its real name)"],
    ["I / Tab", "Inventory and crafting"],
    ["W W S S A D A D", "Cheat menu"],
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
        <li>Anchor near an island and press F to go ashore. Chests, buried treasure (X) and supply crates hold gold and materials. Hit a supply crate with a blade or your fists to smash it open.</li>
        <li>Towns have banks, shops and armories to rob, guarded by Marines.</li>
        <li>Craft weapons from timber, iron and gunpowder (I). Armories have weapons to steal.</li>
        <li>Devil Fruits grant a power, but fruit eaters can never swim again.</li>
        <li>Sailors swear one pirate crew keeps something strange in a chest on deck, and that their lantern doesn&apos;t burn like the others.</li>
        <li>Three town captains, the Vault Wardens, each carry a key. Rumor says they open a vault somewhere no pirate has ever reached.</li>
      </ul>
      {table("At sea", sea)}
      {table("On foot", land)}
      {table("Anywhere", both)}
      {table("Controller", [
        ["Left stick", "Walk (sprint: click it) / steer, push up or down for sails"],
        ["Right stick", "Look (click: first / third person)"],
        ["RT / LT", "Attack / aim, or fire the side you look at"],
        ["A / B", "Use (hold to rob) / go ashore or board"],
        ["X / Y", "Fruit power / switch Stretch move"],
        ["LB / RB", "Switch weapon, or fire left / right at sea"],
        ["D-pad left", "Awaken"],
        ["D-pad up / down / right", "On foot: tonic / bomb / eat (at sea: sails up / down, eat)"],
        ["Start / View", "Pause / inventory"],
      ])}
      {table("VR", [
        ["Left stick", "Walk"],
        ["At the helm", "Grab the wheel with a grip and turn it to steer (it stays where you let go). The sail levers are beside its left handles: squeeze one to flip it (or pull it toward you / push it away). Poke the PORT or STARBOARD button beside its right handles (or squeeze next to it) to fire that broadside."],
        ["Right stick", "Snap turn"],
        ["Right trigger", "Attack where your hand points, or fire the side you face"],
        ["Swing", "On foot your weapon is in your right hand: a full, fast swing (or a real punch) smashes supply crates and hits anyone in reach"],
        ["Backpack", "Reach back over your shoulder and squeeze a grip to pull out your backpack: point at a weapon, fruit or supply with your other hand and pull the trigger. Let go to put it away."],
        ["Arms", "Raise your left arm to read the map on it; your health, gold and prompts are on your right arm"],
        ["Stores", "At Blackwater Cove you walk right into the shipwright's, blacksmith's, black market and tavern: point at the board on the back wall and pull the trigger to buy. Walk back to the door to leave."],
        ["Grips", "On foot: right uses (hold to rob), left sprints · At sea: grab the wheel and levers"],
        ["A / B", "Go ashore or board / fruit power"],
        ["X / Y", "Switch Stretch move / awaken"],
        ["☰", "Pause (takes you out of VR)"],
      ])}
      <p className="mt-3 text-xs text-zinc-400">On a phone or tablet: the stick on the left moves, drag anywhere to look, and the buttons on the right do the rest.</p>
    </div>
  );
}

function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose?: () => void; wide?: boolean }) {
  // B on a controller closes the menu.
  useEffect(() => {
    if (!onClose) return;
    window.addEventListener(PAD_BACK_EVENT, onClose);
    return () => window.removeEventListener(PAD_BACK_EVENT, onClose);
  }, [onClose]);
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
  const [offer, setOffer] = useState<Quest | null>(null);
  const [hurt, setHurt] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Phones and tablets get on-screen controls (also the moment anyone touches the screen).
  const [touch, setTouch] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches);
  const [vrOk, setVrOk] = useState(false);

  useEffect(() => {
    const onTouch = () => setTouch(true);
    window.addEventListener("touchstart", onTouch, { passive: true, once: true });
    return () => window.removeEventListener("touchstart", onTouch);
  }, []);
  // Offer VR when a headset is there.
  useEffect(() => {
    navigator.xr
      ?.isSessionSupported("immersive-vr")
      .then(setVrOk)
      .catch(() => setVrOk(false));
  }, []);
  // A controller drives the menus while one is open, and the game otherwise.
  useEffect(() => {
    setPadGameplay(overlay === "none");
    // Menus can't be seen inside the headset: take it off to use them.
    if (overlay !== "none" && engine?.inVr) engine.exitVr();
  }, [overlay, engine]);
  useEffect(() => () => setPadGameplay(false), []);
  const playVr = vrOk && engine ? () => void engine.enterVr() : null;

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
          onService: (kind) => setOverlay(kind === "shipwright" ? "shop" : kind === "blacksmith" ? "inventory" : kind === "tavern" ? "tavern" : kind === "shop" ? "general" : "market"),
          onFruit: (f) => {
            setFoundFruit(f);
            setOverlay("fruit");
          },
          onInventory: () => setOverlay((o) => (o === "none" ? "inventory" : o)),
          onCheatMenu: () => setOverlay((o) => (o === "none" ? "cheats" : o)),
          onTrueName: () => setOverlay("truename"),
          onSaveReplaced: () => setOverlay("replaced"),
          onMap: () => setOverlay((o) => (o === "none" ? "map" : o)),
          onVictory: () => setOverlay("victory"),
          onHome: () => setOverlay("home"),
          onQuestOffer: (q) => {
            setOffer(q);
            setOverlay("quest");
          },
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
      {hud && <Hud hud={hud} touch={touch} onSkipTutorial={() => engine?.skipTutorial()} />}
      <canvas ref={minimapRef} className={`pointer-events-none absolute bottom-4 right-4 h-44 w-44 sm:h-52 sm:w-52 ${touch ? "hidden" : ""}`} />
      {touch && engine && hud && overlay === "none" && <WrathwaterTouch engine={engine} hud={hud} onVr={playVr} />}
      {!touch && playVr && hud && overlay === "none" && !hud.inVr && (
        <button
          type="button"
          onClick={playVr}
          className="absolute bottom-60 right-4 rounded-lg bg-black/60 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-white/25 hover:ring-white/60"
        >
          Play in VR
        </button>
      )}

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

      {hud && !hud.pointerLocked && !hud.noMouse && !touch && overlay === "none" && (
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
          <PanelButton onClick={() => engine?.toggleView()}>View: {hud?.firstPerson ? "first person" : "third person"} (P)</PanelButton>
          {playVr && (
            <PanelButton
              onClick={() => {
                setOverlay("none");
                playVr();
              }}
            >
              Play in VR
            </PanelButton>
          )}
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
      {overlay === "cheats" && engine && <CheatMenu engine={engine} onClose={resume} />}
      {overlay === "shop" && engine && <Shipwright engine={engine} onClose={resume} />}
      {overlay === "market" && engine && <BlackMarket engine={engine} onClose={resume} />}
      {overlay === "tavern" && engine && <Tavern engine={engine} onClose={resume} />}
      {overlay === "general" && engine && <GeneralStore engine={engine} onClose={resume} />}
      {overlay === "map" && engine && <WorldMap engine={engine} onClose={resume} />}
      {overlay === "home" && engine && <HomeIsland engine={engine} onClose={resume} />}
      {overlay === "victory" && engine && (
        <Modal>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.4em] text-amber-300">The Cinderwake is sunk</p>
          <h2 className="mt-2 text-center font-serif text-4xl font-black uppercase text-amber-200">The Tempest Crown</h2>
          <p className="mt-3 text-center text-zinc-300">
            Captain Cinder Mawgrave goes down with his burning ship, and from the wreck you lift his crown of blackened gold. The Tempest Reach
            answers to {engine.sim.save.side === "marine" ? "the Marines" : "you"} now. {engine.sim.save.captain}, you&apos;ve beaten Wrathwater.
          </p>
          <ul className="mt-3 space-y-0.5 text-center text-sm text-zinc-400">
            <li>
              {engine.sim.save.side === "marine" ? "Merit" : "Bounty"} {formatBerries(engine.sim.save.bounty)} · {engine.sim.save.sunk} ships sunk · {engine.sim.save.questsDone} quests done
            </li>
            <li>
              Level {levelFromXp(engine.sim.save.xp).level} · {engine.sim.save.robberies} robberies · {engine.sim.save.crew} crew
            </li>
          </ul>
          <PanelButton primary onClick={resume}>
            Keep sailing
          </PanelButton>
        </Modal>
      )}
      {overlay === "quest" && engine && offer && (
        <Modal onClose={resume}>
          <p className="text-xs font-bold uppercase tracking-widest text-amber-300">A job for you</p>
          <h2 className="font-serif text-3xl font-black">{offer.title}</h2>
          <p className="mt-2 text-sm text-zinc-300">{offer.text}</p>
          <p className="mt-2 text-sm font-semibold text-amber-300">
            Reward: {offer.gold.toLocaleString("en-US")} gold and {offer.xp} XP
          </p>
          <div className="flex gap-2">
            <PanelButton
              primary
              onClick={() => {
                engine.acceptQuest(offer);
                resume();
              }}
            >
              Take the job
            </PanelButton>
            <PanelButton onClick={resume}>Not now</PanelButton>
          </div>
        </Modal>
      )}
      {overlay === "truename" && engine && <TrueName engine={engine} onClose={resume} />}
      {overlay === "replaced" && (
        <Modal>
          <h2 className="font-serif text-3xl font-black uppercase tracking-wide">Progress loaded elsewhere</h2>
          <p className="mt-2 text-sm text-zinc-300">
            Your progress was replaced in another tab or window (a save code was loaded there). This game has stopped saving so it can&apos;t
            overwrite it. Reload to play the progress you loaded.
          </p>
          <PanelButton primary onClick={() => window.location.reload()}>
            Reload
          </PanelButton>
        </Modal>
      )}
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
          <p className="text-center text-xs font-semibold uppercase tracking-[0.4em] text-amber-300">
            {hud.side === "marine" ? "Merit" : "Bounty"} {formatBerries(hud.bounty)}
          </p>
          <h2 className="mt-2 text-center font-serif text-4xl font-black uppercase text-amber-200">
            {hud.side === "marine" ? "Fleet Admiral of Wrathwater" : "King of Wrathwater"}
          </h2>
          <p className="mt-3 text-center text-zinc-300">
            {hud.side === "marine"
              ? `Fleet Admiral ${hud.captain}, the whole Marine fleet answers to you now. Keep sailing; there are always more pirates.`
              : `Captain ${hud.captain}, no pirate has ever been worth more. Every sea is yours. Keep sailing; the Marines will never stop coming.`}
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

function Hud({ hud, touch, onSkipTutorial }: { hud: HudState; touch: boolean; onSkipTutorial: () => void }) {
  const nextFrac = hud.nextRank ? Math.min(1, hud.bounty / hud.nextRank.bounty) : 1;
  return (
    <>
      <Compass hud={hud} />
      {hud.boss && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-10 w-[min(90vw,34rem)] -translate-x-1/2 text-center">
          <p className="font-serif text-sm font-bold uppercase tracking-widest text-red-300 drop-shadow">{hud.boss.name}</p>
          <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-black/60 ring-1 ring-red-500/60">
            <div className="h-3 rounded-full bg-gradient-to-r from-red-700 to-orange-500" style={{ width: `${(hud.boss.hp / hud.boss.max) * 100}%` }} />
          </div>
        </div>
      )}
      {hud.tutorial && (
        <div className="pointer-events-auto absolute left-1/2 top-16 z-10 w-[min(92vw,30rem)] -translate-x-1/2 rounded-xl bg-black/75 p-3 ring-1 ring-amber-400/40 backdrop-blur">
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
              Tutorial · {Math.min(hud.tutorial.step + 1, hud.tutorial.total)} of {hud.tutorial.total}
            </p>
            <button type="button" onClick={onSkipTutorial} className="text-xs text-zinc-400 hover:text-white">
              Skip tutorial
            </button>
          </div>
          <p className="mt-1 text-sm font-semibold text-white">{hud.tutorial.text}</p>
          <div className="mt-2 h-1 w-full rounded-full bg-white/10">
            <div className="h-1 rounded-full bg-amber-400" style={{ width: `${(Math.min(hud.tutorial.step, hud.tutorial.total) / hud.tutorial.total) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Wanted poster */}
      <div className={`pointer-events-none absolute left-4 top-4 w-56 ${touch ? "origin-top-left scale-[0.6]" : ""} rotate-[-1.5deg] rounded-sm bg-[#e9dcc0] bg-[radial-gradient(ellipse_at_center,#efe3c8,#d8c39a)] px-4 py-3 text-center text-[#2b1d10] shadow-2xl ring-1 ring-black/40`}>
        <p className="font-serif text-3xl font-black tracking-[0.15em]">{hud.side === "marine" ? "MARINE" : "WANTED"}</p>
        <p className="-mt-1 font-serif text-[10px] font-bold tracking-[0.3em]">{hud.side === "marine" ? "SERVICE RECORD · MERIT" : "DEAD OR ALIVE"}</p>
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
        <div className="ml-auto mt-2 w-44">
          <p className="text-xs font-bold uppercase tracking-widest text-sky-300 drop-shadow">
            Level {hud.level.level}
            {hud.level.points > 0 && <span className="ml-1 animate-pulse text-amber-300">· {hud.level.points} skill point{hud.level.points === 1 ? "" : "s"} (I)</span>}
          </p>
          <div className="mt-1 h-1.5 w-full rounded-full bg-white/10">
            <div className="h-1.5 rounded-full bg-sky-400" style={{ width: `${Math.min(1, hud.level.into / hud.level.need) * 100}%` }} />
          </div>
        </div>
        {hud.status.length > 0 && (
          <div className="mt-2 flex flex-wrap justify-end gap-1">
            {hud.status.map((s) => (
              <span key={s.text} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${s.tone === "bad" ? "bg-red-900/80 text-red-200" : "bg-emerald-900/80 text-emerald-200"}`}>
                {s.text}
              </span>
            ))}
          </div>
        )}
        {hud.quest && (
          <div className="ml-auto mt-2 w-56 rounded-lg bg-black/60 p-2 text-left ring-1 ring-amber-400/30 backdrop-blur">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300">Quest</p>
            <p className="text-sm font-semibold text-white">{hud.quest.title}</p>
            <p className="text-xs text-zinc-400">
              {hud.quest.progress}/{hud.quest.count}
            </p>
          </div>
        )}
      </div>

      {hud.mode === "ship" ? <ShipPanel hud={hud} touch={touch} /> : <FootPanel hud={hud} touch={touch} />}
      {hud.fruit && !touch && <PowerBadge fruit={hud.fruit} />}
      {hud.awaken && !touch && <AwakenBadge awaken={hud.awaken} />}
      {hud.status.some((s) => s.text === "Food poisoning") && (
        <div className="pointer-events-none absolute inset-0 animate-pulse shadow-[inset_0_0_140px_50px_rgba(101,163,13,0.45)]" />
      )}
      {hud.awaken && hud.awaken.active > 0 && (
        <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_40px_rgba(127,29,29,0.55)]" />
      )}

      <Prompt hud={hud} />
      {hud.nearStorm && (
        <div className="pointer-events-none absolute bottom-44 left-1/2 -translate-x-1/2 rounded-xl bg-red-950/80 px-5 py-2 text-sm font-semibold text-red-200">
          The storm wall drives you back. Wrathwater ends here.
        </div>
      )}
      {hud.stormwall && (
        <div className={`pointer-events-none absolute bottom-44 left-1/2 -translate-x-1/2 rounded-xl px-5 py-2 text-sm font-semibold ${hud.stormwall === "danger" ? "animate-pulse bg-red-950/85 text-red-200" : "bg-slate-900/85 text-slate-200"}`}>
          {hud.stormwall === "danger"
            ? "The Stormwall is tearing your sloop apart! Turn back, or push through fast. Only a Brigantine or bigger rides it out."
            : "Riding out the Stormwall. Beyond it lies the Tempest Reach."}
        </div>
      )}
      {((hud.mode === "ship" && hud.aimSide !== null && !hud.inHaven) || (hud.mode === "foot" && (hud.pointerLocked || hud.noMouse || touch))) && (
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

function ShipPanel({ hud, touch }: { hud: HudState; touch: boolean }) {
  const hpFrac = hud.maxHp ? hud.hp / hud.maxHp : 0;
  return (
    <div className={`pointer-events-none absolute bottom-4 left-4 w-64 rounded-xl bg-black/60 p-3 ring-1 ring-white/10 backdrop-blur ${touch ? "origin-bottom-left scale-75" : ""}`}>
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
      <Needs hud={hud} />
      <div className="mt-2 flex items-baseline justify-between text-[10px] uppercase tracking-widest text-zinc-400">
        <span>{hud.ship.name}</span>
        <span className={hud.ship.short ? "font-bold text-red-400" : "text-zinc-300"}>
          {hud.ship.short ? "Short-handed · " : ""}
          {hud.ship.people}/{hud.ship.full} aboard
          {hud.fleet.owned > 0 && ` · ${hud.fleet.escorts}/${hud.fleet.owned} escorts`}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] uppercase tracking-widest text-zinc-400">
        <ReloadBar label="Port (Q)" frac={hud.reload.port} active={hud.aimSide === -1} />
        <ReloadBar label="Starboard (E)" frac={hud.reload.starboard} active={hud.aimSide === 1} />
      </div>
    </div>
  );
}

function FootPanel({ hud, touch }: { hud: HudState; touch: boolean }) {
  const hpFrac = hud.heroMaxHp ? hud.heroHp / hud.heroMaxHp : 0;
  return (
    <div className={`pointer-events-none absolute bottom-4 left-4 w-64 rounded-xl bg-black/60 p-3 ring-1 ring-white/10 backdrop-blur ${touch ? "origin-bottom-left scale-75" : ""}`}>
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
      <Needs hud={hud} />
      <p className="mt-2 text-[10px] uppercase tracking-widest text-zinc-500">Ship hull {hud.hp} / {hud.maxHp}</p>
    </div>
  );
}

/** Hunger, and what you're carrying: bombs (G), tonics (H), smoke (X) and food (N). */
function Needs({ hud }: { hud: HudState }) {
  const h = hud.hunger;
  return (
    <>
      <div className="mt-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-400">
        <span>Food</span>
        <span className={`text-xs font-bold ${h < 20 ? "text-red-400" : "text-zinc-300"}`}>{h <= 0 ? "Starving" : h < 20 ? "Hungry" : `${h}%`}</span>
      </div>
      <Bar frac={h / 100} color={h < 20 ? "bg-red-500" : "bg-orange-400"} />
      <div className="mt-2 flex justify-between text-[11px] text-zinc-300">
        <span title="Powder bombs (G)">💣 {hud.items.bomb}</span>
        <span title="Healing tonics (H)">🧪 {hud.items.tonic}</span>
        <span title="Smoke bombs (X)">💨 {hud.items.smoke}</span>
        <span title="Food (N to eat)" className={hud.food.spoiled ? "text-lime-300" : ""}>
          🍞 {hud.food.count}
          {hud.food.spoiled > 0 && ` (${hud.food.spoiled} off)`}
        </span>
      </div>
    </>
  );
}

function PowerBadge({ fruit }: { fruit: NonNullable<HudState["fruit"]> }) {
  const def = fruit.id === "gomu" && fruit.name === KILL_ORDER.name ? { ...FRUITS.gomu, ...KILL_ORDER } : FRUITS[fruit.id];
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
        <p className={`text-sm font-bold ${ready ? "text-white" : "text-zinc-500"}`}>
          {fruit.power}
          {fruit.bouncing && <span className="ml-2 text-xs text-fuchsia-300">BOUNCING</span>}
        </p>
        {fruit.moves && (
          <div className="mt-1 flex items-center gap-1">
            <span className="mr-1 rounded bg-white/10 px-1 font-mono text-[10px] text-zinc-300">T</span>
            {fruit.moves.map((m) => (
              <span
                key={m.name}
                title={m.name}
                className={`relative overflow-hidden rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  m.selected ? "bg-white/25 text-white ring-1 ring-white/60" : "bg-white/5 text-zinc-400"
                }`}
              >
                <span className="absolute inset-y-0 left-0 opacity-40" style={{ width: `${m.ready * 100}%`, background: def.color }} />
                <span className="relative">{m.name.split(" ")[0]}</span>
              </span>
            ))}
          </div>
        )}
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
    if (hud.boardable) {
      key = "F";
      label = `Board and loot the ${hud.boardable}`;
    } else if (hud.landing) {
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

// ---------------------------------------------------------------- the cheat menu (W W S S A D A D)

function CheatMenu({ engine, onClose }: { engine: WrathwaterEngine; onClose: () => void }) {
  const [god, setGod] = useState(engine.godMode);
  const cheat = (run: () => void) => () => run();
  return (
    <Modal wide onClose={onClose}>
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-3xl font-black uppercase tracking-wide">Cheats</h2>
        <span className="text-sm text-zinc-400">W W S S A D A D</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <PanelButton onClick={cheat(() => engine.cheatSupplies())}>💰 +1,000 gold, +50 shot, +20 materials</PanelButton>
        <PanelButton onClick={cheat(() => engine.cheatArmory())}>⚔️ Every weapon and every fruit</PanelButton>
        <PanelButton onClick={cheat(() => engine.cheatClearWanted())}>⭐ Clear wanted stars</PanelButton>
        <PanelButton onClick={cheat(() => engine.cheatBounty())}>🏴 +50,000,000 bounty</PanelButton>
        <PanelButton onClick={cheat(() => engine.cheatShip())}>⛵ Max ship upgrades and repair</PanelButton>
        <PanelButton onClick={cheat(() => engine.cheatBiggerShip())}>🚢 Next ship size, with a full crew</PanelButton>
        <PanelButton onClick={cheat(() => engine.cheatBoss())}>🔥 Sail to Cinder Mawgrave</PanelButton>
        <PanelButton onClick={cheat(() => engine.cheatMaxLevel(false))}>⬆️ Max level, with every skill point to spend</PanelButton>
        <PanelButton onClick={cheat(() => engine.cheatMaxLevel(true))}>💪 Max level and every skill maxed</PanelButton>
        <PanelButton onClick={cheat(() => engine.cheatVaultKeys())}>🗝️ All 3 Vault Warden keys</PanelButton>
        <PanelButton onClick={() => engine.cheatTrueName()}>📜 Learn the fruit&apos;s real name</PanelButton>
        <PanelButton primary={god} onClick={() => setGod(engine.cheatGod())}>
          🛡️ God mode: {god ? "ON" : "off"}
        </PanelButton>
      </div>
      <h3 className="mt-5 text-xs font-bold uppercase tracking-widest text-red-300">Sail straight to</h3>
      <div className="mt-1 grid grid-cols-2 gap-x-2 sm:grid-cols-3">
        {engine.islandList.map((isl) => (
          <PanelButton
            key={isl.index}
            onClick={() => {
              engine.cheatTravel(isl.index);
              onClose();
            }}
          >
            {isl.kind === "haven" ? "🏝️" : isl.kind === "town" ? "🏘️" : isl.kind === "mystery" ? "❓" : isl.kind === "fortress" ? "🏰" : "🌴"} {isl.name}
          </PanelButton>
        ))}
      </div>
      <PanelButton primary onClick={onClose}>
        Back to the game
      </PanelButton>
    </Modal>
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
      <CaptainSection engine={engine} refresh={refresh} />
      <ItemsSection engine={engine} refresh={refresh} />

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
                  <span className="font-mono text-xs text-zinc-500">{(i + 1) % 10}</span>
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
          <FruitCard fruit={save.fruit} trueName={save.trueName} note="Eaten. Press R to use its power. You can never swim." />
        ) : (
          <p className="mt-1 text-sm text-zinc-400">You haven&apos;t eaten one. They hide in treasure, and one waits on Kraken&apos;s Tooth.</p>
        )}
        {save.heldFruits.map((f) => (
          <div key={f} className="mt-2">
            <FruitCard fruit={f} trueName={save.trueName} note="Carried, not eaten." />
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

/** You: your level, skills to train, and the quest you're on. */
function CaptainSection({ engine, refresh }: { engine: WrathwaterEngine; refresh: () => void }) {
  const save = engine.sim.save;
  const lvl = levelFromXp(save.xp);
  const points = engine.skillPoints;
  return (
    <section className="mt-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest text-sky-300">
          You · level {lvl.level} · max health {skillEffects(save.skills).maxHp}
        </h3>
        <span className="text-xs text-zinc-400">
          {lvl.into}/{lvl.need} XP to the next level{points > 0 && <span className="font-bold text-amber-300"> · {points} point{points === 1 ? "" : "s"} to spend</span>}
        </span>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-5">
        {SKILL_IDS.map((k) => (
          <div key={k} className="flex flex-col rounded-lg bg-white/5 p-2 text-center">
            <p className="text-sm font-semibold">{SKILLS[k].name}</p>
            <p className="text-[11px] text-zinc-400">{SKILLS[k].per}</p>
            <p className="mt-1 text-lg font-black">
              {save.skills[k]}
              <span className="text-xs text-zinc-500">/{SKILL_MAX}</span>
            </p>
            <button
              type="button"
              disabled={points <= 0 || save.skills[k] >= SKILL_MAX}
              onClick={() => {
                engine.trainSkill(k);
                refresh();
              }}
              className="mt-auto rounded-md bg-sky-700 py-1 text-xs font-semibold text-white hover:bg-sky-600 disabled:bg-white/5 disabled:text-zinc-500"
            >
              Train
            </button>
          </div>
        ))}
      </div>
      {save.quest && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-amber-400/10 p-2 ring-1 ring-amber-400/30">
          <p className="text-sm">
            <span className="font-semibold text-amber-300">Quest:</span> {save.quest.title} ({save.quest.progress}/{save.quest.count}) · {save.quest.gold} gold, {save.quest.xp} XP
          </p>
          <button
            type="button"
            onClick={() => {
              engine.abandonQuest();
              refresh();
            }}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-zinc-400 hover:text-red-300"
          >
            Give up
          </button>
        </div>
      )}
    </section>
  );
}

/** Bombs, tonics, smoke bombs, and your food (it spoils). */
function ItemsSection({ engine, refresh }: { engine: WrathwaterEngine; refresh: () => void }) {
  const save = engine.sim.save;
  const now = save.playTime;
  return (
    <section className="mt-4">
      <h3 className="text-xs font-bold uppercase tracking-widest text-red-300">Items</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {ITEM_IDS.map((id) => {
          const it = ITEMS[id];
          return (
            <div key={id} className="flex flex-col rounded-lg bg-white/5 p-2">
              <div className="flex items-baseline justify-between">
                <p className="font-semibold">{it.name}</p>
                <span className="text-lg font-black">{save.items[id]}</span>
              </div>
              <p className="text-[11px] text-zinc-400">
                {it.description} Key: {it.key}.
              </p>
              <div className="mt-auto flex gap-1 pt-2">
                <button
                  type="button"
                  disabled={save.items[id] <= 0}
                  onClick={() => {
                    engine.useItem(id);
                    refresh();
                  }}
                  className="flex-1 rounded-md bg-white/10 py-1 text-xs font-semibold hover:bg-white/20 disabled:opacity-40"
                >
                  Use
                </button>
                {it.recipe && (
                  <button
                    type="button"
                    disabled={!engine.canMakeItem(id)}
                    onClick={() => {
                      engine.makeItem(id);
                      refresh();
                    }}
                    className="flex-1 rounded-md bg-red-800 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:bg-white/5 disabled:text-zinc-500"
                  >
                    Make: {Object.entries(it.recipe).map(([m, n]) => `${n} ${MATERIAL_NAMES[m as MaterialId].toLowerCase()}`).join(", ")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest text-orange-300">Food · {Math.round(save.hunger)}% full</h3>
        <span className="text-xs text-zinc-500">Food goes off: spoiled food can make you sick. N eats the best you have.</span>
      </div>
      {save.food.length === 0 ? (
        <p className="mt-1 text-sm text-zinc-400">No food. Buy some at a town&apos;s shop or the Blackwater Cove tavern.</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {save.food.map((f, i) => {
            const left = f.spoils - now;
            const off = left <= 0;
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  engine.eatFood(i);
                  refresh();
                }}
                className={`rounded-lg px-2 py-1 text-left text-xs ring-1 hover:bg-white/10 ${off ? "bg-lime-900/40 text-lime-200 ring-lime-500/40" : "bg-white/5 ring-white/10"}`}
                title="Eat it"
              >
                <span className="font-semibold">{FOODS[f.food].name}</span>
                <span className="block text-[10px] text-zinc-400">{off ? "Spoiled!" : `Good for ${Math.ceil(left / 60)} min`}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** A town's shop: food for the voyage, tonics and bombs. */
function GeneralStore({ engine, onClose }: { engine: WrathwaterEngine; onClose: () => void }) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const save = engine.sim.save;
  return (
    <Modal wide onClose={onClose}>
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-3xl font-black uppercase tracking-wide">General Store</h2>
        <span className="text-lg font-bold text-amber-300">{save.gold.toLocaleString("en-US")} gold</span>
      </div>
      <p className="mt-1 text-sm text-zinc-400">&ldquo;Provisions for the voyage. Eat it while it&apos;s fresh!&rdquo; You&apos;re {Math.round(save.hunger)}% full.</p>
      <FoodShop engine={engine} refresh={refresh} />
      <h3 className="mt-4 text-xs font-bold uppercase tracking-widest text-red-300">Supplies</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {ITEM_IDS.map((id) => (
          <button
            key={id}
            type="button"
            disabled={save.gold < ITEMS[id].price}
            onClick={() => {
              engine.buyItem(id);
              refresh();
            }}
            className="rounded-lg bg-white/5 p-2 text-left ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-40"
          >
            <p className="font-semibold">
              {ITEMS[id].name} <span className="text-xs text-zinc-400">(have {save.items[id]})</span>
            </p>
            <p className="text-[11px] text-zinc-400">{ITEMS[id].description}</p>
            <p className="mt-1 text-sm font-bold text-amber-300">{ITEMS[id].price} g</p>
          </button>
        ))}
      </div>
      <PanelButton primary onClick={onClose}>
        Leave the store
      </PanelButton>
    </Modal>
  );
}

/** Food for sale, one or five at a time. */
function FoodShop({ engine, refresh }: { engine: WrathwaterEngine; refresh: () => void }) {
  const save = engine.sim.save;
  return (
    <>
      <h3 className="mt-4 text-xs font-bold uppercase tracking-widest text-orange-300">Food</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-4">
        {FOOD_IDS.map((id) => {
          const f = FOODS[id];
          return (
            <div key={id} className="rounded-lg bg-white/5 p-2 ring-1 ring-white/10">
              <p className="font-semibold">{f.name}</p>
              <p className="text-[11px] text-zinc-400">
                Fills {f.fill}% · fresh for {f.fresh} min
              </p>
              <div className="mt-2 flex gap-1">
                {[1, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={save.gold < f.price * n}
                    onClick={() => {
                      engine.buyFood(id, n);
                      refresh();
                    }}
                    className="flex-1 rounded-md bg-amber-500 py-1 text-xs font-bold text-black hover:bg-amber-400 disabled:bg-white/10 disabled:text-zinc-500"
                  >
                    ×{n} · {f.price * n}g
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function FruitCard({ fruit, note, trueName = false }: { fruit: FruitId; note: string; trueName?: boolean }) {
  const def = fruitInfo(fruit, trueName);
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
        {fruit === "gomu" && (
          <ul className="mt-1 space-y-0.5 text-xs text-zinc-300">
            {STRETCH_MOVES.map((m) => (
              <li key={m}>
                <span className="font-semibold text-amber-200">{STRETCH[m].name}:</span> {STRETCH[m].foot} At sea: {STRETCH[m].sea}
                {trueName && <span className="text-red-400"> Awakened: {STRETCH[m].awakened}</span>}
              </li>
            ))}
          </ul>
        )}
        {fruit !== "gomu" && (
          <ul className="mt-1 space-y-0.5 text-xs text-zinc-300">
            {FRUIT_MOVES[fruit].map((m) => (
              <li key={m.id}>
                <span className="font-semibold text-amber-200">{m.name}:</span> {m.foot} At sea: {m.sea}
              </li>
            ))}
          </ul>
        )}
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
      <FruitCard fruit={fruit} trueName={engine.sim.save.trueName} note="It tastes terrible, they say. And whoever eats one can never swim again." />
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

// ---------------------------------------------------------------- the vault's secret

function TrueName({ engine, onClose }: { engine: WrathwaterEngine; onClose: () => void }) {
  const save = engine.sim.save;
  const eaten = save.fruit === "gomu";
  return (
    <Modal>
      <p className="text-center text-xs font-bold uppercase tracking-[0.4em] text-red-400">The vault is open</p>
      <p className="mt-3 text-center text-sm text-zinc-300">
        Under the gold lies one sealed Marine file, stamped TOP SECRET. Inside: everything they know about the Stretch Fruit.
        &ldquo;Stretch&rdquo; was only ever a cover name.
      </p>
      <h2 className="mt-4 text-center font-serif text-4xl font-black uppercase tracking-wide text-red-500 drop-shadow-[0_0_18px_rgba(220,38,38,0.6)]">
        The Kill Order Fruit
      </h2>
      <p className="mt-1 text-center text-xs uppercase tracking-widest text-zinc-500">Real name, as written in the file</p>
      <FruitCard fruit="gomu" trueName note={eaten ? "You already ate it. Its true power is yours: press V." : "Eat it to wield the awakening (V)."} />
      <p className="mt-3 text-center text-sm text-amber-300">
        Every Marine in Wrathwater now wants you dead. Bounty +{formatBerries(500_000_000)}.
      </p>
      <PanelButton primary onClick={onClose}>
        Escape the fortress
      </PanelButton>
    </Modal>
  );
}

function AwakenBadge({ awaken }: { awaken: NonNullable<HudState["awaken"]> }) {
  const on = awaken.active > 0;
  const ready = !on && awaken.ready >= 0.999;
  const fill = on ? awaken.active : awaken.ready;
  return (
    <div className="pointer-events-none absolute bottom-20 left-72 flex items-center gap-3 rounded-xl bg-black/70 p-2 pr-4 ring-1 ring-red-900/60 backdrop-blur">
      <div
        className="relative h-10 w-10 rounded-full"
        style={{ background: `conic-gradient(${on ? "#ef4444" : "#7f1d1d"} ${fill * 360}deg, rgba(255,255,255,0.08) 0deg)` }}
      >
        <div className={`absolute inset-1 flex items-center justify-center rounded-full bg-black font-mono text-sm font-bold ${ready || on ? "text-red-400" : "text-zinc-600"}`}>V</div>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-widest text-red-400/80">{KILL_ORDER.awakened}</p>
        <p className={`text-sm font-bold ${on ? "text-red-400" : ready ? "text-white" : "text-zinc-500"}`}>
          {on ? "AWAKENED" : ready ? "Ready" : "Resting..."}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- shipwright

function Shipwright({ engine, onClose }: { engine: WrathwaterEngine; onClose: () => void }) {
  const [, setTick] = useState(0);
  const save = engine.sim.save;
  const stats = playerStats(save);
  const tier = shipTier(save.shipTier);
  const next = engine.nextShip;
  const maxedAll = engine.shipMaxed;
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
          const max = upgradeMax(u, save.shipTier);
          const maxed = level >= max;
          const cost = maxed ? 0 : upgradeCost(u, level);
          const afford = save.gold >= cost;
          return (
            <div key={u.id} className="flex items-center gap-3 rounded-lg bg-white/5 p-3">
              <div className="flex-1">
                <p className="font-semibold">{u.name}</p>
                <p className="text-xs text-zinc-400">{u.description}</p>
                <div className="mt-1 flex gap-1">
                  {Array.from({ length: max }, (_, i) => (
                    <span key={i} className={`h-1.5 w-3.5 rounded-sm ${i < level ? "bg-amber-300" : "bg-white/10"}`} />
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
      <div className="mt-4 rounded-lg bg-amber-500/10 p-3 ring-1 ring-amber-400/30">
        <p className="text-xs uppercase tracking-widest text-amber-300">Your ship: {tier.name} (size {tier.tier} of 4)</p>
        {next ? (
          <div className="mt-2 flex items-center gap-3">
            <div className="flex-1 text-sm">
              <p className="font-semibold">Build a {next.name}</p>
              <p className="text-xs text-zinc-400">
                Bigger and tougher, more guns, and every upgrade can go two levels higher. Needs {next.crewMin} to {next.crewFull} aboard (you count): hire crew at the
                tavern.
                {!maxedAll && " Max every upgrade first."}
              </p>
            </div>
            <button
              type="button"
              disabled={!engine.canBuyShip()}
              onClick={() => {
                engine.buyShip();
                setTick((t) => t + 1);
              }}
              className="w-28 rounded-lg bg-amber-500 px-3 py-2 text-sm font-bold text-black hover:bg-amber-400 disabled:bg-white/10 disabled:text-zinc-500"
            >
              {next.cost.toLocaleString("en-US")} g
            </button>
          </div>
        ) : (
          <p className="mt-1 text-sm text-zinc-300">The biggest ship on the sea. Nothing left to build.</p>
        )}
      </div>
      <DeckAndFleet engine={engine} refresh={() => setTick((t) => t + 1)} />
      <PanelButton primary onClick={onClose}>
        Leave the shipwright
      </PanelButton>
    </Modal>
  );
}

/** Your island: build, collect what it's made, and keep gold in the vault. */
function HomeIsland({ engine, onClose }: { engine: WrathwaterEngine; onClose: () => void }) {
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const save = engine.sim.save;
  const h = save.home;
  const st = h.stock;
  return (
    <Modal wide onClose={onClose}>
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-3xl font-black uppercase tracking-wide">{HOME_ISLAND.name}</h2>
        <span className="text-lg font-bold text-amber-300">{save.gold.toLocaleString("en-US")} gold</span>
      </div>
      <p className="mt-1 text-sm text-zinc-400">Your own island. What you build works while you&apos;re away.</p>
      <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-emerald-500/10 p-3 ring-1 ring-emerald-400/30">
        <p className="text-sm">
          Waiting to collect: {Math.floor(st.food)} food · {Math.floor(st.iron)} iron · {Math.floor(st.powder)} gunpowder · {Math.floor(st.wood)} timber
        </p>
        <button
          type="button"
          onClick={() => {
            engine.collectHome();
            refresh();
          }}
          className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-bold text-black hover:bg-emerald-400"
        >
          Collect
        </button>
      </div>
      {h.built.includes("vault") && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-500/10 p-3 ring-1 ring-amber-400/30">
          <p className="flex-1 text-sm">
            Vault: <span className="font-bold text-amber-300">{h.vault.toLocaleString("en-US")} gold</span> (safe when your ship sinks)
          </p>
          {[1000, Infinity].map((n) => (
            <button
              key={`in${n}`}
              type="button"
              disabled={save.gold <= 0}
              onClick={() => {
                engine.vaultMove(n);
                refresh();
              }}
              className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold hover:bg-white/20 disabled:opacity-40"
            >
              Store {n === Infinity ? "all" : n.toLocaleString("en-US")}
            </button>
          ))}
          {[1000, Infinity].map((n) => (
            <button
              key={`out${n}`}
              type="button"
              disabled={h.vault <= 0}
              onClick={() => {
                engine.vaultMove(-n);
                refresh();
              }}
              className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold hover:bg-white/20 disabled:opacity-40"
            >
              Take {n === Infinity ? "all" : n.toLocaleString("en-US")}
            </button>
          ))}
        </div>
      )}
      <h3 className="mt-4 text-xs font-bold uppercase tracking-widest text-red-300">Build</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {HOME_BUILDING_IDS.map((id) => {
          const b = HOME_BUILDINGS[id];
          const has = h.built.includes(id);
          return (
            <div key={id} className={`flex items-center gap-2 rounded-lg p-2 ring-1 ${has ? "bg-emerald-900/30 ring-emerald-500/40" : "bg-white/5 ring-white/10"}`}>
              <div className="flex-1">
                <p className="text-sm font-semibold">{b.name}</p>
                <p className="text-[11px] text-zinc-400">{b.effect}</p>
              </div>
              {has ? (
                <span className="w-24 text-center text-xs font-bold text-emerald-300">Built</span>
              ) : (
                <button
                  type="button"
                  disabled={!engine.canBuildHome(id)}
                  onClick={() => {
                    engine.buildHome(id);
                    refresh();
                  }}
                  className="w-24 rounded-md bg-amber-500 px-2 py-1 text-xs font-bold text-black hover:bg-amber-400 disabled:bg-white/10 disabled:text-zinc-500"
                >
                  {b.cost.toLocaleString("en-US")} g
                </button>
              )}
            </div>
          );
        })}
      </div>
      <PanelButton primary onClick={onClose}>
        Done
      </PanelButton>
    </Modal>
  );
}

/** The whole sea, drawn by the engine onto a canvas. */
function WorldMap({ engine, onClose }: { engine: WrathwaterEngine; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) engine.drawWorldMap(ref.current);
  }, [engine]);
  return (
    <Modal wide onClose={onClose}>
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-3xl font-black uppercase tracking-wide">Chart of Wrathwater</h2>
        <span className="text-xs text-zinc-400">Esc closes · gold ring: your quest</span>
      </div>
      <canvas ref={ref} width={1100} height={720} className="mt-3 w-full rounded-lg" />
      <PanelButton primary onClick={onClose}>
        Close the chart
      </PanelButton>
    </Modal>
  );
}

/** Things to build on your deck, and escort ships for your fleet. */
function DeckAndFleet({ engine, refresh }: { engine: WrathwaterEngine; refresh: () => void }) {
  const save = engine.sim.save;
  const slots = engine.deckSlots;
  return (
    <>
      <div className="mt-4 flex items-baseline justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest text-red-300">Build on your deck</h3>
        <span className="text-xs text-zinc-400">
          {slots.used}/{slots.total} deck slots used (bigger ships have more)
        </span>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {STRUCTURE_IDS.map((id) => {
          const st = STRUCTURES[id];
          const has = save.structures.includes(id);
          return (
            <div key={id} className={`flex items-center gap-2 rounded-lg p-2 ring-1 ${has ? "bg-emerald-900/30 ring-emerald-500/40" : "bg-white/5 ring-white/10"}`}>
              <div className="flex-1">
                <p className="text-sm font-semibold">{st.name}</p>
                <p className="text-[11px] text-zinc-400">{st.effect}</p>
              </div>
              {has ? (
                <button
                  type="button"
                  onClick={() => {
                    engine.scrapStructure(id);
                    refresh();
                  }}
                  className="w-24 rounded-md px-2 py-1 text-xs text-zinc-400 ring-1 ring-white/15 hover:text-red-300"
                >
                  Take down (+{Math.round(st.cost / 2)}g)
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!engine.canBuild(id)}
                  onClick={() => {
                    engine.buildStructure(id);
                    refresh();
                  }}
                  className="w-24 rounded-md bg-amber-500 px-2 py-1 text-xs font-bold text-black hover:bg-amber-400 disabled:bg-white/10 disabled:text-zinc-500"
                >
                  {st.cost.toLocaleString("en-US")} g
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-3 rounded-lg bg-sky-500/10 p-3 ring-1 ring-sky-400/30">
        <div className="flex-1 text-sm">
          <p className="font-semibold">
            Escort brigs: {save.escorts}/{MAX_ESCORTS}
          </p>
          <p className="text-xs text-zinc-400">
            They sail behind you and fight your enemies. Each holds {ESCORT_CREW} more crew and needs 2 aboard to sail. There&apos;s no limit on crew, but a
            bigger crew needs more ships to carry it.
          </p>
        </div>
        <button
          type="button"
          disabled={!engine.canBuyEscort()}
          onClick={() => {
            engine.buyEscort();
            refresh();
          }}
          className="w-28 rounded-lg bg-sky-500 px-3 py-2 text-sm font-bold text-black hover:bg-sky-400 disabled:bg-white/10 disabled:text-zinc-500"
        >
          {ESCORT_COST.toLocaleString("en-US")} g
        </button>
      </div>
    </>
  );
}

/** Blackwater Cove's tavern: sailors looking for a ship. */
function Tavern({ engine, onClose }: { engine: WrathwaterEngine; onClose: () => void }) {
  const [, setTick] = useState(0);
  const save = engine.sim.save;
  const tier = shipTier(save.shipTier);
  const m = manning(save.shipTier, flagshipCrew(save.shipTier, save.crew));
  const cost = hireCost(save.shipTier);
  const room = engine.crewRoom - save.crew;
  const hire = (n: number) => {
    engine.hireCrew(n);
    setTick((t) => t + 1);
  };
  return (
    <Modal onClose={onClose}>
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-3xl font-black uppercase tracking-wide">The Rusty Anchor</h2>
        <span className="text-lg font-bold text-amber-300">{save.gold.toLocaleString("en-US")} gold</span>
      </div>
      <p className="mt-1 text-sm text-zinc-400">&ldquo;Plenty of hands here looking for a ship, Captain.&rdquo;</p>
      <p className={`mt-3 text-sm ${m.short ? "text-red-300" : "text-emerald-300"}`}>
        Your {tier.name} has {m.people} aboard (you count). She needs {tier.crewMin} to sail well and is at her best with {tier.crewFull}.
        {m.short && " She's short-handed: slow, and slow to reload."}
      </p>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={room <= 0 || save.gold < cost}
          onClick={() => hire(1)}
          className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-sm font-bold text-black hover:bg-amber-400 disabled:bg-white/10 disabled:text-zinc-500"
        >
          Hire a sailor · {cost} g
        </button>
        <button
          type="button"
          disabled={room <= 0 || save.gold < cost * room}
          onClick={() => hire(room)}
          className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-sm font-bold text-black hover:bg-amber-400 disabled:bg-white/10 disabled:text-zinc-500"
        >
          {room > 0 ? `Hire a full crew (${room}) · ${(cost * room).toLocaleString("en-US")} g` : "Full crew aboard"}
        </button>
      </div>
      {room <= 0 && tier.tier < 4 && <p className="mt-2 text-xs text-zinc-500">No room for more: buy an escort brig at the shipwright (each holds 8 more), or a bigger ship.</p>}
      <FoodShop engine={engine} refresh={() => setTick((t) => t + 1)} />
      <PanelButton primary onClick={onClose}>
        Leave the tavern
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
          <span>{fruitInfo(f, save.trueName).name}</span>
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
