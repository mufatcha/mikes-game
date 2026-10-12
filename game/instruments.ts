import type { WeaponId } from "@/shared/archetypes";

/**
 * The instruments the Band and Orchestra Kids play (and the Gamer's controller
 * and the Pyro's flamethrower, held the same way): which one each weapon
 * is, and how it looks held in the top-down view. (The 3D models are in
 * avatar3d.ts.)
 */
export type Instrument =
  | "trumpet"
  | "trombone"
  | "tuba"
  | "sax"
  | "flute"
  | "drum"
  | "cymbals"
  | "violin"
  | "viola"
  | "cello"
  | "bass"
  // Not instruments, but held the same way.
  | "gamepad"
  | "flamethrower"
  | "flaregun";

const INSTRUMENT_OF: Partial<Record<WeaponId, Instrument>> = {
  tuba: "tuba",
  trombone: "trombone",
  drumsticks: "drum",
  cymbal: "cymbals",
  trumpet: "trumpet",
  fanfare: "trumpet",
  reed: "sax",
  piccolo: "flute",
  violin: "violin",
  pizzicato: "violin",
  viola: "viola",
  tremolo: "viola",
  cello: "cello",
  spiccato: "cello",
  doublebass: "bass",
  slap: "bass",
  pixel: "gamepad",
  controller: "gamepad",
  flamethrower: "flamethrower",
  flare: "flaregun",
};

/** The instrument a weapon is played on, or null for things you just throw. */
export function instrumentOf(weapon: WeaponId): Instrument | null {
  return INSTRUMENT_OF[weapon] ?? null;
}

