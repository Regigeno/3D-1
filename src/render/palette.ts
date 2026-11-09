import { Color } from "three";
import type { Terrain } from "../engine";

export const TERRAIN_COLOR: Record<Terrain, string> = {
  plains: "#8fbf5a",
  forest: "#4f8a3c",
  hills: "#a3a25e",
  mountains: "#8e8a84",
  desert: "#e0c27a",
  coast: "#c9d18c",
  wasteland: "#7d6a5a",
};

export const TERRAIN_HEIGHT: Record<Terrain, number> = {
  coast: 0.6,
  wasteland: 0.7,
  plains: 0.8,
  desert: 0.9,
  forest: 1.0,
  hills: 1.4,
  mountains: 2.0,
};

export const OCEAN_COLOR = "#2b5f8a";
export const SKY_COLOR = "#0f1a26";
export const LAND_BASE_COLOR = "#3b2f26";

/** How much of the owner's color shows on a province top. */
export const OWNER_TINT = 0.78;

export const HIGHLIGHT = {
  hover: new Color("#ffffff").multiplyScalar(0.08),
  selected: new Color("#ffffff").multiplyScalar(0.1),
  move: new Color("#2fd46a").multiplyScalar(0.4),
  capture: new Color("#ffb020").multiplyScalar(0.4),
  attack: new Color("#ff2a1f").multiplyScalar(0.5),
  none: new Color("#000000"),
} as const;

export function provinceTopColor(terrain: Terrain, ownerColor: string | null, fogged: boolean): Color {
  const color = new Color(TERRAIN_COLOR[terrain]);
  if (ownerColor) color.lerp(new Color(ownerColor), OWNER_TINT);
  if (fogged) {
    const grey = (color.r + color.g + color.b) / 3;
    color.lerp(new Color(grey, grey, grey), 0.5).multiplyScalar(0.45);
  }
  return color;
}
