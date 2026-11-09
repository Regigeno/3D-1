import type { Building, Cost, Era, Resources, Terrain } from "../types";

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

export const MIN_PEACE_TURNS = 10;
export const TREATY_BREAK_TRUST_PENALTY = 30;

export const SCORE = {
  perProvince: 10,
  perSquad: 2,
  perResearchStep: 5,
};
