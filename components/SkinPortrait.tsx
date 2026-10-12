"use client";

import { useEffect, useRef } from "react";
import type { ArchetypeId } from "@/shared/archetypes";
import { drawFace } from "@/game/skins";

/** A class's skin face, for menus like the class picker. */
export default function SkinPortrait({ archetype, size = 56 }: { archetype: ArchetypeId; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    // Leave room for wigs, buns and berets around the head.
    drawFace(ctx, size / 2, size * 0.56, size * 0.32, archetype);
  }, [archetype, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} className="shrink-0" aria-hidden />;
}
