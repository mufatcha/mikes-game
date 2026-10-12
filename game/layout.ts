/** Where the Principal's ability bar sits on screen, shared by the HUD and the touch buttons. */
export const ABILITY_SLOT = 56;
const GAP = 8;

export function abilitySlots(cw: number, ch: number) {
  const total = 4 * ABILITY_SLOT + 3 * GAP;
  const x0 = cw / 2 - total / 2;
  const y = ch - 16 - 60;
  return [0, 1, 2, 3].map((i) => ({ x: x0 + i * (ABILITY_SLOT + GAP), y, w: ABILITY_SLOT, h: ABILITY_SLOT }));
}
