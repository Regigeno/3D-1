import { voronoiCells, type Point } from "../geometry";
import type { FactionStart, Scenario, ScenarioProvince, SpecialResource, Terrain } from "../types";

export interface PresetProvince {
  id: string;
  name: string;
  x: number;
  y: number;
  terrain: Terrain;
  /** Base gold income; defaults to 2. */
  income?: number;
  special?: SpecialResource;
}

export interface PresetDefinition {
  id: string;
  name: string;
  kind: "fictional" | "fantasy-earth";
  description: string;
  width: number;
  height: number;
  /** Sea fills any spot at least this far from every province point. */
  coastDistance: number;
  provinces: PresetProvince[];
  factions: FactionStart[];
}

const SEA_GRID = 3.2;

/**
 * Turns hand-placed province points into a scenario. Provinces are Voronoi
 * cells around the points, sea cells fill every gap wider than `coastDistance`,
 * and neighbors are the provinces whose cells share a border, so the map you
 * see is exactly the movement graph.
 */
export function buildPreset(def: PresetDefinition): Scenario {
  const land: Point[] = def.provinces.map((p) => [p.x, p.y]);
  const sea: Point[] = [];
  for (let row = 0, y = 0; y <= def.height; row++, y += SEA_GRID * 0.866) {
    for (let x = row % 2 ? SEA_GRID / 2 : 0; x <= def.width; x += SEA_GRID) {
      if (land.every(([lx, ly]) => Math.hypot(lx - x, ly - y) >= def.coastDistance)) sea.push([x, y]);
    }
  }
  const count = land.length;
  const cells = voronoiCells([...land, ...sea], { width: def.width, height: def.height });
  const round = (v: number) => Math.round(v * 100) / 100;
  const provinces: ScenarioProvince[] = def.provinces.map((p, i) => ({
    id: p.id,
    name: p.name,
    terrain: p.terrain,
    neighbors: cells.neighbors[i]!.filter((n) => n < count).map((n) => def.provinces[n]!.id),
    baseIncome: p.income ?? 2,
    ...(p.special ? { special: p.special } : {}),
    position: { x: p.x, y: p.y },
    polygon: cells.polygons[i]!.map(([x, y]) => [round(x), round(y)] as [number, number]),
  }));
  return { id: def.id, name: def.name, kind: def.kind, bounds: { width: def.width, height: def.height }, provinces, factions: def.factions };
}
