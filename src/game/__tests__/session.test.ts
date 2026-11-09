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

  it("reports rejected commands without changing state", () => {
    const session = readySession();
    const before = session.state;
    expect(session.dispatch({ kind: "move", army: redArmy(session).id, to: "E" })).toBe(false);
    expect(session.lastError).toMatch(/neighboring/);
    expect(session.state).toBe(before);
  });
});
