import { it } from "vitest";
import { placeholderResolver, type Era, type MilitaryType, type PendingBattle, type Squad, SQUAD_SIZE, Rng, MILITARY_TYPES, type Terrain } from "../../engine";
import { loadRapier } from "../rapier";
import { BattleSim } from "../sim";

const sq = (type: MilitaryType, era: Era, n: number): Squad[] => Array.from({ length: n }, () => ({ type, era, soldiers: SQUAD_SIZE[type] }));
const battle = (a: Squad[], d: Squad[], seed = 1, fortified = false): PendingBattle => ({
  id: "b",
  seed,
  province: "p",
  attackerFrom: "q",
  attackerArmyId: "a",
  attacker: { faction: "red", squads: a },
  defender: { faction: "blue", squads: d },
  defenderSources: d.map(() => ({ kind: "garrison" as const })),
  fortified,
});

it("diag", async () => {
  const R = await loadRapier();
  const run = (b: PendingBattle, terrain: Terrain = "plains") => {
    const t0 = performance.now();
    const sim = new BattleSim(R, b, terrain);
    const r = sim.runToEnd();
    const out = { winner: r.winner, reason: sim.reason, time: +sim.time.toFixed(1), ms: Math.round(performance.now() - t0), a: r.attackerSurvivors.reduce((x, y) => x + y, 0), d: r.defenderSurvivors.reduce((x, y) => x + y, 0), of: [sim.totalCount(0), sim.totalCount(1)] };
    sim.dispose();
    return out;
  };
  const show = (label: string, o: ReturnType<typeof run>) => console.log(label.padEnd(34), o.winner.padEnd(9), String(o.reason).padEnd(10), `${o.time}s`.padEnd(7), `${o.ms}ms`.padEnd(7), `A ${o.a}/${o.of[0]}  D ${o.d}/${o.of[1]}`);
  const big = (era: Era) => [...sq("infantry", era, 5), ...sq("ranged", era, 4), ...sq("cavalry", era, 3), ...sq("artillery", era, 2), ...sq("special", era, 1)];
  show("mirror inf 3v3", run(battle(sq("infantry", "prehistoric", 3), sq("infantry", "prehistoric", 3))));
  show("start army vs capital garrison", run(battle([...sq("infantry", "prehistoric", 2), ...sq("ranged", "prehistoric", 1)], sq("infantry", "prehistoric", 2))));
  show("6 cav vs 6 ranged", run(battle(sq("cavalry", "ancient", 6), sq("ranged", "ancient", 6))));
  show("6 inf vs 6 cav (gold-ish)", run(battle(sq("infantry", "ancient", 8), sq("cavalry", "ancient", 5))));
  show("med 8 vs pre 8", run(battle(sq("infantry", "medieval", 8), sq("infantry", "prehistoric", 8))));
  show("15v15 medieval", run(battle(big("medieval"), big("medieval"))));
  show("15v15 modern vs futuristic", run(battle(big("modern"), big("futuristic"))));
  show("15v15 fantastical vs modern", run(battle(big("fantastical"), big("modern")), "forest"));
  show("15v15 ancient fort hills", run(battle(big("ancient"), big("ancient"), 3, true), "hills"));
  show("15v15 ancient no fort hills", run(battle(big("ancient"), big("ancient"), 3, false), "hills"));
  show("artillery only", run(battle(sq("artillery", "medieval", 3), sq("artillery", "medieval", 3))));
  show("drones vs clubmen", run(battle(sq("special", "modern", 3), sq("infantry", "prehistoric", 6))));
  show("dragons vs knights", run(battle(sq("special", "fantastical", 2), sq("infantry", "medieval", 6))));

  const rng = new Rng(9);
  let agree = 0;
  let attackerWins = 0;
  let quickAttackerWins = 0;
  let timeouts = 0;
  let ms = 0;
  let maxMs = 0;
  const N = 60;
  for (let i = 0; i < N; i++) {
    const army = () => {
      const n = rng.int(2, 12);
      const eraPool: Era[] = ["prehistoric", "ancient", "medieval", "modern", "futuristic", "fantastical"];
      const era = rng.pick(eraPool.slice(0, rng.int(1, 6)));
      return Array.from({ length: n }, () => {
        const type = rng.pick(MILITARY_TYPES);
        return { type, era, soldiers: SQUAD_SIZE[type] };
      });
    };
    const b = battle(army(), army(), i + 1, rng.next() < 0.2);
    const terrain = rng.pick(["plains", "forest", "hills", "mountains", "desert", "coast", "wasteland"] as const);
    const phys = run(b, terrain);
    ms += phys.ms;
    maxMs = Math.max(maxMs, phys.ms);
    if (phys.reason === "timeout") timeouts++;
    const quick = placeholderResolver(b, terrain);
    if (quick.winner === phys.winner) agree++;
    if (phys.winner === "attacker") attackerWins++;
    if (quick.winner === "attacker") quickAttackerWins++;
  }
  console.log(`random: agreement ${agree}/${N}, attacker wins physics ${attackerWins} quick ${quickAttackerWins}, timeouts ${timeouts}, avg ${Math.round(ms / N)} ms, max ${maxMs} ms`);
  const b = battle(big("ancient"), big("medieval"), 77);
  const strip = (o: ReturnType<typeof run>) => JSON.stringify({ ...o, ms: 0 });
  console.log("determinism", strip(run(b, "forest")) === strip(run(b, "forest")));
}, 600_000);
