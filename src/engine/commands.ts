import { buildBattle, captureProvince } from "./battle";
import {
  ARMY_MOVEMENT,
  BUILDING_COST,
  MIN_PEACE_TURNS,
  MOVE_COST,
  RESEARCH_COST,
  TREATY_BREAK_TRUST_PENALTY,
} from "./data/rules";
import { MAX_SQUADS_PER_ARMY, SQUAD_SIZE, unitFor } from "./data/units";
import {
  armiesAt,
  bestMainEra,
  canAfford,
  hasAnyModern,
  hasEra,
  isAllied,
  isHostile,
  pay,
  relationBetween,
  relationKey,
  scenarioProvince,
} from "./queries";
import { advanceToNextFaction, checkEliminations, checkVictory } from "./turn";
import {
  MAIN_ERAS,
  type Command,
  type CommandResult,
  type Cost,
  type GameEvent,
  type GameState,
  type MainEra,
} from "./types";

class CommandError extends Error {}

function fail(message: string): never {
  throw new CommandError(message);
}

function newId(state: GameState, prefix: string): string {
  return `${prefix}${state.nextId++}`;
}

function ownArmy(state: GameState, faction: string, armyId: string) {
  const army = state.armies[armyId];
  if (!army) fail(`Unknown army ${armyId}`);
  if (army.owner !== faction) fail("That army belongs to another faction");
  return army;
}

function ownProvince(state: GameState, faction: string, provinceId: string) {
  const province = state.provinces[provinceId];
  if (!province) fail(`Unknown province ${provinceId}`);
  if (province.owner !== faction) fail("You do not own that province");
  return province;
}

/**
 * Validates and applies one command for the active faction. Never mutates the
 * input state; returns a new state plus the events that happened.
 */
export function applyCommand(input: GameState, command: Command): CommandResult {
  if (input.winner) return { ok: false, error: "The game is over" };
  if (input.pendingBattle) return { ok: false, error: "A battle must be resolved first" };

  const state = structuredClone(input);
  const events: GameEvent[] = [];
  try {
    handle(state, state.activeFaction, command, events);
  } catch (e) {
    if (e instanceof CommandError) return { ok: false, error: e.message };
    throw e;
  }
  return { ok: true, state, events };
}

