import { describe, expect, it } from "vitest";
import { placeholderResolver } from "../battle";
import { SQUAD_SIZE, damageMultiplier, strongAgainst, unitFor, weakAgainst } from "../data/units";
import type { Era, MilitaryType, PendingBattle, Squad } from "../types";

const SEEDS = 100;

function squads(type: MilitaryType, era: Era, count: number): Squad[] {
  return Array.from({ length: count }, () => ({ type, era, soldiers: SQUAD_SIZE[type] }));
}

/** As many squads as `gold` buys, capped at a full army. */
function budget(type: MilitaryType, gold: number, era: Era = "prehistoric"): Squad[] {
  return squads(type, era, Math.min(15, Math.floor(gold / unitFor(type, era).cost.gold!)));
}

function attackerWinRate(attacker: Squad[], defender: Squad[]): number {
  let wins = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const battle: PendingBattle = {
      id: "b",
      seed,
      province: "p",
      attackerFrom: "q",
      attackerArmyId: "a",
      attacker: { faction: "x", squads: attacker },
      defender: { faction: "y", squads: defender },
      defenderSources: [],
    };
    if (placeholderResolver(battle, "plains").winner === "attacker") wins++;
  }
  return wins / SEEDS;
}

describe("damage multipliers", () => {
  it("applies type counters and armor, and magic ignores armor", () => {
    const clubman = unitFor("infantry", "prehistoric");
    const wolfSled = unitFor("cavalry", "prehistoric");
    const exo = unitFor("infantry", "futuristic");
    const orcs = unitFor("infantry", "fantastical");
    expect(damageMultiplier(clubman, wolfSled)).toBeCloseTo(1.6);
    expect(damageMultiplier(wolfSled, clubman)).toBeCloseTo(1);
    expect(damageMultiplier(clubman, exo)).toBeCloseTo(1 - exo.armor);
    expect(damageMultiplier(orcs, exo)).toBeCloseTo(1);
  });

  it("describes strengths and weaknesses", () => {
    expect(strongAgainst("cavalry")).toEqual(["ranged", "artillery"]);
    expect(weakAgainst("cavalry")).toEqual(["infantry", "special"]);
  });
});

describe("equal-gold matchups (60 gold each, Prehistoric)", () => {
  const counters: Array<[MilitaryType, MilitaryType]> = [
    ["infantry", "cavalry"],
    ["ranged", "infantry"],
    ["cavalry", "ranged"],
    ["cavalry", "artillery"],
    ["artillery", "infantry"],
    ["artillery", "special"],
    ["special", "infantry"],
    ["special", "cavalry"],
  ];

  it.each(counters)("%s beats %s even when attacking", (a, d) => {
    expect(attackerWinRate(budget(a, 60), budget(d, 60))).toBeGreaterThan(0.6);
  });

  it.each(counters)("%s loses to %s's counter when they attack it", (counter, countered) => {
    expect(attackerWinRate(budget(countered, 60), budget(counter, 60))).toBeLessThan(0.2);
  });

  it("mirror matches favor the defender without being certain", () => {
    const rate = attackerWinRate(budget("infantry", 40), budget("infantry", 40));
    expect(rate).toBeGreaterThan(0.1);
    expect(rate).toBeLessThan(0.5);
  });
});

describe("eras", () => {
  it("a later era beats an earlier one at the same squad count", () => {
    expect(attackerWinRate(squads("infantry", "ancient", 6), squads("infantry", "prehistoric", 6))).toBeGreaterThan(0.9);
    expect(attackerWinRate(squads("ranged", "futuristic", 6), squads("ranged", "modern", 6))).toBeGreaterThan(0.9);
  });

  it("Fantastical magic beats Modern armor at the same squad count", () => {
    expect(attackerWinRate(squads("infantry", "fantastical", 6), squads("infantry", "modern", 6))).toBeGreaterThan(0.5);
  });
});
