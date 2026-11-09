import { describe, expect, it } from "vitest";
import { factionIncome, factionUpkeep } from "../../engine";
import { newLineGame } from "../../engine/__tests__/fixtures";
import { ledger } from "../economy";

describe("ledger", () => {
  it("adds up to the engine's income and upkeep", () => {
    const s = newLineGame();
    s.provinces.B!.owner = "red";
    s.provinces.B!.buildings.push("market", "library", "shrine", "power-plant");
    s.provinces.A!.buildings.push("market");

    const l = ledger(s, "red");
    const income = factionIncome(s, "red");
    const upkeep = factionUpkeep(s, "red");
    expect(l.net).toEqual({ ...income, gold: income.gold - upkeep });
    expect(l.income.find((line) => line.label.startsWith("Markets"))?.amount.gold).toBe(6);
    expect(l.upkeep).toHaveLength(1);
  });
});
