import { describe, expect, it } from "vitest";
import { playAiTurn, type BattleSettler } from "../ai";
import { knownDefenders } from "../ai/evaluate";
import { runPendingBattle } from "../battle";
import { MAX_SQUADS_PER_ARMY } from "../data/units";
import { generateRandomScenario } from "../mapgen";
import { ownedProvinces, visibleProvinces } from "../queries";
import { createGame } from "../setup";
import type { Difficulty, GameState } from "../types";
import { newLineGame } from "./fixtures";

const settle: BattleSettler = (state) => {
  const result = runPendingBattle(state);
  if (!result.ok) throw new Error(result.error);
  return { state: result.state, events: result.events };
};

function allAiGame(seed: number, difficulty: Difficulty = "normal", provinces = 30, factions = 4): GameState {
  const scenario = generateRandomScenario({ seed, provinces, factions });
  return createGame(scenario, { seed, difficulty, victory: { kind: "domination", percent: 70 } }).state;
}

function playOut(state: GameState, maxTurns = 120): { state: GameState; rounds: number } {
  let s = state;
  let factionTurns = 0;
  while (!s.winner && s.turn <= maxTurns) {
    const before = s.activeFaction;
    s = playAiTurn(s, settle).state;
    expect(s.pendingBattle).toBeNull();
    if (!s.winner) expect(s.activeFaction).not.toBe(before);
    for (const a of Object.values(s.armies)) expect(a.squads.length).toBeLessThanOrEqual(MAX_SQUADS_PER_ARMY);
    for (const f of Object.values(s.factions)) expect(f.resources.gold).toBeGreaterThanOrEqual(0);
    factionTurns++;
  }
  return { state: s, rounds: s.turn };
}

describe("opponent AI", () => {
  it("expands into neutral land on its first turns", () => {
    let s = allAiGame(3);
    const start = Object.fromEntries(s.factionOrder.map((f) => [f, ownedProvinces(s, f).length]));
    for (let i = 0; i < s.factionOrder.length * 3; i++) s = playAiTurn(s, settle).state;
    for (const f of s.factionOrder) expect(ownedProvinces(s, f).length).toBeGreaterThan(start[f]!);
  });

  it("only issues commands the engine accepts and always ends its turn", () => {
    const s = allAiGame(11);
    const { state, commands } = playAiTurn(s, settle);
    expect(commands.at(-1)).toEqual({ kind: "end-turn" });
    expect(state.activeFaction).not.toBe(s.activeFaction);
  });

  it("finishes an all-computer game with a winner, deterministically", () => {
    for (const seed of [5, 21]) {
      const a = playOut(allAiGame(seed));
      expect(a.state.winner).not.toBeNull();
      expect(playOut(allAiGame(seed)).state).toEqual(a.state);
    }
  }, 120_000);

  it("gives computer factions more income on hard and less on easy", () => {
    const gold = (difficulty: Difficulty) => {
      // Blue (AI) collects income when red ends its first turn.
      const s = newLineGame({ difficulty });
      const blueBefore = s.factions.blue!.resources.gold;
      const result = playAiTurn({ ...s, factions: { ...s.factions, red: { ...s.factions.red!, controller: "ai" } } }, settle);
      return result.state.factions.blue!.resources.gold - blueBefore;
    };
    expect(gold("hard")).toBeGreaterThan(gold("normal"));
    expect(gold("normal")).toBeGreaterThan(gold("easy"));
  });

  it("does not see armies or forts hidden by fog of war", () => {
    const s = newLineGame();
    s.provinces.D = { owner: "blue", buildings: ["fort"] };
    const blueArmy = Object.values(s.armies).find((a) => a.owner === "blue")!;
    blueArmy.location = "D";
    const visible = visibleProvinces(s, "red");
    expect(visible.has("D")).toBe(false);
    expect(knownDefenders(s, "red", "D", visible)).toEqual([]);
    expect(knownDefenders(s, "red", "E", visible).length).toBeGreaterThan(0);
    expect(knownDefenders(s, "blue", "D", visibleProvinces(s, "blue"))).toEqual([]);
  });
});
