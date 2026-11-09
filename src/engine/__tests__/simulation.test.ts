import { describe, expect, it } from "vitest";
import { runPendingBattle } from "../battle";
import { applyCommand } from "../commands";
import { MAX_SQUADS_PER_ARMY, SQUAD_SIZE } from "../data/units";
import { generateRandomScenario } from "../mapgen";
import { ownedProvinces, scenarioProvince } from "../queries";
import { Rng } from "../rng";
import { createGame, validateScenario } from "../setup";
import { MILITARY_TYPES, type Command, type GameState } from "../types";

describe("random map generator", () => {
  it("produces valid, connected, deterministic scenarios", () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const scenario = generateRandomScenario({ seed, provinces: 45, factions: 5 });
      expect(validateScenario(scenario)).toEqual([]);
      expect(scenario.provinces).toHaveLength(45);
      expect(new Set(scenario.factions.map((f) => f.capital)).size).toBe(5);

      const seen = new Set([scenario.provinces[0]!.id]);
      const queue = [scenario.provinces[0]!.id];
      while (queue.length) {
        const id = queue.shift();
        const p = scenario.provinces.find((q) => q.id === id)!;
        for (const n of p.neighbors) {
          if (!seen.has(n)) {
            seen.add(n);
            queue.push(n);
          }
        }
      }
      expect(seen.size).toBe(45);

      for (const p of scenario.provinces) {
        expect(p.polygon!.length).toBeGreaterThanOrEqual(3);
        const xs = p.polygon!.map(([x]) => x);
        const ys = p.polygon!.map(([, y]) => y);
        expect(p.position.x).toBeGreaterThanOrEqual(Math.min(...xs));
        expect(p.position.x).toBeLessThanOrEqual(Math.max(...xs));
        expect(p.position.y).toBeGreaterThanOrEqual(Math.min(...ys));
        expect(p.position.y).toBeLessThanOrEqual(Math.max(...ys));
      }
      expect(generateRandomScenario({ seed, provinces: 45, factions: 5 })).toEqual(scenario);
    }
  });
});

/** A dumb random bot. Good enough to shake out rule bugs; the real AI comes in step 5. */
function randomBotTurn(state: GameState, rng: Rng): GameState {
  let s = state;
  const me = s.activeFaction;
  const tryCommand = (c: Command) => {
    const r = applyCommand(s, c);
    if (r.ok) s = r.state;
    if (s.pendingBattle) {
      const b = runPendingBattle(s);
      if (!b.ok) throw new Error(b.error);
      s = b.state;
    }
  };

  const faction = s.factions[me]!;
  tryCommand({ kind: "research", type: rng.pick(MILITARY_TYPES), era: rng.pick(["ancient", "medieval", "modern", "futuristic", "fantastical"] as const) });
  if (rng.next() < 0.3) tryCommand({ kind: "build", province: faction.capital, building: rng.pick(["market", "library", "fort", "shrine"] as const) });
  for (let i = 0; i < 3; i++) tryCommand({ kind: "recruit", province: faction.capital, type: rng.pick(MILITARY_TYPES) });

  for (const army of Object.values(s.armies).filter((a) => a.owner === me)) {
    if (s.winner) break;
    const current = s.armies[army.id];
    if (!current) continue;
    tryCommand({ kind: "move", army: army.id, to: rng.pick(scenarioProvince(s, current.location).neighbors) });
  }
  if (!s.winner) tryCommand({ kind: "end-turn" });
  return s;
}

function checkInvariants(s: GameState) {
  for (const f of Object.values(s.factions)) {
    expect(f.resources.gold).toBeGreaterThanOrEqual(0);
    expect(f.resources.knowledge).toBeGreaterThanOrEqual(0);
    expect(f.alive).toBe(ownedProvinces(s, f.id).length > 0);
  }
  for (const a of Object.values(s.armies)) {
    expect(a.squads.length).toBeGreaterThan(0);
    expect(a.squads.length).toBeLessThanOrEqual(MAX_SQUADS_PER_ARMY);
    expect(s.factions[a.owner]!.alive).toBe(true);
    for (const q of a.squads) {
      expect(q.soldiers).toBeGreaterThan(0);
      expect(q.soldiers).toBeLessThanOrEqual(SQUAD_SIZE[q.type]);
    }
    expect(s.provinces[a.location]).toBeDefined();
  }
  expect(s.factions[s.activeFaction]!.alive).toBe(true);
  expect(s.pendingBattle).toBeNull();
}

describe("full-game simulation", () => {
  it("plays many random turns without breaking invariants, and replays identically", () => {
    const play = (seed: number) => {
      const scenario = generateRandomScenario({ seed, provinces: 30, factions: 4 });
      let s = createGame(scenario, { seed, difficulty: "normal", victory: { kind: "domination", percent: 70 } }).state;
      const rng = new Rng(seed);
      for (let i = 0; i < 400 && !s.winner; i++) {
        s = randomBotTurn(s, rng);
        checkInvariants(s);
      }
      return s;
    };

    for (const seed of [7, 8, 9]) {
      const a = play(seed);
      expect(play(seed)).toEqual(a);
    }
  });
});
