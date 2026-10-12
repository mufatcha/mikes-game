import type { ArchetypeId } from "@/shared/archetypes";

/**
 * Class skins: a cartoon face with the class's look (hair, hats, glasses…)
 * and, for the first-person view, an outfit drawn over the team-colored body.
 * Team color stays the main body color so sides are easy to tell apart.
 */

export const SKIN: Record<ArchetypeId, string> = {
  teacher: "#f1c27d",
  lunchlady: "#e0ac69",
  jock: "#c68642",
  artkid: "#f5d0a9",
  nerd: "#ffdbac",
  clown: "#fafafa",
  principal: "#d6a57c",
  // The mascots' "skin" is the fruit itself.
  blueberry: "#4338ca",
  orangepeel: "#f97316",
};

function isMascot(a: ArchetypeId) {
  return a === "blueberry" || a === "orangepeel";
}

const INK = "#1f2937";

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * A shaded cartoon head for a class, centered at (cx, cy) with radius r.
 * `facing` is which way the head is turned relative to the viewer: 0 looks
 * straight at you, ±π/2 is side-on, and around π you see the back of the head.
 */
export function drawFace(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  a: ArchetypeId,
  facing = 0,
) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Things behind the head.
  if (a === "clown") {
    const wig = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7"];
    for (let i = 0; i < 9; i++) {
      const ang = Math.PI * (0.95 + (i / 8) * 1.1);
      circle(ctx, cx + Math.cos(ang) * r * 0.95, cy + Math.sin(ang) * r * 0.85, r * 0.42, wig[i % wig.length]);
    }
  } else if (a === "lunchlady") {
    for (let i = 0; i < 7; i++) {
      const ang = Math.PI * (1.05 + (i / 6) * 0.9);
      circle(ctx, cx + Math.cos(ang) * r * 0.9, cy + Math.sin(ang) * r * 0.82, r * 0.3, "#9ca3af");
    }
  } else if (a === "teacher") {
    circle(ctx, cx, cy - r * 1.02, r * 0.38, "#6b4423"); // bun
  } else if (a === "principal") {
    circle(ctx, cx - r * 0.92, cy - r * 0.05, r * 0.28, "#9ca3af");
    circle(ctx, cx + r * 0.92, cy - r * 0.05, r * 0.28, "#9ca3af");
  }

  // Head.
  circle(ctx, cx, cy, r, SKIN[a]);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = r * 0.08;
  ctx.stroke();

  // Hair and hats on top of the head.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (a === "blueberry") {
    // The dusty bloom on a blueberry's skin.
    for (let i = 0; i < 14; i++) {
      circle(ctx, cx + Math.cos(i * 2.4) * r * 0.75 * ((i % 4) / 4 + 0.2), cy + Math.sin(i * 2.4) * r * 0.7 * ((i % 3) / 3 + 0.25), r * 0.12, "rgba(199,210,254,0.18)");
    }
  } else if (a === "orangepeel") {
    // Dimpled peel.
    for (let i = 0; i < 22; i++) {
      circle(ctx, cx + Math.cos(i * 1.9) * r * ((i % 5) / 5 + 0.1), cy + Math.sin(i * 1.9) * r * ((i % 4) / 4 + 0.1), r * 0.045, "rgba(154,52,18,0.35)");
    }
  } else if (a === "teacher") {
    ctx.fillStyle = "#6b4423";
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.75, r * 1.05, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (a === "jock") {
    ctx.fillStyle = "#1c1917";
    ctx.fillRect(cx - r, cy - r, r * 2, r * 0.42);
    ctx.fillStyle = "#dc2626"; // sweatband
    ctx.fillRect(cx - r, cy - r * 0.6, r * 2, r * 0.22);
    ctx.fillStyle = "#fff";
    ctx.fillRect(cx - r, cy - r * 0.52, r * 2, r * 0.05);
  } else if (a === "nerd") {
    ctx.fillStyle = "#78350f";
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.8, r, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (a === "lunchlady") {
    // Hairnet over the hair.
    ctx.fillStyle = "#9ca3af";
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.78, r * 1.05, r * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(186,230,253,0.85)";
    ctx.lineWidth = Math.max(0.6, r * 0.05);
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * r * 0.3 - r * 0.3, cy - r);
      ctx.lineTo(cx + i * r * 0.3 + r * 0.3, cy - r * 0.35);
      ctx.moveTo(cx + i * r * 0.3 + r * 0.3, cy - r);
      ctx.lineTo(cx + i * r * 0.3 - r * 0.3, cy - r * 0.35);
      ctx.stroke();
    }
  } else if (a === "principal") {
    // Shiny bald head.
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.25, cy - r * 0.62, r * 0.3, r * 0.15, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (a === "artkid") {
    // A tilted beret with a little stem.
    ctx.fillStyle = "#b91c1c";
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.15, cy - r * 0.78, r * 0.95, r * 0.38, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#b91c1c";
    ctx.lineWidth = r * 0.12;
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.2, cy - r * 1.1);
    ctx.lineTo(cx + r * 0.25, cy - r * 1.3);
    ctx.stroke();
  } else if (a === "blueberry") {
    // The little five-pointed crown on top of a blueberry.
    ctx.fillStyle = "#1e1b4b";
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.12 : r * 0.3;
      const px = cx + Math.cos(ang) * rr;
      const py = cy - r * 0.86 + Math.sin(ang) * rr * 0.6;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.fill();
  } else if (a === "orangepeel") {
    // A stem and a leaf on top.
    ctx.strokeStyle = "#78350f";
    ctx.lineWidth = r * 0.1;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.9);
    ctx.lineTo(cx + r * 0.05, cy - r * 1.15);
    ctx.stroke();
    ctx.fillStyle = "#16a34a";
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.32, cy - r * 1.12, r * 0.34, r * 0.14, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Turn the head: features slide toward the side it's facing and squash, like a sphere turning.
  const turn = wrapAngle(facing);
  if (Math.abs(turn) > Math.PI * 0.6) {
    drawBackOfHead(ctx, cx, cy, r, a);
  } else {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx + Math.sin(turn) * r * 0.45, 0);
    ctx.scale(Math.max(0.45, Math.cos(turn)), 1);
    ctx.translate(-cx, 0);
    // Face paint, eyes, mouth.
    const ey = cy - r * 0.02;
    const ex = r * 0.34;
    if (a === "clown") {
      ctx.fillStyle = "#60a5fa";
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + s * ex, ey - r * 0.32);
        ctx.lineTo(cx + s * ex + r * 0.14, ey);
        ctx.lineTo(cx + s * ex, ey + r * 0.32);
        ctx.lineTo(cx + s * ex - r * 0.14, ey);
        ctx.fill();
      }
    }
    if (isMascot(a)) {
      // Mascots have big friendly cartoon eyes.
      for (const s of [-1, 1]) {
        circle(ctx, cx + s * ex, ey - r * 0.05, r * 0.22, "#fff");
        circle(ctx, cx + s * ex + r * 0.04, ey - r * 0.02, r * 0.11, INK);
        circle(ctx, cx + s * ex + r * 0.08, ey - r * 0.07, r * 0.04, "#fff");
      }
    } else {
      for (const s of [-1, 1]) circle(ctx, cx + s * ex, ey, r * 0.11, INK);
    }
    if (a === "jock") {
      ctx.fillStyle = INK;
      for (const s of [-1, 1]) ctx.fillRect(cx + s * ex - r * 0.15, ey + r * 0.17, r * 0.3, r * 0.08);
    }
    if (a === "lunchlady") {
      for (const s of [-1, 1]) circle(ctx, cx + s * r * 0.55, cy + r * 0.3, r * 0.15, "rgba(244,114,182,0.6)");
    }
    if (a === "artkid") circle(ctx, cx - r * 0.5, cy + r * 0.35, r * 0.13, "#3b82f6");
  
    // Glasses.
    ctx.strokeStyle = INK;
    if (a === "teacher") {
      ctx.lineWidth = r * 0.07;
      for (const s of [-1, 1]) ctx.strokeRect(cx + s * ex - r * 0.2, ey - r * 0.14, r * 0.4, r * 0.28);
      ctx.beginPath();
      ctx.moveTo(cx - ex + r * 0.2, ey);
      ctx.lineTo(cx + ex - r * 0.2, ey);
      ctx.stroke();
    } else if (a === "nerd") {
      ctx.lineWidth = r * 0.1;
      ctx.fillStyle = "rgba(191,219,254,0.35)";
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(cx + s * ex, ey, r * 0.26, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - ex + r * 0.26, ey);
      ctx.lineTo(cx + ex - r * 0.26, ey);
      ctx.stroke();
    }
  
    // Mouth.
    if (a === "clown") {
      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = r * 0.14;
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.25, r * 0.42, Math.PI * 0.12, Math.PI * 0.88);
      ctx.stroke();
      circle(ctx, cx, cy + r * 0.12, r * 0.17, "#ef4444"); // red nose
    } else if (a === "principal") {
      ctx.fillStyle = "#44403c"; // mustache
      ctx.beginPath();
      ctx.ellipse(cx - r * 0.2, cy + r * 0.38, r * 0.24, r * 0.1, 0.2, 0, Math.PI * 2);
      ctx.ellipse(cx + r * 0.2, cy + r * 0.38, r * 0.24, r * 0.1, -0.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (isMascot(a)) {
      // A big open grin.
      ctx.fillStyle = "#450a0a";
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.22, r * 0.36, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#f87171";
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 0.48, r * 0.17, r * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = INK;
      ctx.lineWidth = r * 0.08;
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.2, r * 0.3, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
      if (a === "nerd") {
        ctx.fillStyle = "#fff";
        ctx.fillRect(cx - r * 0.1, cy + r * 0.47, r * 0.2, r * 0.14);
      }
    }
    ctx.restore();
  }

  // Sphere shading: a highlight up top, shadow underneath.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const shade = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.05, cx, cy, r * 1.1);
  shade.addColorStop(0, "rgba(255,255,255,0.4)");
  shade.addColorStop(0.45, "rgba(255,255,255,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.32)");
  ctx.fillStyle = shade;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
  ctx.restore();
}

