import { MAIN_ERAS, MILITARY_TYPES, hasEra, rules, type Era, type GameState, type MilitaryType } from "../engine";
import { ERA_LABEL } from "./describe";

export type CellStatus = "researched" | "available" | "locked";

export interface ResearchCell {
  type: MilitaryType;
  era: Era;
  status: CellStatus;
  cost: number;
  /** What must be researched first, when locked. */
  requires: string | null;
}

export function prerequisite(era: Era): Era | null {
  if (era === "prehistoric") return null;
  if (era === "fantastical") return "medieval";
  return MAIN_ERAS[MAIN_ERAS.indexOf(era) - 1]!;
}

export function researchCell(state: GameState, faction: string, type: MilitaryType, era: Era): ResearchCell {
  const cost = era === "prehistoric" ? 0 : rules.RESEARCH_COST[era];
  if (hasEra(state, faction, type, era)) return { type, era, status: "researched", cost, requires: null };
  const before = prerequisite(era)!;
  if (!hasEra(state, faction, type, before)) {
    return { type, era, status: "locked", cost, requires: `${ERA_LABEL[before]} ${type}` };
  }
  return { type, era, status: "available", cost, requires: null };
}

/** Research steps the faction could buy right now. */
export function affordableResearch(state: GameState, faction: string): ResearchCell[] {
  const knowledge = state.factions[faction]?.resources.knowledge ?? 0;
  return MILITARY_TYPES.flatMap((type) =>
    [...MAIN_ERAS, "fantastical" as const].map((era) => researchCell(state, faction, type, era)),
  ).filter((c) => c.status === "available" && c.cost <= knowledge);
}
