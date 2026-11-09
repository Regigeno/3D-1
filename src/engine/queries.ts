import {
  CAPITAL_GARRISON_SQUADS,
  CAPITAL_INCOME,
  FORT_GARRISON_SQUADS,
  LIBRARY_KNOWLEDGE,
  MARKET_GOLD,
  POWER_PLANT_ENERGY,
  POWER_PLANT_ENERGY_POWER_SITE,
  SCORE,
  SHRINE_MANA,
  SHRINE_MANA_LEY_LINE,
} from "./data/rules";
import { ERA_TIER, unitFor } from "./data/units";
import {
  MAIN_ERAS,
  MILITARY_TYPES,
  type Army,
  type Cost,
  type Era,
  type GameState,
  type MainEra,
  type MilitaryType,
  type Relation,
  type Resources,
  type ScenarioProvince,
} from "./types";

export function relationKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function relationBetween(state: GameState, a: string, b: string): Relation | undefined {
  return state.relations[relationKey(a, b)];
}

/** Neutral provinces (owner null) are always hostile territory. */
export function isHostile(state: GameState, faction: string, other: string | null): boolean {
  if (other === null) return true;
  if (other === faction) return false;
  return relationBetween(state, faction, other)?.status === "war";
}

export function isAllied(state: GameState, a: string, b: string): boolean {
  return a === b || relationBetween(state, a, b)?.status === "alliance";
}

export function scenarioProvince(state: GameState, id: string): ScenarioProvince {
  const p = state.scenario.provinces.find((sp) => sp.id === id);
  if (!p) throw new Error(`Unknown province ${id}`);
  return p;
}

export function armiesAt(state: GameState, province: string): Army[] {
  return Object.values(state.armies).filter((a) => a.location === province);
}

export function bestMainEra(state: GameState, faction: string, type: MilitaryType): MainEra {
  const unlocked = state.factions[faction]?.research[type] ?? [];
  let best: MainEra = "prehistoric";
  for (const era of MAIN_ERAS) if (unlocked.includes(era)) best = era;
  return best;
}

export function hasEra(state: GameState, faction: string, type: MilitaryType, era: Era): boolean {
  return state.factions[faction]?.research[type].includes(era) ?? false;
}

export function hasAnyModern(state: GameState, faction: string): boolean {
  return MILITARY_TYPES.some((t) => ERA_TIER[bestMainEra(state, faction, t)] >= ERA_TIER.modern);
}

export function canAfford(resources: Resources, cost: Cost): boolean {
  return (Object.keys(cost) as (keyof Resources)[]).every((k) => resources[k] >= (cost[k] ?? 0));
}

export function pay(resources: Resources, cost: Cost): void {
  for (const k of Object.keys(cost) as (keyof Resources)[]) resources[k] -= cost[k] ?? 0;
}

export function provinceIncome(state: GameState, provinceId: string): Resources {
  const p = state.provinces[provinceId];
  const sp = scenarioProvince(state, provinceId);
  const income: Resources = { gold: sp.baseIncome, knowledge: 0, mana: 0, energy: 0 };
  if (!p) return income;
  if (p.owner && state.factions[p.owner]?.capital === provinceId) {
    income.gold += CAPITAL_INCOME.gold;
    income.knowledge += CAPITAL_INCOME.knowledge;
  }
  if (p.buildings.includes("market")) income.gold += MARKET_GOLD;
  if (p.buildings.includes("library")) income.knowledge += LIBRARY_KNOWLEDGE;
  if (p.buildings.includes("shrine")) income.mana += sp.special === "ley-line" ? SHRINE_MANA_LEY_LINE : SHRINE_MANA;
  if (p.buildings.includes("power-plant")) {
    income.energy += sp.special === "power-site" ? POWER_PLANT_ENERGY_POWER_SITE : POWER_PLANT_ENERGY;
  }
  return income;
}

export function factionIncome(state: GameState, faction: string): Resources {
  const total: Resources = { gold: 0, knowledge: 0, mana: 0, energy: 0 };
  for (const [id, p] of Object.entries(state.provinces)) {
    if (p.owner !== faction) continue;
    const inc = provinceIncome(state, id);
    total.gold += inc.gold;
    total.knowledge += inc.knowledge;
    total.mana += inc.mana;
    total.energy += inc.energy;
  }
  return total;
}

export function armyUpkeep(army: Army): number {
  return army.squads.reduce((sum, s) => sum + unitFor(s.type, s.era).upkeep, 0);
}

export function factionUpkeep(state: GameState, faction: string): number {
  return Object.values(state.armies)
    .filter((a) => a.owner === faction)
    .reduce((sum, a) => sum + armyUpkeep(a), 0);
}

export function garrisonSquadCount(state: GameState, provinceId: string): number {
  const p = state.provinces[provinceId];
  if (!p?.owner) return 0;
  let count = 0;
  if (p.buildings.includes("fort")) count += FORT_GARRISON_SQUADS;
  if (state.factions[p.owner]?.capital === provinceId) count += CAPITAL_GARRISON_SQUADS;
  return count;
}

export function ownedProvinces(state: GameState, faction: string): string[] {
  return Object.entries(state.provinces)
    .filter(([, p]) => p.owner === faction)
    .map(([id]) => id);
}

/** Provinces a faction can currently see: its own and allies' territory and armies, plus their neighbors. */
export function visibleProvinces(state: GameState, faction: string): Set<string> {
  const seers = new Set(Object.keys(state.factions).filter((f) => isAllied(state, faction, f)));
  const seen = new Set<string>();
  const reveal = (id: string) => {
    seen.add(id);
    for (const n of scenarioProvince(state, id).neighbors) seen.add(n);
  };
  for (const [id, p] of Object.entries(state.provinces)) if (p.owner && seers.has(p.owner)) reveal(id);
  for (const a of Object.values(state.armies)) if (seers.has(a.owner)) reveal(a.location);
  return seen;
}

export function factionScore(state: GameState, faction: string): number {
  const f = state.factions[faction];
  if (!f) return 0;
  const provinces = ownedProvinces(state, faction).length;
  const squads = Object.values(state.armies)
    .filter((a) => a.owner === faction)
    .reduce((n, a) => n + a.squads.length, 0);
  const researchSteps = MILITARY_TYPES.reduce((n, t) => n + f.research[t].length - 1, 0);
  return provinces * SCORE.perProvince + squads * SCORE.perSquad + researchSteps * SCORE.perResearchStep;
}
