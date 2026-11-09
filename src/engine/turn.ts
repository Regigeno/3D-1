import { AI_INCOME_MULTIPLIER, ARMY_MOVEMENT } from "./data/rules";
import { ERA_TIER, unitFor } from "./data/units";
import { factionIncome, factionScore, ownedProvinces } from "./queries";
import type { GameEvent, GameState } from "./types";

/** Phase 1 of a faction's turn: income, upkeep, desertion, and fresh movement. */
export function beginFactionTurn(state: GameState, events: GameEvent[]): void {
  const faction = state.factions[state.activeFaction];
  if (!faction) throw new Error(`Unknown active faction ${state.activeFaction}`);

  state.proposals = state.proposals.filter((p) => p.from !== faction.id);

  const gained = factionIncome(state, faction.id);
  if (faction.controller === "ai") {
    const k = AI_INCOME_MULTIPLIER[state.options.difficulty];
    for (const key of Object.keys(gained) as (keyof typeof gained)[]) gained[key] = Math.round(gained[key] * k);
  }
  faction.resources.gold += gained.gold;
  faction.resources.knowledge += gained.knowledge;
  faction.resources.mana += gained.mana;
  faction.resources.energy += gained.energy;

  const armies = Object.values(state.armies).filter((a) => a.owner === faction.id);
  let upkeep = 0;
  for (const army of armies) {
    for (const squad of army.squads) upkeep += unitFor(squad.type, squad.era).upkeep;
  }
  faction.resources.gold -= upkeep;
  events.push({ kind: "income", faction: faction.id, gained, upkeep });

  // Unpaid upkeep: the cheapest, most depleted squads desert first until the books balance.
  while (faction.resources.gold < 0) {
    const candidates = armies.flatMap((army) => army.squads.map((squad, index) => ({ army, squad, index })));
    if (candidates.length === 0) {
      faction.resources.gold = 0;
      break;
    }
    candidates.sort((x, y) => ERA_TIER[x.squad.era] - ERA_TIER[y.squad.era] || x.squad.soldiers - y.squad.soldiers);
    const { army, squad, index } = candidates[0]!;
    army.squads.splice(index, 1);
    faction.resources.gold += unitFor(squad.type, squad.era).upkeep;
    events.push({ kind: "desertion", faction: faction.id, armyId: army.id, squad });
  }
  removeEmptyArmies(state);

  for (const army of Object.values(state.armies)) {
    if (army.owner === faction.id) army.movementLeft = ARMY_MOVEMENT;
  }
  events.push({ kind: "turn-started", faction: faction.id, turn: state.turn });
}

export function removeEmptyArmies(state: GameState): void {
  for (const [id, army] of Object.entries(state.armies)) {
    if (army.squads.length === 0) delete state.armies[id];
  }
}

export function checkEliminations(state: GameState, events: GameEvent[]): void {
  for (const faction of Object.values(state.factions)) {
    if (!faction.alive || ownedProvinces(state, faction.id).length > 0) continue;
    faction.alive = false;
    for (const [id, army] of Object.entries(state.armies)) if (army.owner === faction.id) delete state.armies[id];
    state.proposals = state.proposals.filter((p) => p.from !== faction.id && p.to !== faction.id);
    events.push({ kind: "eliminated", faction: faction.id });
  }
}

export function checkVictory(state: GameState, events: GameEvent[]): void {
  if (state.winner) return;
  const alive = Object.values(state.factions).filter((f) => f.alive);
  let winner: string | null = null;

  if (alive.length === 1) {
    winner = alive[0]!.id;
  } else {
    const victory = state.options.victory;
    const total = state.scenario.provinces.length;
    if (victory.kind === "domination") {
      winner = alive.find((f) => (ownedProvinces(state, f.id).length / total) * 100 >= victory.percent)?.id ?? null;
    } else if (victory.kind === "capitals") {
      const capitals = state.scenario.factions.map((f) => f.capital);
      winner = alive.find((f) => capitals.every((c) => state.provinces[c]?.owner === f.id))?.id ?? null;
    } else if (state.turn > victory.turnLimit) {
      winner = [...alive].sort((a, b) => factionScore(state, b.id) - factionScore(state, a.id))[0]?.id ?? null;
    }
  }

  if (winner) {
    state.winner = winner;
    events.push({ kind: "victory", faction: winner });
  }
}

export function advanceToNextFaction(state: GameState, events: GameEvent[]): void {
  const order = state.factionOrder;
  let index = order.indexOf(state.activeFaction);
  for (let step = 0; step < order.length; step++) {
    index = (index + 1) % order.length;
    if (index === 0) state.turn += 1;
    if (state.factions[order[index]!]?.alive) break;
  }
  state.activeFaction = order[index]!;
  checkVictory(state, events);
  if (!state.winner) beginFactionTurn(state, events);
}