/**
 * The class outfit over a team-colored body, seen from the front:
 * (x, y) is the body's top-left, w and h its size.
 */
export function drawOutfit(
  ctx: CanvasRenderingContext2D,
  a: ArchetypeId,
  x: number,
  y: number,
  w: number,
  h: number,
  back = false,
) {
  const cx = x + w / 2;
  ctx.save();
  const tie = (color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.07, y + h * 0.02);
    ctx.lineTo(cx + w * 0.07, y + h * 0.02);
    ctx.lineTo(cx + w * 0.1, y + h * 0.5);
    ctx.lineTo(cx, y + h * 0.6);
    ctx.lineTo(cx - w * 0.1, y + h * 0.5);
    ctx.fill();
  };
  if (back) {
    drawOutfitBack(ctx, a, x, y, w, h);
    ctx.restore();
    return;
  }
  switch (a) {
    case "teacher":
      // Green cardigan over a team-colored shirt, with a tie.
      ctx.fillStyle = "#3f6212";
      ctx.fillRect(x, y, w * 0.3, h);
      ctx.fillRect(x + w * 0.7, y, w * 0.3, h);
      tie("#7f1d1d");
      break;
    case "lunchlady":
      // White apron with a pocket.
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(x + w * 0.2, y + h * 0.15, w * 0.6, h * 0.85);
      ctx.fillRect(x + w * 0.3, y, w * 0.08, h * 0.2);
      ctx.fillRect(x + w * 0.62, y, w * 0.08, h * 0.2);
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = Math.max(1, w * 0.03);
      ctx.strokeRect(x + w * 0.35, y + h * 0.5, w * 0.3, h * 0.2);
      break;
    case "jock":
      // Letterman jacket: white sleeves and a big letter.
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(x, y + h * 0.05, w * 0.18, h * 0.7);
      ctx.fillRect(x + w * 0.82, y + h * 0.05, w * 0.18, h * 0.7);
      ctx.font = `900 ${Math.max(6, w * 0.4)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("S", cx - w * 0.15, y + h * 0.3);
      break;
    case "artkid": {
      // A smock covered in paint.
      const paint = ["#ef4444", "#eab308", "#22c55e", "#3b82f6", "#ec4899", "#a855f7"];
      for (let i = 0; i < 9; i++) {
        circle(ctx, x + w * (0.15 + ((i * 37) % 70) / 100), y + h * (0.1 + ((i * 53) % 80) / 100), w * 0.06, paint[i % paint.length]);
      }
      break;
    }
    case "nerd":
      // Bow tie and a pocket protector full of pens.
      ctx.fillStyle = "#dc2626";
      ctx.beginPath();
      ctx.moveTo(cx, y + h * 0.06);
      ctx.lineTo(cx - w * 0.16, y);
      ctx.lineTo(cx - w * 0.16, y + h * 0.12);
      ctx.closePath();
      ctx.moveTo(cx, y + h * 0.06);
      ctx.lineTo(cx + w * 0.16, y);
      ctx.lineTo(cx + w * 0.16, y + h * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(x + w * 0.58, y + h * 0.22, w * 0.22, h * 0.18);
      for (const [i, c] of ["#1d4ed8", "#dc2626", "#16a34a"].entries()) {
        ctx.fillStyle = c;
        ctx.fillRect(x + w * (0.61 + i * 0.06), y + h * 0.16, w * 0.03, h * 0.12);
      }
      break;
    case "clown":
      // Polka dots and a ruffled collar.
      for (let i = 0; i < 8; i++) {
        circle(ctx, x + w * (0.2 + ((i * 41) % 60) / 100), y + h * (0.2 + ((i * 29) % 70) / 100), w * 0.07, i % 2 ? "#fde047" : "#f8fafc");
      }
      ctx.fillStyle = "#f8fafc";
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let i = 0; i <= 8; i++) ctx.lineTo(x + (w * i) / 8, y + (i % 2 ? h * 0.12 : 0));
      ctx.lineTo(x + w, y);
      ctx.fill();
      break;
    case "principal":
      // Dark suit jacket over a team-colored shirt, red tie.
      ctx.fillStyle = "#1f2937";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(cx - w * 0.22, y);
      ctx.lineTo(cx - w * 0.12, y + h * 0.55);
      ctx.lineTo(cx - w * 0.12, y + h);
      ctx.lineTo(x, y + h);
      ctx.moveTo(x + w, y);
      ctx.lineTo(cx + w * 0.22, y);
      ctx.lineTo(cx + w * 0.12, y + h * 0.55);
      ctx.lineTo(cx + w * 0.12, y + h);
      ctx.lineTo(x + w, y + h);
      ctx.fill();
      tie("#b91c1c");
      break;
    case "blueberry":
    case "orangepeel":
      drawJersey(ctx, a, x, y, w, h, false);
      break;
  }
  ctx.restore();
}

/** A mascot's game-day jersey: white stripes and the school's letter on the front, number 1 on the back. */
function drawJersey(ctx: CanvasRenderingContext2D, a: ArchetypeId, x: number, y: number, w: number, h: number, back: boolean) {
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(x, y + h * 0.12, w, h * 0.06);
  ctx.fillRect(x, y + h * 0.24, w, h * 0.03);
  ctx.font = `900 ${Math.max(6, w * 0.45)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = a === "blueberry" ? "#e0e7ff" : "#fff7ed";
  ctx.fillText(back ? "1" : a === "blueberry" ? "B" : "O", x + w / 2, y + h * 0.6);
}

function wrapAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** The back of the head: hair, hats and nets, no face. */
function drawBackOfHead(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, a: ArchetypeId) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const hair: Partial<Record<ArchetypeId, string>> = {
    teacher: "#6b4423",
    lunchlady: "#9ca3af",
    jock: "#1c1917",
    artkid: "#7c4a1e",
    nerd: "#78350f",
  };
  if (a === "clown") {
    const wig = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7"];
    for (let i = 0; i < 12; i++) {
      circle(ctx, cx + Math.cos(i * 2.1) * r * 0.55, cy + Math.sin(i * 1.7) * r * 0.55, r * 0.42, wig[i % wig.length]);
    }
  } else if (a === "principal") {
    // Bald on top, a gray fringe around the back.
    ctx.fillStyle = "#9ca3af";
    ctx.fillRect(cx - r, cy + r * 0.05, r * 2, r * 0.45);
  } else if (hair[a]) {
    ctx.fillStyle = hair[a]!;
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.1, r * 1.05, r * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
    if (a === "lunchlady") {
      ctx.strokeStyle = "rgba(186,230,253,0.85)";
      ctx.lineWidth = Math.max(0.6, r * 0.05);
      for (let i = -4; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * r * 0.3 - r * 0.6, cy - r);
        ctx.lineTo(cx + i * r * 0.3 + r * 0.6, cy + r * 0.7);
        ctx.moveTo(cx + i * r * 0.3 + r * 0.6, cy - r);
        ctx.lineTo(cx + i * r * 0.3 - r * 0.6, cy + r * 0.7);
        ctx.stroke();
      }
    }
    if (a === "jock") {
      ctx.fillStyle = "#dc2626"; // the sweatband goes all the way around
      ctx.fillRect(cx - r, cy - r * 0.6, r * 2, r * 0.22);
    }
  }
  ctx.restore();
}

