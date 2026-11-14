"use client";

import Image from "next/image";
import Link from "next/link";

/** Big arrow on the side of the title screen that flips to another game. */
export function GameArrow({
  direction,
  label,
  onClick,
  className = "",
}: {
  direction: "left" | "right";
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`group absolute top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-1 rounded-full bg-black/50 p-3 text-white shadow-xl ring-1 ring-white/20 backdrop-blur transition hover:scale-110 hover:bg-black/70 hover:ring-white/50 ${
        direction === "left" ? "left-3 sm:left-6" : "right-3 sm:right-6"
      } ${className}`}
    >
      <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {direction === "left" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
      </svg>
    </button>
  );
}

/** Wrathwater, the second game: its title art, and the way in. */
export function WrathwaterTitle() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-black px-4">
      <div className="relative aspect-[16/9] w-full max-w-[min(100vw,177vh)]">
        <Image
          src="/wrathwater/title.jpg"
          alt="Wrathwater"
          fill
          priority
          sizes="100vw"
          className="object-contain"
        />
      </div>
      <Link
        href="/wrathwater"
        className="absolute bottom-[12vh] rounded-xl bg-red-900/90 px-10 py-3 text-lg font-bold uppercase tracking-[0.3em] text-white shadow-2xl ring-1 ring-red-500/40 transition hover:scale-105 hover:bg-red-800"
      >
        Set sail
      </Link>
    </main>
  );
}
