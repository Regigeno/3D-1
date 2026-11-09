import { describe, expect, it } from "vitest";
import { applyCommand } from "../commands";
import { resolveBattle, runPendingBattle } from "../battle";
import { relationBetween, visibleProvinces } from "../queries";
import { validateScenario } from "../setup";
import type { Command, GameState } from "../types";
import { armyOf, lineScenario, newLineGame } from "./fixtures";

function run(state: GameState, ...commands: Command[]): GameState {
  let s = state;
  for (const c of commands) {
    const r = applyCommand(s, c);
    if (!r.ok) throw new Error(`${c.kind} failed: ${r.error}`);
    s = r.state;
  }
  return s;
}

function expectError(state: GameState, command: Command, match: RegExp) {
  const r = applyCommand(state, command);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error).toMatch(match);
}

/** Ends turns until it is red's turn again with fresh movement. */
function nextRound(state: GameState): GameState {
  return run(state, { kind: "end-turn" }, { kind: "end-turn" });
}

describe("setup", () => {
  it("creates capitals, starting armies, and war between everyone", () => {
    const s = newLineGame();
    expect(s.provinces.A!.owner).toBe("red");
    expect(s.provinces.E!.owner).toBe("blue");
    expect(s.provinces.C!.owner).toBeNull();
    expect(armyOf(s, "red").squads.map((q) => q.type)).toEqual(["infantry", "infantry", "ranged"]);
    expect(relationBetween(s, "red", "blue")?.status).toBe("war");
    expect(s.activeFaction).toBe("red");
    expect(s.factions.red!.controller).toBe("human");
    expect(s.factions.blue!.controller).toBe("ai");
  });

  it("applies first-turn income minus upkeep", () => {
    const s = newLineGame();
    // 30 start + 2 base + 3 capital - 3 squads upkeep
    expect(s.factions.red!.resources.gold).toBe(32);
    expect(s.factions.red!.resources.knowledge).toBe(2);
  });

  it("rejects asymmetric neighbors", () => {
    const scenario = lineScenario();
    scenario.provinces[0]!.neighbors.push("C");
    expect(validateScenario(scenario).join()).toMatch(/not symmetric/);
  });
});

describe("recruiting and research", () => {
  it("recruits into the existing army and pays the cost", () => {
    const s = run(newLineGame(), { kind: "recruit", province: "A", type: "cavalry" });
    const army = armyOf(s, "red");
    expect(army.squads.at(-1)).toEqual({ type: "cavalry", era: "prehistoric", soldiers: 3 });
    expect(s.factions.red!.resources.gold).toBe(32 - 7);
  });

  it("requires a barracks and ownership", () => {
    expectError(newLineGame(), { kind: "recruit", province: "E", type: "infantry" }, /do not own/);
  });

  it("starts a new army once the existing one is full", () => {
    let s = newLineGame();
    s.factions.red!.resources.gold = 1000;
    for (let i = 0; i < 13; i++) s = run(s, { kind: "recruit", province: "A", type: "infantry" });
    const red = Object.values(s.armies).filter((a) => a.owner === "red");
    expect(red.map((a) => a.squads.length).sort()).toEqual([1, 15]);
  });

  it("enforces era order and knowledge cost", () => {
    const s = newLineGame();
    s.factions.red!.resources.knowledge = 100;
    expectError(s, { kind: "research", type: "ranged", era: "medieval" }, /ancient/);
    expectError(s, { kind: "research", type: "ranged", era: "fantastical" }, /Medieval/);
    const after = run(s, { kind: "research", type: "ranged", era: "ancient" }, { kind: "research", type: "ranged", era: "medieval" });
    expect(after.factions.red!.research.ranged).toEqual(["prehistoric", "ancient", "medieval"]);
    expect(after.factions.red!.resources.knowledge).toBe(70);
    const recruited = run(after, { kind: "recruit", province: "A", type: "ranged" });
    expect(armyOf(recruited, "red").squads.at(-1)?.era).toBe("medieval");
  });

  it("upgrades a squad to the best era and refills it", () => {
    let s = newLineGame();
    s.factions.red!.resources.knowledge = 100;
    s = run(s, { kind: "research", type: "infantry", era: "ancient" });
    s.armies[armyOf(s, "red").id]!.squads[0]!.soldiers = 1;
    s = run(s, { kind: "upgrade-squad", army: armyOf(s, "red").id, squad: 0 });
    expect(armyOf(s, "red").squads[0]).toEqual({ type: "infantry", era: "ancient", soldiers: 5 });
  });

  it("disbands squads and removes an army left empty", () => {
    const s = newLineGame();
    const id = armyOf(s, "red").id;
    const partial = run(s, { kind: "disband", army: id, squads: [0] });
    expect(partial.armies[id]!.squads.map((q) => q.type)).toEqual(["infantry", "ranged"]);
    const all = run(partial, { kind: "disband", army: id, squads: [0, 1] });
    expect(all.armies[id]).toBeUndefined();
  });

  it("gates power plants behind a Modern era", () => {
    const s = newLineGame();
    s.factions.red!.resources.gold = 100;
    expectError(s, { kind: "build", province: "A", building: "power-plant" }, /Modern/);
    const built = run(s, { kind: "build", province: "A", building: "library" });
    expect(built.provinces.A!.buildings).toContain("library");
  });
});

