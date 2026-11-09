import { beforeAll, describe, expect, it } from "vitest";
import { SQUAD_SIZE, type Era, type MilitaryType, type PendingBattle, type Squad, type Terrain } from "../../engine";
import { buildArena } from "../arena";
import { deploy } from "../deploy";
import { createPhysicsResolver, MAX_BATTLE_SECONDS, STEP_SECONDS } from "../index";
import { loadRapier, type Rapier } from "../rapier";
import { BattleSim, simulateBattle } from "../sim";

const squads = (type: MilitaryType, era: Era, n: number, soldiers = SQUAD_SIZE[type]): Squad[] =>
  Array.from({ length: n }, () => ({ type, era, soldiers }));

const battle = (attacker: Squad[], defender: Squad[], seed = 1, fortified = false): PendingBattle => ({
  id: "b1",
  seed,
  province: "p",
  attackerFrom: "q",
  attackerArmyId: "a1",
  attacker: { faction: "red", squads: attacker },
  defender: { faction: "blue", squads: defender },
  defenderSources: defender.map(() => ({ kind: "garrison" as const })),
  fortified,
});

const mixed = (era: Era): Squad[] => [
  ...squads("infantry", era, 3),
  ...squads("ranged", era, 2),
  ...squads("cavalry", era, 1),
  ...squads("artillery", era, 1),
  ...squads("special", era, 1),
];

let R: Rapier;
beforeAll(async () => {
  R = await loadRapier();
});

describe("deployment", () => {
  it("puts each side in its own half, infantry ahead of ranged and artillery behind", () => {
    const army = mixed("medieval");
    for (const side of [-1, 1] as const) {
      const placed = deploy(army, side);
      expect(placed.length).toBe(army.reduce((n, s) => n + s.soldiers, 0));
      expect(placed.every((p) => Math.sign(p.z) === side)).toBe(true);
      const depth = (type: MilitaryType) => {
        const zs = placed.filter((p) => army[p.squad]!.type === type).map((p) => Math.abs(p.z));
        return zs.reduce((a, b) => a + b, 0) / zs.length;
      };
      expect(depth("infantry")).toBeLessThan(depth("ranged"));
      expect(depth("ranged")).toBeLessThan(depth("artillery"));
    }
  });
});

describe("arena", () => {
  it("builds a palisade for a fortified defender and trees in a forest", () => {
    expect(buildArena("plains", 1, false).obstacles.some((o) => o.kind === "wall")).toBe(false);
    expect(buildArena("plains", 1, true).obstacles.some((o) => o.kind === "wall")).toBe(true);
    expect(buildArena("forest", 1, false).obstacles.some((o) => o.kind === "tree")).toBe(true);
  });
});

describe("battle simulation", () => {
  it("is deterministic, whether stepped frame by frame or run to the end", () => {
    const b = battle(mixed("ancient"), mixed("medieval"), 42);
    const once = simulateBattle(R, b, "forest");
    expect(simulateBattle(R, b, "forest")).toEqual(once);

    const sim = new BattleSim(R, b, "forest");
    while (!sim.done) for (let i = 0; i < 7 && !sim.done; i++) sim.step();
    expect(sim.result()).toEqual(once);
    sim.dispose();
  });

  it("reports survivors per squad, never more than the squad had", () => {
    const b = battle(mixed("modern"), mixed("futuristic"), 5);
    const result = simulateBattle(R, b, "hills");
    expect(result.attackerSurvivors).toHaveLength(b.attacker.squads.length);
    expect(result.defenderSurvivors).toHaveLength(b.defender.squads.length);
    result.attackerSurvivors.forEach((n, i) => expect(n).toBeLessThanOrEqual(b.attacker.squads[i]!.soldiers));
    result.defenderSurvivors.forEach((n, i) => expect(n).toBeLessThanOrEqual(b.defender.squads[i]!.soldiers));
    const winners = result.winner === "attacker" ? result.attackerSurvivors : result.defenderSurvivors;
    expect(winners.some((n) => n > 0)).toBe(true);
  });

  it("lets the much stronger army win, attacking or defending", () => {
    const strong = squads("infantry", "medieval", 6);
    const weak = squads("infantry", "prehistoric", 2);
    expect(simulateBattle(R, battle(strong, weak), "plains").winner).toBe("attacker");
    expect(simulateBattle(R, battle(weak, strong), "plains").winner).toBe("defender");
  });

  it("ends within the time limit, and a timeout goes to the defender", () => {
    // Two trees cannot move or reach each other, so nobody wins outright.
    const sim = new BattleSim(R, battle(squads("artillery", "prehistoric", 1), squads("artillery", "prehistoric", 1)), "plains");
    const result = sim.runToEnd();
    expect(sim.reason).toBe("timeout");
    expect(sim.time).toBeLessThanOrEqual(MAX_BATTLE_SECONDS + STEP_SECONDS);
    expect(result.winner).toBe("defender");
    sim.dispose();
  });

  it("settles battles where one side has no soldiers", () => {
    const result = simulateBattle(R, battle(squads("infantry", "ancient", 2), []), "plains");
    expect(result.winner).toBe("attacker");
    expect(result.defenderSurvivors).toEqual([]);
  });

  it("works as a game battle resolver", () => {
    const resolve = createPhysicsResolver(R);
    const b = battle(squads("cavalry", "ancient", 3), squads("ranged", "ancient", 2), 9);
    const terrain: Terrain = "desert";
    expect(resolve(b, terrain)).toEqual(simulateBattle(R, b, terrain));
  });
});
