import { createGame, factionIncome, generateRandomScenario, ownedProvinces } from "./engine";

const seed = Math.floor(Math.random() * 1_000_000);
const scenario = generateRandomScenario({ seed, provinces: 40, factions: 4 });
const { state } = createGame(scenario, {
  seed,
  difficulty: "normal",
  victory: { kind: "domination", percent: 70 },
  controllers: { [scenario.factions[0]!.id]: "human" },
});

const lines = [
  `${scenario.name}: ${scenario.provinces.length} provinces`,
  "",
  ...Object.values(state.factions).map((f) => {
    const income = factionIncome(state, f.id);
    return `${f.name.padEnd(16)} ${f.controller.padEnd(6)} provinces ${ownedProvinces(state, f.id).length}  gold ${f.resources.gold} (+${income.gold})`;
  }),
];

document.querySelector("#app")!.textContent = lines.join("\n");
