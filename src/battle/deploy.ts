import type { MilitaryType, Squad } from "../engine";
import { FIELD_WIDTH } from "./arena";

export interface Placement {
  squad: number;
  x: number;
  z: number;
}

/** Distance from the center line to each band of the formation, in meters. */
const BAND_DEPTH: Record<MilitaryType, number> = {
  infantry: 15,
  special: 19,
  ranged: 23,
  cavalry: 19,
  artillery: 31,
};

const SPACING: Record<MilitaryType, number> = {
  infantry: 1.3,
  ranged: 1.4,
  cavalry: 2.6,
  artillery: 4.5,
  special: 4,
};

const ROW_GAP: Record<MilitaryType, number> = {
  infantry: 1.4,
  ranged: 1.5,
  cavalry: 3,
  artillery: 4.5,
  special: 4,
};

const MAX_ROW_WIDTH = FIELD_WIDTH - 14;

/**
 * Automatic formation: Infantry at the front, Special behind it in the center,
 * Ranged behind them, Cavalry on the flanks, Artillery at the rear.
 * `side` is -1 for the attacker and +1 for the defender.
 */
export function deploy(squads: Squad[], side: -1 | 1): Placement[] {
  const placements: Placement[] = [];
  const byType = new Map<MilitaryType, Array<{ squad: number; soldiers: number }>>();
  squads.forEach((s, i) => {
    const list = byType.get(s.type) ?? [];
    list.push({ squad: i, soldiers: s.soldiers });
    byType.set(s.type, list);
  });

  const placeBand = (type: MilitaryType, centerX: number, maxWidth: number) => {
    const soldiers = (byType.get(type) ?? []).flatMap((g) => Array.from({ length: g.soldiers }, () => g.squad));
    if (soldiers.length === 0) return 0;
    const perRow = Math.max(1, Math.floor(maxWidth / SPACING[type]) + 1);
    const rows = Math.ceil(soldiers.length / perRow);
    soldiers.forEach((squad, i) => {
      const row = Math.floor(i / perRow);
      const inRow = row === rows - 1 ? soldiers.length - row * perRow : perRow;
      const col = i - row * perRow;
      const x = centerX + (col - (inRow - 1) / 2) * SPACING[type] + (row % 2 ? SPACING[type] / 2 : 0);
      const z = side * (BAND_DEPTH[type] + row * ROW_GAP[type]);
      placements.push({ squad, x, z });
    });
    return Math.min(soldiers.length, perRow) * SPACING[type];
  };

  const lineWidth = Math.max(placeBand("infantry", 0, MAX_ROW_WIDTH), 0);
  placeBand("special", 0, MAX_ROW_WIDTH * 0.6);
  placeBand("ranged", 0, MAX_ROW_WIDTH);
  placeBand("artillery", 0, MAX_ROW_WIDTH);

  // Cavalry splits between the two flanks, just outside the infantry line.
  const cavalry = byType.get("cavalry") ?? [];
  if (cavalry.length) {
    const flankX = Math.min(Math.max(lineWidth / 2 + 5, 10), FIELD_WIDTH / 2 - 6);
    const soldiers = cavalry.flatMap((g) => Array.from({ length: g.soldiers }, () => g.squad));
    soldiers.forEach((squad, i) => {
      const flank = i % 2 === 0 ? -1 : 1;
      const k = Math.floor(i / 2);
      const col = k % 3;
      const row = Math.floor(k / 3);
      placements.push({
        squad,
        x: flank * (flankX + col * SPACING.cavalry),
        z: side * (BAND_DEPTH.cavalry + row * ROW_GAP.cavalry),
      });
    });
  }
  return placements;
}
