import { describe, expect, it } from "vitest";
import { lineScenario } from "../../engine/__tests__/fixtures";
import { diplomacyRows, incomingProposals, trustLabel } from "../diplomacy";
import { GameSession } from "../session";

describe("diplomacy view", () => {
  it("lists rivals with the actions their relation allows", () => {
    const session = GameSession.fromScenario(lineScenario(), 1);
    const [blue] = diplomacyRows(session.state, "red");
    expect(blue).toMatchObject({ faction: "blue", status: "war", trust: 50, borders: false, incoming: null, outgoing: null });
    expect(blue!.actions.map((a) => a.label)).toEqual(["Propose peace"]);

    session.dispatch(blue!.actions[0]!.command);
    expect(diplomacyRows(session.state, "red")[0]!.outgoing?.kind).toBe("peace");
  });

  it("offers alliance and war during peace, and locks war for the minimum peace", () => {
    const session = GameSession.fromScenario(lineScenario(), 1);
    session.state.relations["blue|red"] = { status: "peace", sinceTurn: session.state.turn, trust: 70 };
    const [blue] = diplomacyRows(session.state, "red");
    expect(blue!.actions.map((a) => a.label)).toEqual(["Propose alliance", "Declare war"]);
    expect(blue!.peaceLockedFor).toBe(10);
    expect(session.check(blue!.actions[1]!.command)).toMatch(/Peace must last/);
    expect(trustLabel(blue!.trust)).toBe("Friendly");
  });

  it("asks for confirmation before breaking an alliance", () => {
    const session = GameSession.fromScenario(lineScenario(), 1);
    session.state.relations["blue|red"] = { status: "alliance", sinceTurn: 1, trust: 80 };
    const [blue] = diplomacyRows(session.state, "red");
    expect(blue!.actions).toHaveLength(1);
    expect(blue!.actions[0]).toMatchObject({ label: "Break alliance", danger: true });
    expect(blue!.actions[0]!.confirm).toMatch(/trust/);
  });

  it("shows proposals waiting for the player", () => {
    const session = GameSession.fromScenario(lineScenario(), 1);
    session.state.proposals.push({ from: "blue", to: "red", kind: "peace", turn: 1 });
    expect(incomingProposals(session.state, "red")).toHaveLength(1);
    const [blue] = diplomacyRows(session.state, "red");
    expect(blue!.incoming?.kind).toBe("peace");
    expect(blue!.actions.map((a) => a.label)).not.toContain("Propose peace");
  });
});
