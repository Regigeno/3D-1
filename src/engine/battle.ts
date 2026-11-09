import { SQUAD_SIZE, TYPE_BONUS, damageMultiplier, unitFor, type UnitDef } from "./data/units";
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

interface Fighter {
  unit: UnitDef;
  soldiers: number;
  wounds: number;
}

/** Infantry and Special units hold the line, so they draw more of the enemy's attention. */
const SCREEN_WEIGHT: Record<string, number> = { infantry: 1.6, special: 1.4 };
const DEFENDER_BONUS = 1.1;
/** Each side's fortune for the whole battle, so evenly matched fights can go either way. */
const LUCK_RANGE: [number, number] = [0.85, 1.15];
const MAX_ROUNDS = 60;

function pickTarget(rng: Rng, attacker: Fighter, enemies: Fighter[]): number {
  const weights = enemies.map((e) => {
    if (e.soldiers <= 0) return 0;
    const counter = TYPE_BONUS[attacker.unit.type][e.unit.type] ?? 1;
    return (SCREEN_WEIGHT[e.unit.type] ?? 1) * (1 + (counter - 1) * 2);
  });
  let roll = rng.next() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) return i;
  }
  return weights.findIndex((w) => w > 0);
}

function wound(target: Fighter, amount: number): void {
  let left = amount;
  while (left > 0 && target.soldiers > 0) {
    const needed = target.unit.health - target.wounds;
    if (left >= needed) {
      left -= needed;
      target.soldiers -= 1;
      target.wounds = 0;
    } else {
      target.wounds += left;
      left = 0;
    }
  }
}

/**
 * Temporary stand-in for the physics battle simulation. Fights in rounds: every
 * squad picks a target (favoring types it counters and the enemy front line)
 * and both sides' damage lands at once, scaled by type counters and armor.
 */
export const placeholderResolver: BattleResolver = (battle) => {
  const rng = new Rng(battle.seed);
  const toFighters = (squads: Squad[]): Fighter[] =>
    squads.map((s) => ({ unit: unitFor(s.type, s.era), soldiers: s.soldiers, wounds: 0 }));
  const atk = toFighters(battle.attacker.squads);
  const def = toFighters(battle.defender.squads);
  const alive = (side: Fighter[]) => side.some((f) => f.soldiers > 0);

  const atkLuck = rng.range(...LUCK_RANGE);
  const defLuck = rng.range(...LUCK_RANGE) * DEFENDER_BONUS;

  const volley = (from: Fighter[], to: Fighter[], bonus: number): number[] => {
    const damage = to.map(() => 0);
    for (const f of from) {
      if (f.soldiers <= 0) continue;
      const t = pickTarget(rng, f, to);
      if (t < 0) continue;
      const perSoldier = f.unit.weapon.damage / f.unit.weapon.cooldown;
      damage[t]! += f.soldiers * perSoldier * damageMultiplier(f.unit, to[t]!.unit) * rng.range(0.6, 1.4) * bonus;
    }
    return damage;
  };

  for (let round = 0; round < MAX_ROUNDS && alive(atk) && alive(def); round++) {
    const onDefender = volley(atk, def, atkLuck);
    const onAttacker = volley(def, atk, defLuck);
    onDefender.forEach((d, i) => wound(def[i]!, d));
    onAttacker.forEach((d, i) => wound(atk[i]!, d));
  }

  return {
    winner: alive(atk) && !alive(def) ? "attacker" : "defender",
    attackerSurvivors: atk.map((f) => f.soldiers),
    defenderSurvivors: def.map((f) => f.soldiers),
  };
};
