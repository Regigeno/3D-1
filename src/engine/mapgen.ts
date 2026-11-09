import { voronoiCells, type Point } from "./geometry";
import { Rng } from "./rng";
import type { FactionStart, Scenario, ScenarioProvince, Terrain } from "./types";

export interface RandomMapOptions {
  seed: number;
  provinces?: number;
  factions?: number;
  width?: number;
  height?: number;
}

const FACTION_PRESETS: Array<Omit<FactionStart, "capital">> = [
  { id: "red", name: "Crimson Horde", color: "#d94040" },
  { id: "blue", name: "Azure League", color: "#3f6fd9" },
  { id: "green", name: "Verdant Clans", color: "#3fa34d" },
  { id: "gold", name: "Sun Throne", color: "#d9a93f" },
  { id: "purple", name: "Violet Covenant", color: "#8a4fd1" },
  { id: "teal", name: "Tide Republic", color: "#2fa8a8" },
];

const INLAND_TERRAIN_WEIGHTS: Array<[Terrain, number]> = [
  ["plains", 32],
  ["forest", 22],
  ["hills", 16],
  ["mountains", 9],
  ["desert", 11],
  ["wasteland", 5],
];

const SYLLABLES = ["ka", "ro", "vel", "mar", "dun", "ith", "sor", "bel", "tor", "an", "gal", "ur", "es", "lin", "dra", "mok"];

const MAX_ATTEMPTS = 20;

function weightedTerrain(rng: Rng): Terrain {
  const total = INLAND_TERRAIN_WEIGHTS.reduce((n, [, w]) => n + w, 0);
  let roll = rng.next() * total;
  for (const [terrain, weight] of INLAND_TERRAIN_WEIGHTS) {
    roll -= weight;
    if (roll < 0) return terrain;
  }
  return "plains";
}

function provinceName(rng: Rng, used: Set<string>): string {
  for (;;) {
    const parts = rng.int(2, 3);
    let name = "";
    for (let i = 0; i < parts; i++) name += rng.pick(SYLLABLES);
    name = name[0]!.toUpperCase() + name.slice(1);
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
}

function graphDistances(neighbors: number[][], from: number): number[] {
  const dist = neighbors.map(() => -1);
  dist[from] = 0;
  const queue = [from];
  while (queue.length > 0) {
    const i = queue.shift()!;
    for (const n of neighbors[i]!) {
      if (dist[n] === -1) {
        dist[n] = dist[i]! + 1;
        queue.push(n);
      }
    }
  }
  return dist;
}

/** A wobbly ellipse: star-shaped around the center, so the landmass is one piece. */
function makeLandMask(rng: Rng, width: number, height: number): (x: number, y: number) => boolean {
  const waves = [2, 3, 5].map((k) => ({ k, amp: rng.range(0.05, 0.12), phase: rng.range(0, Math.PI * 2) }));
  const rx = width * 0.44;
  const ry = height * 0.42;
  return (x, y) => {
    const dx = (x - width / 2) / rx;
    const dy = (y - height / 2) / ry;
    const theta = Math.atan2(dy, dx);
    const r = 1 + waves.reduce((s, w) => s + w.amp * Math.sin(w.k * theta + w.phase), 0);
    return Math.hypot(dx, dy) < r;
  };
}

function scatter(rng: Rng, count: number, spacing: number, accept: (x: number, y: number) => boolean, width: number, height: number, existing: Point[]): Point[] {
  const placed: Point[] = [];
  let attempts = 0;
  while (placed.length < count && attempts < count * 400) {
    attempts++;
    const p: Point = [rng.range(0, width), rng.range(0, height)];
    if (!accept(p[0], p[1])) continue;
    const s = attempts > count * 300 ? spacing * 0.5 : spacing;
    const clear = (q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]) >= s;
    if (placed.every(clear) && existing.every(clear)) placed.push(p);
  }
  return placed;
}

function isConnected(neighbors: number[][]): boolean {
  return neighbors.length > 0 && graphDistances(neighbors, 0).every((d) => d >= 0);
}

/**
 * Builds an island: provinces are Voronoi cells of points scattered inside a
 * wobbly landmass, surrounded by sea cells that are discarded. Neighbors are
 * cells sharing a border, so the map you see matches the movement graph.
 */
export function generateRandomScenario(options: RandomMapOptions): Scenario {
  const rng = new Rng(options.seed);
  const count = options.provinces ?? 40;
  const factionCount = Math.min(options.factions ?? 4, FACTION_PRESETS.length);
  const width = options.width ?? 100;
  const height = options.height ?? 70;
  if (count < factionCount * 2) throw new Error("Too few provinces for that many factions");

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const isLand = makeLandMask(rng, width, height);
    const landArea = Math.PI * width * 0.44 * height * 0.42;
    const spacing = Math.sqrt(landArea / count) * 0.75;
    const land = scatter(rng, count, spacing, isLand, width, height, []);
    if (land.length < count) continue;
    const sea = scatter(rng, Math.round(count * 1.2), spacing * 1.1, (x, y) => !isLand(x, y), width, height, land);

    const cells = voronoiCells([...land, ...sea], { width, height });
    const landNeighbors = land.map((_, i) => cells.neighbors[i]!.filter((n) => n < count).sort((a, b) => a - b));
    if (!isConnected(landNeighbors)) continue;
    const touchesSea = land.map((_, i) => cells.neighbors[i]!.some((n) => n >= count) || cells.polygons[i]!.some(([x, y]) => x <= 0 || y <= 0 || x >= width || y >= height));

    const usedNames = new Set<string>();
    const round = (v: number) => Math.round(v * 100) / 100;
    const provinces: ScenarioProvince[] = land.map(([x, y], i) => {
      const roll = rng.next();
      const coastal = touchesSea[i] && rng.next() < 0.6;
      return {
        id: `p${i}`,
        name: provinceName(rng, usedNames),
        terrain: coastal ? "coast" : weightedTerrain(rng),
        neighbors: landNeighbors[i]!.map((n) => `p${n}`),
        baseIncome: rng.int(1, 4),
        ...(roll < 0.1 ? { special: "ley-line" as const } : roll < 0.2 ? { special: "power-site" as const } : {}),
        position: { x: round(x), y: round(y) },
        polygon: cells.polygons[i]!.map(([px, py]) => [round(px), round(py)] as [number, number]),
      };
    });

    // Spread capitals out: each new capital is the province farthest (in steps) from all chosen ones.
    const capitals: number[] = [rng.int(0, count - 1)];
    while (capitals.length < factionCount) {
      const distances = capitals.map((c) => graphDistances(landNeighbors, c));
      let best = 0;
      let bestScore = -1;
      for (let i = 0; i < count; i++) {
        if (capitals.includes(i)) continue;
        const score = Math.min(...distances.map((d) => d[i]!));
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      }
      capitals.push(best);
    }
    for (const c of capitals) {
      const p = provinces[c]!;
      if (p.terrain === "mountains" || p.terrain === "wasteland") p.terrain = "plains";
    }

    return {
      id: `random-${options.seed}`,
      name: `Random World #${options.seed}`,
      kind: "random",
      bounds: { width, height },
      provinces,
      factions: FACTION_PRESETS.slice(0, factionCount).map((f, i) => ({ ...f, capital: provinces[capitals[i]!]!.id })),
    };
  }
  throw new Error(`Could not generate a connected map for seed ${options.seed}`);
}
