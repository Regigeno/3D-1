import { placeholderResolver } from "../battle";
import { CAPITAL_GARRISON_SQUADS } from "../data/rules";
import { SQUAD_SIZE, unitFor } from "../data/units";
import { armiesAt, bestMainEra, garrisonSquadCount, isHostile, ownedProvinces, scenarioProvince } from "../queries";
import type { Army, GameState, Squad } from "../types";

/** A rough, additive strength score for one squad. */
export function squadPower(s: Squad): number {
  const u = unitFor(s.type, s.era);
  return s.soldiers * Math.sqrt((u.health / (1 - u.armor * 0.5)) * (u.weapon.damage / u.weapon.cooldown));
}

export function squadsPower(squads: Squad[]): number {
  return squads.reduce((n, s) => n + squadPower(s), 0);
}

export function factionPower(state: GameState, faction: string): number {
  const armies = Object.values(state.armies).filter((a) => a.owner === faction);
  const garrisons = ownedProvinces(state, faction).reduce((n, p) => n + garrisonSquadCount(state, p), 0);
  const garrisonSquad = { type: "infantry" as const, era: bestMainEra(state, faction, "infantry"), soldiers: SQUAD_SIZE.infantry };
  return armies.reduce((n, a) => n + squadsPower(a.squads), 0) + garrisons * squadPower(garrisonSquad);
}

/**
 * What `me` can know about the defense of `province`: visible hostile armies and
 * the garrison. Buildings in provinces it cannot see are unknown, so a hidden fort
 * is not counted; capitals are public knowledge. Research levels are public too.
 */
export function knownDefenders(state: GameState, me: string, province: string, visible: Set<string>): Squad[] {
  const owner = state.provinces[province]?.owner ?? null;
  const squads: Squad[] = [];
  if (visible.has(province)) {
    for (const a of armiesAt(state, province)) if (isHostile(state, me, a.owner)) squads.push(...a.squads);
  }
  if (owner && isHostile(state, me, owner)) {
    const garrison = visible.has(province)
      ? garrisonSquadCount(state, province)
      : state.factions[owner]?.capital === province
        ? CAPITAL_GARRISON_SQUADS
        : 0;
    const era = bestMainEra(state, owner, "infantry");
    for (let i = 0; i < garrison; i++) squads.push({ type: "infantry", era, soldiers: SQUAD_SIZE.infantry });
  }
  return squads;
}

/** Visible hostile armies standing next to `province`. */
export function adjacentThreat(state: GameState, me: string, province: string, visible: Set<string>): number {
  let threat = 0;
  for (const n of scenarioProvince(state, province).neighbors) {
    if (!visible.has(n)) continue;
    for (const a of armiesAt(state, n)) if (isHostile(state, me, a.owner)) threat += squadsPower(a.squads);
  }
  return threat;
}

/** Chance the attacker wins, by replaying the battle resolver over a few seeds. */
export function winChance(attacker: Squad[], defender: Squad[], seed: number, samples = 5): number {
  if (defender.length === 0) return 1;
  if (attacker.length === 0) return 0;
  let wins = 0;
  for (let i = 0; i < samples; i++) {
    const result = placeholderResolver(
      {
        id: "estimate",
        seed: (seed + i * 7919) | 0,
        province: "",
        attackerFrom: "",
        attackerArmyId: "",
        attacker: { faction: null, squads: attacker },
        defender: { faction: null, squads: defender },
        defenderSources: [],
      },
      "plains",
    );
    if (result.winner === "attacker") wins++;
  }
  return wins / samples;
}

export function armyStrength(army: Army): number {
  return squadsPower(army.squads);
}
