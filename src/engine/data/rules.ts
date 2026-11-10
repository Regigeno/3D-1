import type { Building, Cost, Difficulty, Era, Resources, Terrain } from "../types";

export const STARTING_RESOURCES: Resources = { gold: 30, knowledge: 0, mana: 0, energy: 0 };
export const STARTING_BUILDINGS: Building[] = ["barracks"];
export const STARTING_ARMY = { infantry: 2, ranged: 1 } as const;

export const ARMY_MOVEMENT = 2;

export const MOVE_COST: Record<Terrain, number> = {
  plains: 1,
  coast: 1,
  wasteland: 1,
  forest: 2,
  hills: 2,
  desert: 2,
  mountains: 3,
};

export const CAPITAL_INCOME: Resources = { gold: 3, knowledge: 2, mana: 0, energy: 0 };

export const BUILDING_COST: Record<Building, Cost> = {
  market: { gold: 15 },
  library: { gold: 15 },
  shrine: { gold: 15 },
  "power-plant": { gold: 25 },
  fort: { gold: 20 },
  barracks: { gold: 10 },
};

export const MARKET_GOLD = 3;
export const LIBRARY_KNOWLEDGE = 3;
export const SHRINE_MANA = 1;
export const SHRINE_MANA_LEY_LINE = 3;
export const POWER_PLANT_ENERGY = 1;
export const POWER_PLANT_ENERGY_POWER_SITE = 3;

/** Garrison infantry squads that defend a province with no army in it. */
export const FORT_GARRISON_SQUADS = 3;
export const CAPITAL_GARRISON_SQUADS = 2;

export const RESEARCH_COST: Record<Exclude<Era, "prehistoric">, number> = {
  ancient: 10,
  medieval: 20,
  modern: 35,
  futuristic: 55,
  fantastical: 30,
};

/**
 * How sharply a computer faction plays. Income is the same on every difficulty
 * except Petty, which taxes the human player. The AI never sees through fog.
 */
export interface DifficultyMind {
  /** Added to the personality's attack threshold. Higher means they only take sure fights. */
  attackShift: number;
  /** Chance to skip a planning step, so they expand and build more slowly. */
  skipPhase: number;
  /** How far they look through friendly land for a target. */
  searchDepth: number;
  /** Recruit counters to what they can see, instead of a flat mix. */
  counters: boolean;
  /** Split armies to grab several empty provinces at once. */
  splits: boolean;
  /** Open wars, break treaties, and bargain. When false, they accept every offer. */
  schemes: boolean;
}

export const DIFFICULTY_MIND: Record<Difficulty, DifficultyMind> = {
  beginner: { attackShift: 0.4, skipPhase: 0.55, searchDepth: 1, counters: false, splits: false, schemes: false },
  easy: { attackShift: 0.22, skipPhase: 0.3, searchDepth: 3, counters: false, splits: false, schemes: false },
  normal: { attackShift: 0, skipPhase: 0, searchDepth: 8, counters: true, splits: true, schemes: true },
  hard: { attackShift: -0.12, skipPhase: 0, searchDepth: 12, counters: true, splits: true, schemes: true },
  petty: { attackShift: -0.12, skipPhase: 0, searchDepth: 12, counters: true, splits: true, schemes: true },
};

/** Petty is the one difficulty that changes income: the human earns 15% less. */
export const PLAYER_HANDICAP = 0.85;

/** People a province starts with, before the capital bonus. */
export const TERRAIN_POPULATION: Record<Terrain, number> = {
  plains: 12,
  coast: 10,
  forest: 8,
  hills: 8,
  desert: 6,
  wasteland: 5,
  mountains: 4,
};

export const CAPITAL_POPULATION_BONUS = 8;
/** People spent to raise one squad. */
export const POP_PER_SQUAD = 4;
export const POPULATION_CAP = 30;
export const BARRACKS_POPULATION_BONUS = 6;

export function startingPopulation(terrain: Terrain, capital: boolean): number {
  return TERRAIN_POPULATION[terrain] + (capital ? CAPITAL_POPULATION_BONUS : 0);
}

export function populationGrowth(buildings: readonly Building[]): number {
  let growth = 1;
  if (buildings.includes("market")) growth += 1;
  if (buildings.includes("barracks")) growth += 1;
  return growth;
}

export function populationCap(buildings: readonly Building[]): number {
  return POPULATION_CAP + (buildings.includes("barracks") ? BARRACKS_POPULATION_BONUS : 0);
}

export const MIN_PEACE_TURNS = 10;
export const TREATY_BREAK_TRUST_PENALTY = 30;

export const SCORE = {
  perProvince: 10,
  perSquad: 2,
  perResearchStep: 5,
};
