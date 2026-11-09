import { describe, expect, it } from "vitest";
import { applyCommand } from "../../engine";
import { newLineGame } from "../../engine/__tests__/fixtures";
import { affordableResearch, researchCell } from "../research";

describe("research cells", () => {
  it("marks researched, available, and locked steps", () => {
    const s = newLineGame();
    expect(researchCell(s, "red", "infantry", "prehistoric").status).toBe("researched");
    expect(researchCell(s, "red", "infantry", "ancient")).toMatchObject({ status: "available", cost: 10 });
    expect(researchCell(s, "red", "infantry", "medieval")).toMatchObject({ status: "locked", requires: "Ancient infantry" });
    expect(researchCell(s, "red", "infantry", "fantastical")).toMatchObject({ status: "locked", requires: "Medieval infantry" });
  });

  it("agrees with the engine about what can be bought", () => {
    const s = newLineGame();
    expect(affordableResearch(s, "red")).toEqual([]);
    s.factions.red!.resources.knowledge = 10;
    const affordable = affordableResearch(s, "red");
    expect(affordable.map((c) => c.type)).toEqual(["infantry", "ranged", "cavalry", "artillery", "special"]);
    for (const cell of affordable) {
      expect(applyCommand(s, { kind: "research", type: cell.type, era: cell.era }).ok).toBe(true);
    }
  });
});
