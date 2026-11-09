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

const TERRAIN_WEIGHTS: Array<[Terrain, number]> = [
  ["plains", 30],
  ["forest", 20],
  ["hills", 15],
  ["mountains", 8],
  ["desert", 10],
  ["coast", 12],
  ["wasteland", 5],
];

const SYLLABLES = ["ka", "ro", "vel", "mar", "dun", "ith", "sor", "bel", "tor", "an", "gal", "ur", "es", "lin", "dra", "mok"];

function weightedTerrain(rng: Rng): Terrain {
  const total = TERRAIN_WEIGHTS.reduce((n, [, w]) => n + w, 0);
  let roll = rng.next() * total;
  for (const [terrain, weight] of TERRAIN_WEIGHTS) {
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

function graphDistances(provinces: ScenarioProvince[], from: string): Map<string, number> {
  const byId = new Map(provinces.map((p) => [p.id, p]));
  const dist = new Map([[from, 0]]);
  const queue = [from];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const n of byId.get(id)!.neighbors) {
      if (!dist.has(n)) {
        dist.set(n, dist.get(id)! + 1);
        queue.push(n);
      }
    }
  }
  return dist;
}

/**
 * Scatters provinces with a minimum spacing and connects them with a Gabriel
 * graph, which is planar (no crossing borders) and always connected.
 */
export function generateRandomScenario(options: RandomMapOptions): Scenario {
  const rng = new Rng(options.seed);
  const count = options.provinces ?? 40;
  const factionCount = Math.min(options.factions ?? 4, FACTION_PRESETS.length);
  const width = options.width ?? 100;
  const height = options.height ?? 70;
  if (count < factionCount * 2) throw new Error("Too few provinces for that many factions");

  const minSpacing = Math.sqrt((width * height) / count) * 0.6;
  const points: Array<{ x: number; y: number }> = [];
  let attempts = 0;
  while (points.length < count) {
    const p = { x: rng.range(0, width), y: rng.range(0, height) };
    const spacing = attempts++ > count * 200 ? 0 : minSpacing;
    if (points.every((q) => Math.hypot(p.x - q.x, p.y - q.y) >= spacing)) points.push(p);
  }

  const neighbors: Set<number>[] = points.map(() => new Set());
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const a = points[i]!;
      const b = points[j]!;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const r2 = ((a.x - b.x) ** 2 + (a.y - b.y) ** 2) / 4;
      const blocked = points.some((c, k) => k !== i && k !== j && (c.x - mx) ** 2 + (c.y - my) ** 2 < r2);
      if (!blocked) {
        neighbors[i]!.add(j);
        neighbors[j]!.add(i);
      }
    }
  }

  const usedNames = new Set<string>();
  const provinces: ScenarioProvince[] = points.map((pos, i) => {
    const roll = rng.next();
    return {
      id: `p${i}`,
      name: provinceName(rng, usedNames),
      terrain: weightedTerrain(rng),
      neighbors: [...neighbors[i]!].sort((a, b) => a - b).map((n) => `p${n}`),
      baseIncome: rng.int(1, 4),
      ...(roll < 0.1 ? { special: "ley-line" as const } : roll < 0.2 ? { special: "power-site" as const } : {}),
      position: { x: Math.round(pos.x * 10) / 10, y: Math.round(pos.y * 10) / 10 },
    };
  });

  // Spread capitals out: each new capital is the province farthest (by steps) from all chosen ones.
  const capitals: string[] = [rng.pick(provinces).id];
  while (capitals.length < factionCount) {
    const distances = capitals.map((c) => graphDistances(provinces, c));
    let best = provinces[0]!.id;
    let bestScore = -1;
    for (const p of provinces) {
      if (capitals.includes(p.id)) continue;
      const score = Math.min(...distances.map((d) => d.get(p.id) ?? 0));
      if (score > bestScore) {
        bestScore = score;
        best = p.id;
      }
    }
    capitals.push(best);
  }
  for (const c of capitals) {
    const p = provinces.find((q) => q.id === c)!;
    if (p.terrain === "mountains" || p.terrain === "wasteland") p.terrain = "plains";
  }

  return {
    id: `random-${options.seed}`,
    name: `Random World #${options.seed}`,
    kind: "random",
    provinces,
    factions: FACTION_PRESETS.slice(0, factionCount).map((f, i) => ({ ...f, capital: capitals[i]! })),
  };
}
