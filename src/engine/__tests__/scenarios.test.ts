import { describe, expect, it } from "vitest";
import {
  applyCommand,
  createGame,
  nextAiCommand,
  placeholderResolver,
  PRESETS,
  presetScenario,
  rejectAiCommand,
  resolveBattle,
  scenarioProvince,
  startAiTurn,
  validateScenario,
  type Scenario,
} from "../index";

function distances(scenario: Scenario, from: string): Map<string, number> {
  const byId = new Map(scenario.provinces.map((p) => [p.id, p]));
  const dist = new Map([[from, 0]]);
  const queue = [from];
  while (queue.length) {
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

const adjacent = (s: Scenario, a: string, b: string) => s.provinces.find((p) => p.id === a)!.neighbors.includes(b);

describe.each(PRESETS.map((p) => [p.name, p.id]))("preset %s", (_, id) => {
  const scenario = presetScenario(id);

  it("is a valid, connected map of 30 to 60 provinces", () => {
    expect(validateScenario(scenario)).toEqual([]);
    expect(scenario.provinces.length).toBeGreaterThanOrEqual(30);
    expect(scenario.provinces.length).toBeLessThanOrEqual(60);
    expect(distances(scenario, scenario.provinces[0]!.id).size).toBe(scenario.provinces.length);
    expect(new Set(scenario.provinces.map((p) => p.name)).size).toBe(scenario.provinces.length);
  });

  it("keeps capitals at least three moves apart", () => {
    for (const a of scenario.factions) {
      const d = distances(scenario, a.capital);
      for (const b of scenario.factions) if (a !== b) expect(d.get(b.capital)).toBeGreaterThanOrEqual(3);
    }
  });

  it("can be played by the AI", () => {
    let { state } = createGame(scenario, { seed: 3, difficulty: "normal", victory: { kind: "domination", percent: 70 } });
    const turns = 4 * scenario.factions.length;
    for (let t = 0; t < turns && !state.winner; t++) {
      const turn = startAiTurn(state);
      for (let i = 0; i < 400; i++) {
        const command = i === 399 ? ({ kind: "end-turn" } as const) : nextAiCommand(state, turn);
        const result = applyCommand(state, command);
        if (!result.ok) {
          rejectAiCommand(turn, command);
          continue;
        }
        state = result.state;
        while (state.pendingBattle) {
          const battle = state.pendingBattle;
          const resolved = resolveBattle(state, placeholderResolver(battle, scenarioProvince(state, battle.province).terrain));
          if (!resolved.ok) throw new Error(resolved.error);
          state = resolved.state;
        }
        if (command.kind === "end-turn") break;
      }
    }
    expect(state.turn).toBeGreaterThanOrEqual(4);
    const owned = Object.values(state.provinces).filter((p) => p.owner).length;
    expect(owned).toBeGreaterThan(scenario.factions.length * 2);
  });
});

describe("Fantasy Earth geography", () => {
  const s = presetScenario("fantasy-earth");

  it("joins the continents by land bridges", () => {
    for (const [a, b] of [
      ["hudsonia", "baffin"],
      ["baffin", "greenland"],
      ["greenland", "thule"],
      ["thule", "albion"],
      ["iberia", "maghreb"],
      ["kemet", "canaan"],
      ["mayapan", "eldorado"],
      ["siam", "spice"],
      ["spice", "outback"],
    ]) {
      expect(adjacent(s, a!, b!), `${a} - ${b}`).toBe(true);
    }
  });

  it("keeps the seas", () => {
    for (const [a, b] of [
      ["italia", "kemet"],
      ["mali", "bahia"],
      ["arabia", "hindustan"],
      ["atlantica", "albion"],
    ]) {
      expect(adjacent(s, a!, b!), `${a} - ${b}`).toBe(false);
    }
  });
});

describe("The Shattered Crown geography", () => {
  const s = presetScenario("shattered-crown");

  it("breaks the ring at the Sundering and reaches the Crown Isle by its two spans", () => {
    expect(adjacent(s, "i3", "i5")).toBe(false);
    expect(adjacent(s, "o3", "o5")).toBe(false);
    expect([...s.provinces.find((p) => p.id === "crown")!.neighbors].sort()).toEqual(["north-span", "south-span"]);
    expect(adjacent(s, "north-span", "i0")).toBe(true);
    expect(adjacent(s, "south-span", "i8")).toBe(true);
  });
});
