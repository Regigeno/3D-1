import { describe, expect, it } from "vitest";
import { lineScenario } from "../../engine/__tests__/fixtures";
import { GameSession } from "../session";

function readySession(): GameSession {
  const session = GameSession.fromScenario(lineScenario(), 1);
  session.dispatch({ kind: "end-turn" });
  return session;
}

function redArmy(session: GameSession) {
  return Object.values(session.state.armies).find((a) => a.owner === "red")!;
}

describe("GameSession", () => {
  it("passes AI turns and returns control to the human", () => {
    const session = readySession();
    expect(session.state.activeFaction).toBe("red");
    expect(session.state.turn).toBe(2);
    expect(session.isHumanTurn).toBe(true);
  });

  it("classifies move targets", () => {
    const session = readySession();
    session.state.provinces.F!.owner = "red";
    const targets = session.moveTargets(redArmy(session).id);
    expect(targets.get("F")).toBe("move");
    expect(targets.get("B")).toBe("capture");

    session.state.provinces.B!.owner = "blue";
    session.state.provinces.B!.buildings.push("fort");
    expect(session.moveTargets(redArmy(session).id).get("B")).toBe("attack");
  });

  it("moves the selected army when a target province is clicked", () => {
    const session = readySession();
    session.selectArmy(redArmy(session).id);
    session.clickProvince("B");
    expect(redArmy(session).location).toBe("B");
    expect(session.state.provinces.B!.owner).toBe("red");
    expect(session.selection).toEqual({ province: "B", army: redArmy(session).id });
    expect(session.log.at(-1)?.text).toMatch(/took B/);
  });

  it("selects a province instead when the click is not a legal move", () => {
    const session = readySession();
    session.selectArmy(redArmy(session).id);
    session.clickProvince("D");
    expect(session.selection).toEqual({ province: "D", army: null });
  });

  it("resolves battles immediately so play can continue", () => {
    const session = readySession();
    session.state.provinces.B!.owner = "blue";
    session.state.provinces.B!.buildings.push("fort");
    session.selectArmy(redArmy(session).id);
    session.clickProvince("B");
    expect(session.state.pendingBattle).toBeNull();
    expect(session.log.some((e) => e.text.startsWith("Battle at B"))).toBe(true);
  });

  it("keeps a battle report for battles a human fought", () => {
    const session = readySession();
    session.state.provinces.B!.owner = "blue";
    session.state.provinces.B!.buildings.push("fort");
    session.selectArmy(redArmy(session).id);
    session.clickProvince("B");
    const report = session.battleReport!;
    expect(report.battle.province).toBe("B");
    expect(report.result.attackerSurvivors).toHaveLength(report.battle.attacker.squads.length);
    session.dismissBattleReport();
    expect(session.battleReport).toBeNull();
  });

  it("lets the computer attack and queues the report for the human", () => {
    const session = readySession();
    redArmy(session).squads = [{ type: "infantry", era: "prehistoric", soldiers: 1 }];
    const blue = Object.values(session.state.armies).find((a) => a.owner === "blue")!;
    session.state.provinces.B!.owner = "blue";
    blue.location = "B";
    blue.squads = Array.from({ length: 8 }, () => ({ type: "cavalry" as const, era: "medieval" as const, soldiers: 3 }));
    session.dispatch({ kind: "end-turn" });
    expect(session.battleReport?.battle.province).toBe("A");
    expect(session.battleReport?.battle.attacker.faction).toBe("blue");
  });

  it("hides what computer factions do out of sight", () => {
    const session = readySession();
    for (let i = 0; i < 4; i++) session.dispatch({ kind: "end-turn" });
    const texts = session.log.map((e) => e.text);
    expect(texts.some((t) => /^Blue (recruited|unlocked|built)/.test(t))).toBe(false);
    expect(texts.some((t) => t.startsWith("Turn ") && t.includes("Blue"))).toBe(false);
  });

  it("starts games with the chosen difficulty and victory condition", () => {
    const session = GameSession.newRandomGame({
      seed: 4,
      provinces: 20,
      factions: 3,
      difficulty: "hard",
      victory: { kind: "score", turnLimit: 30 },
    });
    expect(session.state.options.difficulty).toBe("hard");
    expect(session.state.options.victory).toEqual({ kind: "score", turnLimit: 30 });
    expect(session.isHumanTurn).toBe(true);
  });

  it("checks commands without applying them", () => {
    const session = readySession();
    const before = session.state;
    expect(session.check({ kind: "recruit", province: "A", type: "infantry" })).toBeNull();
    expect(session.check({ kind: "build", province: "A", building: "barracks" })).toBe("Already built");
    expect(session.state).toBe(before);
  });

  it("reports rejected commands without changing state", () => {
    const session = readySession();
    const before = session.state;
    expect(session.dispatch({ kind: "move", army: redArmy(session).id, to: "E" })).toBe(false);
    expect(session.lastError).toMatch(/neighboring/);
    expect(session.state).toBe(before);
  });
});