/** The back of each outfit: no ties or pockets, but you can still tell the class. */
function drawOutfitBack(ctx: CanvasRenderingContext2D, a: ArchetypeId, x: number, y: number, w: number, h: number) {
  switch (a) {
    case "blueberry":
    case "orangepeel":
      drawJersey(ctx, a, x, y, w, h, true);
      break;
    case "teacher":
      ctx.fillStyle = "#3f6212"; // the cardigan covers the whole back
      ctx.fillRect(x, y, w, h);
      break;
    case "lunchlady":
      // Apron straps crossing on the back, and the bow.
      ctx.strokeStyle = "#f8fafc";
      ctx.lineWidth = Math.max(1, w * 0.1);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.2, y);
      ctx.lineTo(x + w * 0.8, y + h * 0.55);
      ctx.moveTo(x + w * 0.8, y);
      ctx.lineTo(x + w * 0.2, y + h * 0.55);
      ctx.stroke();
      circle(ctx, x + w / 2, y + h * 0.6, w * 0.1, "#f8fafc");
      break;
    case "jock":
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(x, y + h * 0.05, w * 0.18, h * 0.7);
      ctx.fillRect(x + w * 0.82, y + h * 0.05, w * 0.18, h * 0.7);
      ctx.font = `900 ${Math.max(6, w * 0.45)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("23", x + w / 2, y + h * 0.4);
      break;
    case "principal":
      ctx.fillStyle = "#1f2937"; // suit jacket
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(x + w / 2 - w * 0.01, y + h * 0.55, w * 0.02, h * 0.45);
      break;
    default:
      drawOutfit(ctx, a, x, y, w, h); // splatters, dots and plain shirts look the same from behind
  }
}

export interface FigureOptions {
  /** Screen x of the figure's middle. */
  cx: number;
  /** Top of the head and the floor under the feet, in screen pixels. */
  top: number;
  bottom: number;
  /** Body width in screen pixels when seen from the front. */
  bw: number;
  archetype: ArchetypeId;
  teamColor: string;
  /** Which way they face relative to the viewer: 0 = toward you, π = away. */
  facing: number;
  /** Color of the throw they're holding. */
  ballColor: string;
}

/** Shade a shape like a cylinder lit from the front-left. */
function cylinderShade(ctx: CanvasRenderingContext2D, x: number, w: number) {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, "rgba(0,0,0,0.38)");
  g.addColorStop(0.32, "rgba(255,255,255,0.12)");
  g.addColorStop(0.55, "rgba(255,255,255,0)");
  g.addColorStop(1, "rgba(0,0,0,0.42)");
  return g;
}

/**
 * A whole player for the first-person view: shadow, legs, shaded body with
 * the class outfit, arms with the throw in hand, and the turning head.
 */
export function drawFigure(ctx: CanvasRenderingContext2D, o: FigureOptions) {
  const { cx, top, bottom, bw } = o;
  const turn = wrapAngle(o.facing);
  const back = Math.abs(turn) > Math.PI * 0.6;
  // Side-on, the body is narrower.
  const width = bw * (0.62 + 0.38 * Math.abs(Math.cos(turn)));
  const headR = bw * 0.4;
  const headY = top + headR;
  const torsoTop = headY + headR * 0.8;
  const hip = top + (bottom - top) * 0.72;
  const skin = SKIN[o.archetype];
  ctx.save();

  // Shadow on the floor.
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(cx, bottom, bw * 0.75, Math.max(2, bw * 0.16), 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs and shoes.
  const legW = width * 0.32;
  for (const s of [-1, 1]) {
    const lx = cx + s * width * 0.2 - legW / 2;
    ctx.fillStyle = "#334155";
    ctx.fillRect(lx, hip - 2, legW, bottom - hip - bw * 0.06);
    ctx.fillStyle = cylinderShade(ctx, lx, legW);
    ctx.fillRect(lx, hip - 2, legW, bottom - hip - bw * 0.06);
    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.ellipse(lx + legW / 2 + Math.sin(turn) * legW * 0.3, bottom - bw * 0.06, legW * 0.65, bw * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // The throwing hand: behind the body when they face away, in front otherwise.
  const handX = cx + Math.sin(turn) * width * 0.55 + (back ? 0 : width * 0.18);
  const handY = torsoTop + (hip - torsoTop) * 0.38;
  const drawBall = () => {
    circle(ctx, handX, handY, bw * 0.12, skin);
    circle(ctx, handX + Math.sin(turn) * bw * 0.08, handY - bw * 0.1, bw * 0.13, o.ballColor);
  };
  if (back) drawBall();

  // Arms hanging at the sides.
  const armW = width * 0.22;
  for (const s of [-1, 1]) {
    const ax = cx + s * (width / 2 + armW * 0.25) - armW / 2;
    ctx.fillStyle = o.teamColor;
    ctx.beginPath();
    ctx.roundRect(ax, torsoTop + 2, armW, (hip - torsoTop) * 0.95, armW / 2);
    ctx.fill();
    ctx.fillStyle = cylinderShade(ctx, ax, armW);
    ctx.fill();
    circle(ctx, ax + armW / 2, torsoTop + (hip - torsoTop) * 0.98, armW * 0.55, skin);
  }

  // Torso: team color with the outfit over it, shaded round.
  const tx = cx - width / 2;
  const th = hip - torsoTop + bw * 0.08;
  ctx.fillStyle = o.teamColor;
  ctx.beginPath();
  ctx.roundRect(tx, torsoTop, width, th, width * 0.32);
  ctx.fill();
  ctx.save();
  ctx.clip();
  drawOutfit(ctx, o.archetype, tx, torsoTop, width, th, back);
  ctx.fillStyle = cylinderShade(ctx, tx, width);
  ctx.fillRect(tx, torsoTop, width, th);
  ctx.restore();

  if (!back) drawBall();

  // Head on top, turned the way they're facing.
  drawFace(ctx, cx, headY, headR, o.archetype, o.facing);
  ctx.restore();
}