function handle(state: GameState, me: string, cmd: Command, events: GameEvent[]): void {
  const faction = state.factions[me]!;

  switch (cmd.kind) {
    case "recruit": {
      const province = ownProvince(state, me, cmd.province);
      if (!province.buildings.includes("barracks")) fail("Recruiting requires a barracks");
      const era = cmd.era ?? bestMainEra(state, me, cmd.type);
      if (!hasEra(state, me, cmd.type, era)) fail(`${era} ${cmd.type} is not researched`);
      const unit = unitFor(cmd.type, era);
      if (!canAfford(faction.resources, unit.cost)) fail(`Not enough resources for ${unit.name}`);

      let army = armiesAt(state, cmd.province).find((a) => a.owner === me && a.squads.length < MAX_SQUADS_PER_ARMY);
      if (!army) {
        const id = newId(state, "a");
        army = { id, owner: me, location: cmd.province, movementLeft: 0, squads: [] };
        state.armies[id] = army;
      }
      pay(faction.resources, unit.cost);
      const squad = { type: cmd.type, era, soldiers: SQUAD_SIZE[cmd.type] };
      army.squads.push(squad);
      events.push({ kind: "recruited", faction: me, armyId: army.id, squad });
      return;
    }

    case "research": {
      if (cmd.era === "prehistoric") fail("Prehistoric is already known");
      if (hasEra(state, me, cmd.type, cmd.era)) fail("Already researched");
      if (cmd.era === "fantastical") {
        if (!hasEra(state, me, cmd.type, "medieval")) fail("Fantastical requires Medieval in that type");
      } else {
        const index = MAIN_ERAS.indexOf(cmd.era);
        const previous = MAIN_ERAS[index - 1] as MainEra;
        if (!hasEra(state, me, cmd.type, previous)) fail(`Research ${previous} ${cmd.type} first`);
      }
      const cost = RESEARCH_COST[cmd.era];
      if (faction.resources.knowledge < cost) fail("Not enough knowledge");
      faction.resources.knowledge -= cost;
      faction.research[cmd.type].push(cmd.era);
      events.push({ kind: "researched", faction: me, type: cmd.type, era: cmd.era });
      return;
    }

    case "build": {
      const province = ownProvince(state, me, cmd.province);
      if (province.buildings.includes(cmd.building)) fail("Already built");
      if (cmd.building === "power-plant" && !hasAnyModern(state, me)) fail("Power plants require a Modern era");
      const cost = BUILDING_COST[cmd.building];
      if (!canAfford(faction.resources, cost)) fail("Not enough gold");
      pay(faction.resources, cost);
      province.buildings.push(cmd.building);
      events.push({ kind: "built", faction: me, province: cmd.province, building: cmd.building });
      return;
    }

    case "move": {
      const army = ownArmy(state, me, cmd.army);
      const from = army.location;
      if (!scenarioProvince(state, from).neighbors.includes(cmd.to)) fail("Can only move to a neighboring province");
      const cost = MOVE_COST[scenarioProvince(state, cmd.to).terrain];
      // An army with full movement can always make one move, so 3-cost mountains stay reachable.
      if (army.movementLeft < cost && army.movementLeft < ARMY_MOVEMENT) fail("Not enough movement left");
      if (army.movementLeft <= 0) fail("This army has already moved");

      const owner = state.provinces[cmd.to]?.owner ?? null;
      const friendly = owner !== null && isAllied(state, me, owner);
      if (!friendly && !isHostile(state, me, owner)) fail("You are at peace with that province's owner");

      const battle = buildBattle(state, army, from, cmd.to);
      if (battle) {
        state.pendingBattle = battle;
        army.movementLeft = 0;
        events.push({ kind: "battle-started", battle });
        return;
      }

      army.location = cmd.to;
      events.push({ kind: "moved", armyId: army.id, from, to: cmd.to });
      if (friendly) {
        army.movementLeft = Math.max(0, army.movementLeft - cost);
      } else {
        army.movementLeft = 0;
        captureProvince(state, me, cmd.to, events);
        checkEliminations(state, events);
        checkVictory(state, events);
      }
      return;
    }

    case "split": {
      const army = ownArmy(state, me, cmd.army);
      const indices = [...new Set(cmd.squads)].sort((a, b) => b - a);
      if (indices.length === 0) fail("Choose at least one squad");
      if (indices.length >= army.squads.length) fail("Leave at least one squad behind");
      if (indices.some((i) => i < 0 || i >= army.squads.length)) fail("Invalid squad index");
      const moved = indices.map((i) => army.squads.splice(i, 1)[0]!).reverse();
      const id = newId(state, "a");
      state.armies[id] = { id, owner: me, location: army.location, movementLeft: army.movementLeft, squads: moved };
      events.push({ kind: "split", armyId: army.id, newArmyId: id });
      return;
    }

    case "merge": {
      const ids = [...new Set(cmd.armies)];
      if (ids.length < 2) fail("Choose at least two armies");
      const armies = ids.map((id) => ownArmy(state, me, id));
      const [into, ...rest] = armies as [typeof armies[number], ...typeof armies];
      if (rest.some((a) => a.location !== into.location)) fail("Armies must be in the same province");
      const total = armies.reduce((n, a) => n + a.squads.length, 0);
      if (total > MAX_SQUADS_PER_ARMY) fail(`An army can hold at most ${MAX_SQUADS_PER_ARMY} squads`);
      into.movementLeft = Math.min(...armies.map((a) => a.movementLeft));
      for (const a of rest) {
        into.squads.push(...a.squads);
        delete state.armies[a.id];
      }
      events.push({ kind: "merged", into: into.id, removed: rest.map((a) => a.id) });
      return;
    }

    case "upgrade-squad": {
      const army = ownArmy(state, me, cmd.army);
      const squad = army.squads[cmd.squad];
      if (!squad) fail("Invalid squad index");
      if (squad.era === "fantastical") fail("Fantastical squads cannot be upgraded");
      const target = bestMainEra(state, me, squad.type);
      if (MAIN_ERAS.indexOf(target) <= MAIN_ERAS.indexOf(squad.era)) fail("No better era researched");
      const oldCost = unitFor(squad.type, squad.era).cost;
      const newCost = unitFor(squad.type, target).cost;
      const cost: Cost = { ...newCost, gold: Math.max(1, (newCost.gold ?? 0) - (oldCost.gold ?? 0)) };
      if (!canAfford(faction.resources, cost)) fail("Not enough resources");
      pay(faction.resources, cost);
      squad.era = target;
      squad.soldiers = SQUAD_SIZE[squad.type];
      events.push({ kind: "upgraded", armyId: army.id, squadIndex: cmd.squad, era: target });
      return;
    }

    case "diplomacy": {
      if (cmd.target === me) fail("Cannot do diplomacy with yourself");
      if (!state.factions[cmd.target]?.alive) fail("Unknown or eliminated faction");
      const relation = relationBetween(state, me, cmd.target)!;

      if (cmd.action === "declare-war") {
        if (relation.status === "war") fail("Already at war");
        if (relation.status === "peace" && state.turn - relation.sinceTurn < MIN_PEACE_TURNS) {
          fail(`Peace must last ${MIN_PEACE_TURNS} turns`);
        }
        if (relation.status === "alliance") {
          for (const [key, r] of Object.entries(state.relations)) {
            if (key.split("|").includes(me)) r.trust = Math.max(0, r.trust - TREATY_BREAK_TRUST_PENALTY);
          }
        }
        relation.status = "war";
        relation.sinceTurn = state.turn;
        state.proposals = state.proposals.filter(
          (p) => relationKey(p.from, p.to) !== relationKey(me, cmd.target),
        );
        events.push({ kind: "relation-changed", a: me, b: cmd.target, status: "war" });
        return;
      }

      const kind = cmd.action === "propose-peace" ? "peace" : "alliance";
      if (kind === "peace" && relation.status !== "war") fail("You are not at war");
      if (kind === "alliance" && relation.status !== "peace") fail("Alliances require peace first");
      if (state.proposals.some((p) => p.from === me && p.to === cmd.target)) fail("Proposal already pending");
      const proposal = { from: me, to: cmd.target, kind, turn: state.turn } as const;
      state.proposals.push({ ...proposal });
      events.push({ kind: "proposal", proposal: { ...proposal } });
      return;
    }

    case "respond-proposal": {
      const index = state.proposals.findIndex((p) => p.from === cmd.from && p.to === me);
      if (index < 0) fail("No such proposal");
      const proposal = state.proposals.splice(index, 1)[0]!;
      if (!cmd.accept) {
        events.push({ kind: "proposal-rejected", proposal });
        return;
      }
      const relation = relationBetween(state, proposal.from, proposal.to)!;
      relation.status = proposal.kind;
      relation.sinceTurn = state.turn;
      relation.trust = Math.min(100, relation.trust + 10);
      events.push({ kind: "relation-changed", a: proposal.from, b: proposal.to, status: proposal.kind });
      return;
    }

    case "end-turn": {
      advanceToNextFaction(state, events);
      return;
    }
  }
}