const GOLD = "#eab308";
const GOLD_DARK = "#a16207";
const SILVER = "#e5e7eb";
const WOOD = "#92400e";
const WOOD_DARK = "#451a03";

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function bar(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, width: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** A string instrument's body seen from above: two rounded bouts and a waist. */
function stringBody(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, width: number) {
  disc(ctx, x - len * 0.25, y, len * 0.3, width * 0.5, WOOD);
  disc(ctx, x + len * 0.2, y, len * 0.25, width * 0.42, WOOD);
  ctx.fillStyle = WOOD_DARK;
  ctx.fillRect(x - len * 0.05, y - width * 0.08, len * 0.1, width * 0.16);
}

/**
 * Draw an instrument held by a player of radius r, top-down, in a frame
 * rotated so +x is where they aim. Returns how far in front the sound comes
 * out, for the muzzle flash.
 */
export function drawInstrument2D(ctx: CanvasRenderingContext2D, kind: Instrument, r: number): number {
  const k = r / 18;
  ctx.save();
  ctx.scale(k, k);
  let end = 30;
  switch (kind) {
    case "trumpet":
      bar(ctx, 14, 0, 32, 0, 3, GOLD);
      for (let i = 0; i < 3; i++) disc(ctx, 19 + i * 3, -2.5, 1.2, 1.2, GOLD_DARK);
      disc(ctx, 34, 0, 3, 6, GOLD);
      end = 36;
      break;
    case "trombone":
      // Bell section on the left: the tube runs back past the face to the tuning slide,
      // and forward to the flared bell.
      bar(ctx, 4, -6, 31, -6, 1.6, GOLD);
      bar(ctx, 4, -6, 4, 0, 1.6, GOLD);
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.moveTo(30, -7);
      ctx.lineTo(37, -11.5);
      ctx.lineTo(37, -0.5);
      ctx.lineTo(30, -5);
      ctx.closePath();
      ctx.fill();
      bar(ctx, 37, -11.5, 37, -0.5, 1.2, GOLD_DARK);
      // The slide: two tubes out to the U-bend, with the brace you hold.
      bar(ctx, 12, -0.9, 46, -0.9, 1.3, GOLD);
      bar(ctx, 12, 0.9, 46, 0.9, 1.3, GOLD);
      bar(ctx, 46, -0.9, 46, 0.9, 1.6, GOLD);
      bar(ctx, 32, -2, 32, 2, 1.2, GOLD_DARK);
      bar(ctx, 20, -6, 20, -0.9, 1, GOLD_DARK);
      disc(ctx, 11.5, 0, 1.4, 1.4, SILVER);
      end = 47;
      break;
    case "tuba":
      disc(ctx, 18, 6, 11, 11, GOLD);
      disc(ctx, 18, 6, 7, 7, GOLD_DARK);
      bar(ctx, 10, -6, 18, 0, 3, GOLD);
      end = 30;
      break;
    case "sax":
      bar(ctx, 14, 0, 26, 4, 3, GOLD);
      disc(ctx, 28, 6, 5, 5, GOLD);
      disc(ctx, 28, 6, 3, 3, GOLD_DARK);
      end = 32;
      break;
    case "flute":
      // Held sideways, across the face.
      bar(ctx, 14, -4, 18, 22, 2, SILVER);
      end = 22;
      break;
    case "drum":
      disc(ctx, 22, 0, 10, 10, "#dc2626");
      disc(ctx, 22, 0, 8.5, 8.5, "#f8fafc");
      bar(ctx, 14, -6, 24, -3, 1.6, "#d6a76b");
      bar(ctx, 14, 6, 24, 3, 1.6, "#d6a76b");
      end = 32;
      break;
    case "cymbals":
      disc(ctx, 16, -14, 4, 9, GOLD);
      disc(ctx, 16, 14, 4, 9, GOLD);
      end = 22;
      break;
    case "violin":
    case "viola": {
      // Tucked under the chin, pointing forward-left, with the bow across it.
      const s = kind === "viola" ? 1.15 : 1;
      stringBody(ctx, 10, -10, 18 * s, 10 * s);
      bar(ctx, 18 * s, -10, 30 * s, -10, 2, WOOD_DARK);
      bar(ctx, 6, 8, 18, -16, 1.4, "#d6d3d1");
      end = 30 * s;
      break;
    }
    case "cello":
    case "bass": {
      // Standing on the floor in front of them.
      const s = kind === "bass" ? 1.3 : 1;
      stringBody(ctx, 22, 0, 24 * s, 16 * s);
      bar(ctx, 22 + 12 * s, 0, 22 + 22 * s, 0, 2.5, WOOD_DARK);
      bar(ctx, 20, -12 * s, 20, 12 * s, 1.4, "#d6d3d1");
      end = 22 + 22 * s;
      break;
    }
    case "gamepad": {
      // A game controller held in both hands: two grips, a d-pad and four buttons.
      ctx.fillStyle = "#1f2937";
      ctx.beginPath();
      ctx.roundRect(14, -9, 12, 18, 5);
      ctx.fill();
      disc(ctx, 16, -9, 4, 4, "#1f2937");
      disc(ctx, 16, 9, 4, 4, "#1f2937");
      ctx.fillStyle = "#9ca3af";
      ctx.fillRect(18, -5.5, 4, 1.2);
      ctx.fillRect(19.4, -7, 1.2, 4);
      const buttons = ["#22c55e", "#ef4444", "#3b82f6", "#eab308"];
      buttons.forEach((c, i) => disc(ctx, 20 + (i % 2 ? 2 : -0.5), 3.5 + (i > 1 ? 2 : 0), 1.1, 1.1, c));
      end = 26;
      break;
    }
    case "flamethrower":
      // A long nozzle with a red tip and a little pilot flame.
      bar(ctx, 10, 3, 40, 3, 5, "#6b7280");
      bar(ctx, 40, 3, 44, 3, 6, "#b91c1c");
      disc(ctx, 47, 3, 3, 2, "#fb923c");
      bar(ctx, 6, 8, 18, 4, 2, "#374151");
      end = 48;
      break;
    case "flaregun":
      // A stubby orange flare pistol.
      bar(ctx, 14, 0, 28, 0, 4, "#f97316");
      bar(ctx, 16, 2, 14, 7, 3, "#1f2937");
      end = 29;
      break;
  }
  ctx.restore();
  return end * k;
}
