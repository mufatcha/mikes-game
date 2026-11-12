"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Modal from "./Modal";

/**
 * School Wars as an app: registers the service worker and remembers the
 * browser's "install this app" offer so the title screen can show an
 * Install button. The website keeps working exactly as before.
 */

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let offer: InstallPrompt | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Running as the installed app (not in a browser tab). */
function runningAsApp() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

type InstallState = "app" | "prompt" | "ios" | "none";

function snapshot(): InstallState {
  if (installed || runningAsApp()) return "app";
  if (offer) return "prompt";
  if (isIos()) return "ios";
  return "none";
}

/** Mounted once in the layout: service worker + catching the install offer. */
export function AppSetup() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
    const onOffer = (e: Event) => {
      e.preventDefault(); // we show our own button instead of the browser's banner
      offer = e as InstallPrompt;
      emit();
    };
    const onInstalled = () => {
      installed = true;
      offer = null;
      emit();
    };
    window.addEventListener("beforeinstallprompt", onOffer);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onOffer);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}

/** "Install app" on the title screen. Hidden when already installed or the browser can't install. */
export function InstallButton({ className = "" }: { className?: string }) {
  const state = useSyncExternalStore(subscribe, snapshot, () => "none" as InstallState);
  const [iosHelp, setIosHelp] = useState(false);
  if (state === "app" || state === "none") return null;
  const click = async () => {
    if (state === "ios") {
      setIosHelp(true);
      return;
    }
    const o = offer;
    if (!o) return;
    await o.prompt();
    const { outcome } = await o.userChoice;
    offer = null;
    if (outcome === "accepted") installed = true;
    emit();
  };
  return (
    <>
      <button
        type="button"
        onClick={click}
        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-black/60 ${className}`}
      >
        📲 Install app
      </button>
      {iosHelp && (
        <div className="fixed inset-0 z-50">
          <Modal onClose={() => setIosHelp(false)}>
            <h2 className="text-xl font-bold">Install School Wars</h2>
            <ol className="list-decimal space-y-2 pl-5 text-zinc-300">
              <li>
                Tap the <b>Share</b> button <span aria-hidden>(⬆️)</span> at the bottom (or top) of Safari.
              </li>
              <li>
                Scroll down and tap <b>Add to Home Screen</b>.
              </li>
              <li>
                Tap <b>Add</b>. School Wars is now on your home screen and opens full screen.
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setIosHelp(false)}
              className="rounded-lg bg-amber-400 px-4 py-2 font-semibold text-black"
            >
              Got it
            </button>
          </Modal>
        </div>
      )}
    </>
  );
}
