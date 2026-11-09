import { factionScore, ownedProvinces, type GameState, type VictoryCondition } from "../engine";

export const VICTORY_LABEL: Record<VictoryCondition["kind"], string> = {
  domination: "Domination",
  capitals: "Capitals",
  score: "Score",
};

/** A one-line goal for the top bar, e.g. "Hold 28 provinces: 9/28". */
export function victoryGoal(state: GameState, faction: string): { text: string; detail: string } {
  const v = state.options.victory;
  if (v.kind === "domination") {
    const needed = Math.ceil((state.scenario.provinces.length * v.percent) / 100);
    return {
      text: `Hold ${needed} provinces: ${ownedProvinces(state, faction).length}/${needed}`,
      detail: `Domination: win by controlling ${v.percent}% of all provinces.`,
    };
  }
  if (v.kind === "capitals") {
    const capitals = state.scenario.factions.map((f) => f.capital);
    const held = capitals.filter((c) => state.provinces[c]?.owner === faction).length;
    return { text: `Capitals: ${held}/${capitals.length}`, detail: "Capitals: win by holding every capital on the map." };
  }
  const left = Math.max(0, v.turnLimit - state.turn + 1);
  return {
    text: `Score ${factionScore(state, faction)} · ${left} turn${left === 1 ? "" : "s"} left`,
    detail: `Score: the highest score after turn ${v.turnLimit} wins. Provinces, squads and research all count.`,
  };
}

export interface Standing {
  faction: string;
  name: string;
  color: string;
  alive: boolean;
  provinces: number;
  score: number;
}

export function standings(state: GameState): Standing[] {
  return state.factionOrder
    .map((id) => {
      const f = state.factions[id]!;
      return { faction: id, name: f.name, color: f.color, alive: f.alive, provinces: ownedProvinces(state, id).length, score: factionScore(state, id) };
    })
    .sort((a, b) => Number(b.alive) - Number(a.alive) || b.score - a.score);
}
