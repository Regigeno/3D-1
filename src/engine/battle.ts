import { SQUAD_SIZE, unitFor } from "./data/units";
import {
  armiesAt,
  bestMainEra,
  garrisonSquadCount,
  isAllied,
  isHostile,
  scenarioProvince,
} from "./queries";
import { nextRandom, Rng } from "./rng";
import { checkEliminations, checkVictory, removeEmptyArmies } from "./turn";
import type {
  Army,
  BattleResolver,
  BattleResult,
  CommandResult,
  GameEvent,
  GameState,
  PendingBattle,
  Squad,
  SquadSource,
} from "./types";

/**
 * Works out who defends `province` against `army`. Returns null when nobody does,
 * in which case the attacker simply walks in.
 */
export function buildBattle(state: GameState, army: Army, from: string, province: string): PendingBattle | null {
  const owner = state.provinces[province]?.owner ?? null;
  const hostileArmies = armiesAt(state, province).filter((a) => isHostile(state, army.owner, a.owner));

  let defenderFaction: string | null = null;
  if (owner && isHostile(state, army.owner, owner) && (hostileArmies.some((a) => a.owner === owner) || garrisonSquadCount(state, province) > 0)) {
    defenderFaction = owner;
  } else if (hostileArmies.length > 0) {
    defenderFaction = hostileArmies[0]!.owner;
  }
  if (!defenderFaction) return null;

  const squads: Squad[] = [];
  const sources: SquadSource[] = [];
  for (const a of hostileArmies.filter((h) => h.owner === defenderFaction)) {
    a.squads.forEach((s, squadIndex) => {
      squads.push({ ...s });
      sources.push({ kind: "army", armyId: a.id, squadIndex });
    });
  }
  if (owner === defenderFaction) {
    const era = bestMainEra(state, defenderFaction, "infantry");
    for (let i = 0; i < garrisonSquadCount(state, province); i++) {
      squads.push({ type: "infantry", era, soldiers: SQUAD_SIZE.infantry });
      sources.push({ kind: "garrison" });
    }
  }

  const draw = nextRandom(state.rngState);
  state.rngState = draw.state;
  return {
    id: `b${state.nextId++}`,
    seed: Math.floor(draw.value * 0x7fffffff),
    province,
    attackerFrom: from,
    attackerArmyId: army.id,
    attacker: { faction: army.owner, squads: army.squads.map((s) => ({ ...s })) },
    defender: { faction: defenderFaction, squads },
    defenderSources: sources,
  };
}

export function captureProvince(state: GameState, faction: string, province: string, events: GameEvent[]): void {
  const p = state.provinces[province];
  if (!p || p.owner === faction) return;
  const previousOwner = p.owner;
  p.owner = faction;
  events.push({ kind: "captured", faction, province, previousOwner });
}

function applySurvivors(squads: Squad[], survivors: number[]): Squad[] {
  return squads
    .map((s, i) => ({ ...s, soldiers: Math.max(0, Math.min(s.soldiers, Math.round(survivors[i] ?? 0))) }))
    .filter((s) => s.soldiers > 0);
}