describe("movement", () => {
  it("captures neutral provinces and ends movement", () => {
    let s = nextRound(newLineGame());
    const id = armyOf(s, "red").id;
    s = run(s, { kind: "move", army: id, to: "B" });
    expect(s.provinces.B!.owner).toBe("red");
    expect(s.armies[id]!.movementLeft).toBe(0);
    expectError(s, { kind: "move", army: id, to: "C" }, /already moved|movement/);
  });

  it("lets a full-movement army enter 3-cost mountains", () => {
    let s = nextRound(newLineGame());
    s = run(s, { kind: "move", army: armyOf(s, "red").id, to: "F" });
    expect(s.provinces.F!.owner).toBe("red");
  });

  it("spends movement in friendly territory", () => {
    let s = nextRound(newLineGame());
    const id = armyOf(s, "red").id;
    s.provinces.B!.owner = "red";
    s = run(s, { kind: "move", army: id, to: "B" });
    expect(s.armies[id]!.movementLeft).toBe(1);
    s = run(s, { kind: "move", army: id, to: "A" });
    expect(s.armies[id]!.movementLeft).toBe(0);
  });

  it("only moves to neighbors", () => {
    const s = nextRound(newLineGame());
    expectError(s, { kind: "move", army: armyOf(s, "red").id, to: "C" }, /neighboring/);
  });

  it("splits and merges armies", () => {
    let s = newLineGame();
    const id = armyOf(s, "red").id;
    s = run(s, { kind: "split", army: id, squads: [2] });
    const red = Object.values(s.armies).filter((a) => a.owner === "red");
    expect(red.map((a) => a.squads.length).sort()).toEqual([1, 2]);
    s = run(s, { kind: "merge", armies: red.map((a) => a.id) });
    expect(Object.values(s.armies).filter((a) => a.owner === "red")).toHaveLength(1);
  });
});

