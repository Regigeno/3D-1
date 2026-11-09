import { createGame } from "../setup";
import type { GameOptions, GameState, Scenario } from "../types";

/**
 * A tiny line map:  F(mtn) - A(red cap) - B - C - D - E(blue cap)
 */
export function lineScenario(): Scenario {
  const link = (id: string, neighbors: string[], terrain: Scenario["provinces"][number]["terrain"] = "plains") => ({
    id,
    name: id,
    terrain,
    neighbors,
    baseIncome: 2,
    position: { x: 0, y: 0 },
  });
  return {
    id: "line",
    name: "Line",
    kind: "fictional",
    provinces: [
      link("F", ["A"], "mountains"),
      link("A", ["F", "B"]),
      link("B", ["A", "C"]),
      link("C", ["B", "D"], "forest"),
      link("D", ["C", "E"]),
      link("E", ["D"]),
    ],
    factions: [
      { id: "red", name: "Red", color: "#f00", capital: "A" },
      { id: "blue", name: "Blue", color: "#00f", capital: "E" },
    ],
  };
}

export const defaultOptions: GameOptions = {
  seed: 42,
  difficulty: "normal",
  victory: { kind: "domination", percent: 100 },
  controllers: { red: "human" },
};

export function newLineGame(options: Partial<GameOptions> = {}): GameState {
  return createGame(lineScenario(), { ...defaultOptions, ...options }).state;
}

export function armyOf(state: GameState, faction: string) {
  const army = Object.values(state.armies).find((a) => a.owner === faction);
  if (!army) throw new Error(`No army for ${faction}`);
  return army;
}
