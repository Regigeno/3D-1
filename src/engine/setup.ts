import { STARTING_ARMY, STARTING_BUILDINGS, STARTING_RESOURCES, startingPopulation } from "./data/rules";
import { SQUAD_SIZE } from "./data/units";
import { relationKey } from "./queries";
import { beginFactionTurn } from "./turn";
import { AI_PERSONALITIES, MILITARY_TYPES, type GameEvent, type GameOptions, type GameState, type MilitaryType, type Scenario } from "./types";

export function validateScenario(scenario: Scenario): string[] {
  const errors: string[] = [];
  const ids = new Set(scenario.provinces.map((p) => p.id));
  if (ids.size !== scenario.provinces.length) errors.push("Duplicate province ids");
  for (const p of scenario.provinces) {
    for (const n of p.neighbors) {
      if (!ids.has(n)) errors.push(`${p.id} has unknown neighbor ${n}`);
      else if (!scenario.provinces.find((q) => q.id === n)?.neighbors.includes(p.id)) {
        errors.push(`${p.id} -> ${n} is not symmetric`);
      }
      if (n === p.id) errors.push(`${p.id} neighbors itself`);
    }
  }
  if (scenario.factions.length < 2) errors.push("A scenario needs at least two factions");
  const capitals = new Set<string>();
  for (const f of scenario.factions) {
    if (!ids.has(f.capital)) errors.push(`Faction ${f.id} has unknown capital ${f.capital}`);
    if (capitals.has(f.capital)) errors.push(`Capital ${f.capital} is shared`);
    capitals.add(f.capital);
  }
  return errors;
}

export function createGame(scenario: Scenario, options: GameOptions): { state: GameState; events: GameEvent[] } {
  const errors = validateScenario(scenario);
  if (errors.length > 0) throw new Error(`Invalid scenario ${scenario.id}: ${errors.join("; ")}`);

  const capitalOwner = new Map(scenario.factions.map((f) => [f.capital, f.id]));
  const state: GameState = {
    version: 1,
    scenario,
    options,
    rngState: options.seed | 0,
    nextId: 1,
    turn: 1,
    activeFaction: scenario.factions[0]!.id,
    factionOrder: scenario.factions.map((f) => f.id),
    factions: {},
    provinces: {},
    armies: {},
    relations: {},
    proposals: [],
    pendingBattle: null,
    winner: null,
  };

  for (const p of scenario.provinces) {
    const owner = capitalOwner.get(p.id) ?? null;
    const capital = capitalOwner.has(p.id);
    state.provinces[p.id] = {
      owner,
      buildings: owner ? [...STARTING_BUILDINGS] : [],
      population: startingPopulation(p.terrain, capital),
    };
  }

  for (const [index, f] of scenario.factions.entries()) {
    const controller = options.controllers?.[f.id] ?? "ai";
    const defaultPersonality = AI_PERSONALITIES[(Math.abs(options.seed) + index) % AI_PERSONALITIES.length]!;
    state.factions[f.id] = {
      id: f.id,
      name: f.name,
      color: f.color,
      capital: f.capital,
      controller,
      ...(controller === "ai" ? { aiPersonality: options.personalities?.[f.id] ?? defaultPersonality } : {}),
      resources: { ...STARTING_RESOURCES },
      research: Object.fromEntries(MILITARY_TYPES.map((t) => [t, ["prehistoric"]])) as GameState["factions"][string]["research"],
      alive: true,
    };

    const armyId = `a${state.nextId++}`;
    state.armies[armyId] = {
      id: armyId,
      owner: f.id,
      location: f.capital,
      movementLeft: 0,
      squads: (Object.entries(STARTING_ARMY) as [MilitaryType, number][]).flatMap(([type, count]) =>
        Array.from({ length: count }, () => ({ type, era: "prehistoric" as const, soldiers: SQUAD_SIZE[type] })),
      ),
    };
  }

  for (let i = 0; i < scenario.factions.length; i++) {
    for (let j = i + 1; j < scenario.factions.length; j++) {
      const a = scenario.factions[i]!.id;
      const b = scenario.factions[j]!.id;
      state.relations[relationKey(a, b)] = { status: "war", sinceTurn: 1, trust: 50 };
    }
  }

  const events: GameEvent[] = [];
  beginFactionTurn(state, events);
  return { state, events };
}
