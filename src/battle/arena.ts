import { Rng, type Terrain } from "../engine";

/** Battlefield size in meters. The attacker deploys at negative z, the defender at positive z. */
export const FIELD_WIDTH = 64;
export const FIELD_LENGTH = 84;

export interface Mound {
  x: number;
  z: number;
  /** Radius of the buried sphere that forms the mound. */
  radius: number;
  height: number;
}

export type Obstacle =
  | { kind: "tree"; x: number; z: number; radius: number; height: number }
  | { kind: "rock"; x: number; z: number; radius: number }
  | { kind: "wall"; x: number; z: number; halfLength: number; height: number };

export interface ArenaLayout {
  terrain: Terrain;
  ground: string;
  mounds: Mound[];
  obstacles: Obstacle[];
  /** Sea along the right edge, for coast battles. Purely visual. */
  water: boolean;
}

const GROUND: Record<Terrain, string> = {
  plains: "#7fae4f",
  forest: "#557f3b",
  hills: "#8a9a52",
  mountains: "#8b8577",
  desert: "#d8bf7c",
  coast: "#a8b867",
  wasteland: "#7d6f5e",
};

/** Lines are kept clear around the deployment zones so nobody spawns inside a tree. */
const DEPLOY_CLEAR_FROM = 11;

/** Terrain picks the arena: trees in forests, slopes in hills, and so on. Deterministic in `seed`. */
export function buildArena(terrain: Terrain, seed: number, fortified: boolean): ArenaLayout {
  const rng = new Rng(seed ^ 0x5bd1e995);
  const mounds: Mound[] = [];
  const obstacles: Obstacle[] = [];
  const halfW = FIELD_WIDTH / 2 - 3;
  const inMiddle = () => ({ x: rng.range(-halfW, halfW), z: rng.range(-DEPLOY_CLEAR_FROM + 2, DEPLOY_CLEAR_FROM - 2) });
  const onFlanks = () => ({ x: (rng.next() < 0.5 ? -1 : 1) * rng.range(halfW - 6, halfW), z: rng.range(-30, 30) });

  const addMound = (x: number, z: number, height: number, footprint: number) => {
    // A sphere of radius r buried so its cap is `height` tall and `footprint` wide.
    const radius = (footprint * footprint + height * height) / (2 * height);
    mounds.push({ x, z, radius, height });
  };

  switch (terrain) {
    case "forest":
      for (let i = 0; i < 18; i++) {
        const p = i < 12 ? inMiddle() : onFlanks();
        obstacles.push({ kind: "tree", ...p, radius: rng.range(0.3, 0.5), height: rng.range(6, 9) });
      }
      break;
    case "hills":
      addMound(rng.range(-10, 10), rng.range(16, 24), rng.range(2.5, 3.5), 14);
      addMound(rng.range(-25, -12), rng.range(-6, 6), rng.range(1.5, 2.5), 10);
      addMound(rng.range(12, 25), rng.range(-6, 6), rng.range(1.5, 2.5), 10);
      for (let i = 0; i < 4; i++) obstacles.push({ kind: "rock", ...onFlanks(), radius: rng.range(0.8, 1.4) });
      break;
    case "mountains":
      addMound(rng.range(-20, -8), rng.range(-4, 4), rng.range(3, 4.5), 12);
      addMound(rng.range(8, 20), rng.range(-4, 4), rng.range(3, 4.5), 12);
      for (let i = 0; i < 12; i++) obstacles.push({ kind: "rock", ...(i < 6 ? inMiddle() : onFlanks()), radius: rng.range(1, 2.4) });
      break;
    case "desert":
      for (let i = 0; i < 4; i++) addMound(rng.range(-24, 24), rng.range(-8, 8), rng.range(1, 1.8), rng.range(8, 12));
      for (let i = 0; i < 3; i++) obstacles.push({ kind: "rock", ...onFlanks(), radius: rng.range(0.6, 1.1) });
      break;
    case "wasteland":
      for (let i = 0; i < 8; i++) obstacles.push({ kind: "rock", ...(i < 4 ? inMiddle() : onFlanks()), radius: rng.range(0.7, 1.6) });
      break;
    case "coast":
      for (let i = 0; i < 3; i++) obstacles.push({ kind: "rock", ...onFlanks(), radius: rng.range(0.6, 1.2) });
      break;
    case "plains":
      for (let i = 0; i < 3; i++) obstacles.push({ kind: "tree", ...onFlanks(), radius: 0.4, height: 7 });
      break;
  }

  if (fortified) {
    // A palisade in front of the defender's line, with gaps to charge through.
    const segment = 4.5;
    const gap = 3;
    for (let x = -halfW + segment / 2; x <= halfW - segment / 2; x += segment + gap) {
      obstacles.push({ kind: "wall", x, z: 11, halfLength: segment / 2, height: 1.6 });
    }
  }

  return { terrain, ground: GROUND[terrain], mounds, obstacles, water: terrain === "coast" };
}

/** Ground height at (x, z), matching the mound colliders. */
export function groundHeight(arena: ArenaLayout, x: number, z: number): number {
  let h = 0;
  for (const m of arena.mounds) {
    const dx = x - m.x;
    const dz = z - m.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= m.radius * m.radius) continue;
    const top = Math.sqrt(m.radius * m.radius - d2) - (m.radius - m.height);
    if (top > h) h = top;
  }
  return h;
}
