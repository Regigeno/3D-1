import { MILITARY_TYPES, unitFor, type Army, type GameEvent, type GameState, type MilitaryType, type Squad } from "../engine";

export const TYPE_SHORT: Record<MilitaryType, string> = {
  infantry: "Inf",
  ranged: "Ran",
  cavalry: "Cav",
  artillery: "Art",
  special: "Spe",
};

export function factionName(state: GameState, id: string | null): string {
  if (!id) return "Neutral";
  return state.factions[id]?.name ?? id;
}

export function provinceName(state: GameState, id: string): string {
  return state.scenario.provinces.find((p) => p.id === id)?.name ?? id;
}

/** "3 Inf / 2 Ran / 0 Cav / 1 Art / 0 Spe" */
export function compositionLabel(squads: Squad[]): string {
  return MILITARY_TYPES.map((t) => `${squads.filter((s) => s.type === t).length} ${TYPE_SHORT[t]}`).join(" / ");
}

/** Unit names with squad counts, e.g. [{ name: "Clubman", squads: 2, soldiers: 9 }]. */
export function armyBreakdown(army: Army): Array<{ name: string; type: MilitaryType; squads: number; soldiers: number }> {
  const groups = new Map<string, { name: string; type: MilitaryType; squads: number; soldiers: number }>();
  for (const s of army.squads) {
    const unit = unitFor(s.type, s.era);
    const g = groups.get(unit.id) ?? { name: unit.name, type: s.type, squads: 0, soldiers: 0 };
    g.squads += 1;
    g.soldiers += s.soldiers;
    groups.set(unit.id, g);
  }
  return [...groups.values()].sort((a, b) => MILITARY_TYPES.indexOf(a.type) - MILITARY_TYPES.indexOf(b.type));
}

export function describeEvent(state: GameState, e: GameEvent): { text: string; faction: string | null } | null {
  switch (e.kind) {
    case "turn-started":
      return { text: `Turn ${e.turn}: ${factionName(state, e.faction)}`, faction: e.faction };
    case "captured":
      return {
        text: `${factionName(state, e.faction)} took ${provinceName(state, e.province)}${e.previousOwner ? ` from ${factionName(state, e.previousOwner)}` : ""}`,
        faction: e.faction,
      };
    case "battle-started":
      return {
        text: `Battle at ${provinceName(state, e.battle.province)}: ${factionName(state, e.battle.attacker.faction)} attacks ${factionName(state, e.battle.defender.faction)}`,
        faction: e.battle.attacker.faction,
      };
    case "battle-resolved":
      return { text: `Battle at ${provinceName(state, e.province)}: ${e.winner} wins`, faction: null };
    case "recruited":
      return { text: `${factionName(state, e.faction)} recruited ${unitFor(e.squad.type, e.squad.era).name}`, faction: e.faction };
    case "researched":
      return { text: `${factionName(state, e.faction)} reached ${e.era} ${e.type}`, faction: e.faction };
    case "built":
      return { text: `${factionName(state, e.faction)} built a ${e.building} in ${provinceName(state, e.province)}`, faction: e.faction };
    case "desertion":
      return { text: `${factionName(state, e.faction)}: unpaid ${unitFor(e.squad.type, e.squad.era).name} deserted`, faction: e.faction };
    case "relation-changed":
      return { text: `${factionName(state, e.a)} and ${factionName(state, e.b)} are now at ${e.status}`, faction: null };
    case "proposal":
      return { text: `${factionName(state, e.proposal.from)} proposes ${e.proposal.kind} to ${factionName(state, e.proposal.to)}`, faction: e.proposal.from };
    case "proposal-rejected":
      return { text: `${factionName(state, e.proposal.to)} rejected ${factionName(state, e.proposal.from)}'s ${e.proposal.kind}`, faction: e.proposal.to };
    case "eliminated":
      return { text: `${factionName(state, e.faction)} has been eliminated`, faction: e.faction };
    case "victory":
      return { text: `${factionName(state, e.faction)} wins the war!`, faction: e.faction };
    default:
      return null;
  }
}