describe("battles", () => {
  function redNextToBlueCapital(): GameState {
    let s = nextRound(newLineGame());
    for (const p of ["B", "C", "D"]) s.provinces[p]!.owner = "red";
    const army = armyOf(s, "red");
    army.location = "D";
    army.movementLeft = 2;
    const blue = armyOf(s, "blue");
    delete s.armies[blue.id];
    return s;
  }

  it("starts a battle against the capital garrison and blocks other commands", () => {
    const s = run(redNextToBlueCapital(), { kind: "move", army: armyOf(redNextToBlueCapital(), "red").id, to: "E" });
    expect(s.pendingBattle?.defender.faction).toBe("blue");
    expect(s.pendingBattle?.defender.squads).toHaveLength(2);
    expectError(s, { kind: "end-turn" }, /battle/);
  });

  it("captures the province and eliminates the loser when the attacker wins", () => {
    const s = run(redNextToBlueCapital(), { kind: "move", army: armyOf(redNextToBlueCapital(), "red").id, to: "E" });
    const r = resolveBattle(s, {
      winner: "attacker",
      attackerSurvivors: [5, 3, 0],
      defenderSurvivors: [0, 0],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.provinces.E!.owner).toBe("red");
    expect(armyOf(r.state, "red").squads).toHaveLength(2);
    expect(armyOf(r.state, "red").location).toBe("E");
    expect(r.state.factions.blue!.alive).toBe(false);
    expect(r.state.winner).toBe("red");
  });

  it("sends the attacker back when the defender wins", () => {
    const s = run(redNextToBlueCapital(), { kind: "move", army: armyOf(redNextToBlueCapital(), "red").id, to: "E" });
    const r = resolveBattle(s, { winner: "defender", attackerSurvivors: [1, 0, 0], defenderSurvivors: [2, 5] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(armyOf(r.state, "red").location).toBe("D");
    expect(r.state.provinces.E!.owner).toBe("blue");
  });

  it("resolves deterministically with the placeholder resolver", () => {
    const s = run(redNextToBlueCapital(), { kind: "move", army: armyOf(redNextToBlueCapital(), "red").id, to: "E" });
    const a = runPendingBattle(s);
    const b = runPendingBattle(s);
    expect(a).toEqual(b);
  });
});

describe("turns and economy", () => {
  it("rotates factions and increments the turn after everyone has played", () => {
    let s = run(newLineGame(), { kind: "end-turn" });
    expect(s.activeFaction).toBe("blue");
    expect(s.turn).toBe(1);
    s = run(s, { kind: "end-turn" });
    expect(s.activeFaction).toBe("red");
    expect(s.turn).toBe(2);
  });

  it("deserts squads when upkeep cannot be paid", () => {
    let s = newLineGame();
    s.factions.blue!.resources.gold = -5;
    const before = armyOf(s, "blue").squads.length;
    const r = applyCommand(s, { kind: "end-turn" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events.some((e) => e.kind === "desertion")).toBe(true);
    expect(r.state.factions.blue!.resources.gold).toBeGreaterThanOrEqual(0);
    const after = Object.values(r.state.armies).find((a) => a.owner === "blue")?.squads.length ?? 0;
    expect(after).toBeLessThan(before);
  });

  it("limits fog of war to owned land, armies, and their neighbors", () => {
    const seen = visibleProvinces(newLineGame(), "red");
    expect([...seen].sort()).toEqual(["A", "B", "F"]);
  });

  it("wins by score after the turn limit", () => {
    let s = newLineGame({ victory: { kind: "score", turnLimit: 2 } });
    s.provinces.B!.owner = "red";
    for (let i = 0; i < 4; i++) s = run(s, { kind: "end-turn" });
    expect(s.winner).toBe("red");
  });
});

describe("diplomacy", () => {
  it("makes peace through a proposal and blocks early war", () => {
    let s = run(newLineGame(), { kind: "diplomacy", target: "blue", action: "propose-peace" }, { kind: "end-turn" });
    s = run(s, { kind: "respond-proposal", from: "red", accept: true }, { kind: "end-turn" });
    expect(relationBetween(s, "red", "blue")?.status).toBe("peace");
    expectError(s, { kind: "diplomacy", target: "blue", action: "declare-war" }, /10 turns/);
    s = run(s, { kind: "move", army: armyOf(s, "red").id, to: "B" });
    s.provinces.D!.owner = "blue";
    s.armies[armyOf(s, "red").id]!.location = "C";
    s.armies[armyOf(s, "red").id]!.movementLeft = 2;
    expectError(s, { kind: "move", army: armyOf(s, "red").id, to: "D" }, /peace/);
  });

  it("requires peace before an alliance", () => {
    expectError(newLineGame(), { kind: "diplomacy", target: "blue", action: "propose-alliance" }, /peace first/);
  });

  it("drops unanswered proposals when the proposer's turn comes back", () => {
    let s = run(newLineGame(), { kind: "diplomacy", target: "blue", action: "propose-peace" });
    s = nextRound(s);
    expect(s.proposals).toHaveLength(0);
  });
});

describe("immutability", () => {
  it("never mutates the input state", () => {
    const s = newLineGame();
    const snapshot = structuredClone(s);
    applyCommand(s, { kind: "recruit", province: "A", type: "infantry" });
    applyCommand(s, { kind: "end-turn" });
    expect(s).toEqual(snapshot);
  });
});