/** Writes a battle's outcome back into the game state. */
export function resolveBattle(input: GameState, result: BattleResult): CommandResult {
  const battle = input.pendingBattle;
  if (!battle) return { ok: false, error: "There is no pending battle" };
  if (result.attackerSurvivors.length !== battle.attacker.squads.length) {
    return { ok: false, error: "Attacker survivor count does not match squads" };
  }
  if (result.defenderSurvivors.length !== battle.defender.squads.length) {
    return { ok: false, error: "Defender survivor count does not match squads" };
  }

  const state = structuredClone(input);
  const events: GameEvent[] = [];
  const attacker = state.armies[battle.attackerArmyId];
  if (!attacker) return { ok: false, error: "Attacking army no longer exists" };

  attacker.squads = applySurvivors(battle.attacker.squads, result.attackerSurvivors);

  const defenderArmyIds = new Set<string>();
  const survivorsByArmy = new Map<string, number[]>();
  battle.defenderSources.forEach((src, i) => {
    if (src.kind !== "army") return;
    defenderArmyIds.add(src.armyId);
    const list = survivorsByArmy.get(src.armyId) ?? [];
    list[src.squadIndex] = result.defenderSurvivors[i] ?? 0;
    survivorsByArmy.set(src.armyId, list);
  });
  for (const armyId of defenderArmyIds) {
    const army = state.armies[armyId];
    if (army) army.squads = applySurvivors(army.squads, survivorsByArmy.get(armyId) ?? []);
  }

  events.push({
    kind: "battle-resolved",
    battleId: battle.id,
    winner: result.winner,
    province: battle.province,
    attacker: battle.attacker.faction,
    defender: battle.defender.faction,
  });

  if (result.winner === "attacker") {
    for (const armyId of defenderArmyIds) {
      const army = state.armies[armyId];
      if (!army || army.squads.length === 0) continue;
      const retreat = scenarioProvince(state, battle.province).neighbors.find((n) => {
        const owner = state.provinces[n]?.owner;
        return owner != null && isAllied(state, army.owner, owner);
      });
      if (retreat) {
        army.location = retreat;
        army.movementLeft = 0;
      } else {
        army.squads = [];
      }
    }
    attacker.location = battle.province;
    attacker.movementLeft = 0;
    const owner = state.provinces[battle.province]?.owner ?? null;
    if (owner !== attacker.owner && !(owner && isAllied(state, attacker.owner, owner))) {
      captureProvince(state, attacker.owner, battle.province, events);
    }
  } else {
    attacker.location = battle.attackerFrom;
    attacker.movementLeft = 0;
  }

  state.pendingBattle = null;
  removeEmptyArmies(state);
  checkEliminations(state, events);
  checkVictory(state, events);
  return { ok: true, state, events };
}

export function runPendingBattle(state: GameState, resolver: BattleResolver = placeholderResolver): CommandResult {
  const battle = state.pendingBattle;
  if (!battle) return { ok: false, error: "There is no pending battle" };
  return resolveBattle(state, resolver(battle, scenarioProvince(state, battle.province).terrain));
}

/**
 * Temporary stand-in for the physics battle simulation. Fights in rounds: each
 * side deals damage based on its living soldiers' weapons and the other side
 * loses soldiers front squad first.
 */
export const placeholderResolver: BattleResolver = (battle) => {
  const rng = new Rng(battle.seed);
  const sides = [battle.attacker.squads, battle.defender.squads].map((squads) =>
    squads.map((s) => {
      const unit = unitFor(s.type, s.era);
      return { soldiers: s.soldiers, health: unit.health, damage: unit.weapon.damage / unit.weapon.cooldown, wounds: 0 };
    }),
  );
  const [atk, def] = sides as [typeof sides[number], typeof sides[number]];
  const alive = (side: typeof atk) => side.some((s) => s.soldiers > 0);
  const strength = (side: typeof atk) => side.reduce((sum, s) => sum + s.soldiers * s.damage, 0);
  const takeDamage = (side: typeof atk, amount: number) => {
    for (const s of side) {
      while (amount > 0 && s.soldiers > 0) {
        const needed = s.health - s.wounds;
        if (amount >= needed) {
          amount -= needed;
          s.soldiers -= 1;
          s.wounds = 0;
        } else {
          s.wounds += amount;
          amount = 0;
        }
      }
      if (amount <= 0) return;
    }
  };

  const MAX_ROUNDS = 60;
  let round = 0;
  while (alive(atk) && alive(def) && round < MAX_ROUNDS) {
    const atkHit = strength(atk) * rng.range(0.6, 1.4);
    const defHit = strength(def) * rng.range(0.6, 1.4) * 1.1;
    takeDamage(def, atkHit);
    takeDamage(atk, defHit);
    round++;
  }

  return {
    winner: alive(atk) && !alive(def) ? "attacker" : "defender",
    attackerSurvivors: atk.map((s) => s.soldiers),
    defenderSurvivors: def.map((s) => s.soldiers),
  };
};
