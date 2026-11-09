import { describe, expect, it } from "vitest";
import { playAiTurn, type BattleSettler } from "../ai";
import { knownDefenders } from "../ai/evaluate";
import { runPendingBattle } from "../battle";
import { MAX_SQUADS_PER_ARMY } from "../data/units";
import { generateRandomScenario } from "../mapgen";
import { applyCommand } from "../commands";
import { ownedProvinces, relationBetween, visibleProvinces } from "../queries";
import { createGame } from "../setup";
import type { Difficulty, GameState } from "../types";
import { armyOf, newLineGame } from "./fixtures";

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

  it("sues a much stronger human neighbor for peace, and the human can accept", () => {
    const s = newLineGame();
    s.turn = 3;
    s.activeFaction = "blue";
    s.provinces.B = { owner: "red", buildings: [] };
    s.provinces.C = { owner: "red", buildings: [] };
    s.provinces.D = { owner: "blue", buildings: [] };
    const red = armyOf(s, "red");
    red.location = "C";
    red.squads = Array.from({ length: MAX_SQUADS_PER_ARMY }, () => ({ type: "infantry" as const, era: "medieval" as const, soldiers: 10 }));
    const { state, commands } = playAiTurn(s, settle);
    expect(commands).toContainEqual({ kind: "diplomacy", target: "red", action: "propose-peace" });
    expect(state.proposals).toContainEqual(expect.objectContaining({ from: "blue", to: "red", kind: "peace" }));

    const accepted = applyCommand(state, { kind: "respond-proposal", from: "blue", accept: true });
    expect(accepted.ok && relationBetween(accepted.state, "red", "blue")?.status).toBe("peace");
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
