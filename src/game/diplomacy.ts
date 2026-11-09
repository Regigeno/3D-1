import { bordering, ownedProvinces, relationBetween, rules, type Command, type GameState, type Proposal, type RelationStatus } from "../engine";

export const STATUS_LABEL: Record<RelationStatus, string> = {
  war: "At war",
  peace: "At peace",
  alliance: "Allied",
};

export function trustLabel(trust: number): string {
  if (trust < 20) return "Hostile";
  if (trust < 40) return "Wary";
  if (trust < 60) return "Neutral";
  if (trust < 80) return "Friendly";
  return "Trusted";
}

export interface DiplomacyRow {
  faction: string;
  name: string;
  color: string;
  status: RelationStatus;
  sinceTurn: number;
  trust: number;
  borders: boolean;
  provinces: number;
  /** A proposal this faction sent to `me` that is waiting for an answer. */
  incoming: Proposal | null;
  /** A proposal `me` sent to this faction that it has not answered yet. */
  outgoing: Proposal | null;
  /** Turns until peace can be broken, when at peace. */
  peaceLockedFor: number;
  actions: Array<{ label: string; command: Command; danger?: boolean; confirm?: string }>;
}

/** What `me` knows about and can do with every other living faction. */
export function diplomacyRows(state: GameState, me: string): DiplomacyRow[] {
  return state.factionOrder
    .filter((f) => f !== me && state.factions[f]!.alive)
    .map((f) => {
      const faction = state.factions[f]!;
      const relation = relationBetween(state, me, f)!;
      const actions: DiplomacyRow["actions"] = [];
      if (relation.status === "war") actions.push({ label: "Propose peace", command: { kind: "diplomacy", target: f, action: "propose-peace" } });
      if (relation.status === "peace") {
        actions.push({ label: "Propose alliance", command: { kind: "diplomacy", target: f, action: "propose-alliance" } });
        actions.push({ label: "Declare war", command: { kind: "diplomacy", target: f, action: "declare-war" }, danger: true });
      }
      if (relation.status === "alliance") {
        actions.push({
          label: "Break alliance",
          command: { kind: "diplomacy", target: f, action: "declare-war" },
          danger: true,
          confirm: "Breaking an alliance means war, and every faction will trust you less.",
        });
      }
      const incoming = state.proposals.find((p) => p.from === f && p.to === me) ?? null;
      return {
        faction: f,
        name: faction.name,
        color: faction.color,
        status: relation.status,
        sinceTurn: relation.sinceTurn,
        trust: relation.trust,
        borders: bordering(state, me, f),
        provinces: ownedProvinces(state, f).length,
        incoming,
        outgoing: state.proposals.find((p) => p.from === me && p.to === f) ?? null,
        peaceLockedFor: relation.status === "peace" ? Math.max(0, rules.MIN_PEACE_TURNS - (state.turn - relation.sinceTurn)) : 0,
        // Answering their offer covers proposing the same thing back.
        actions: actions.filter((a) => !(incoming && a.command.kind === "diplomacy" && a.command.action === `propose-${incoming.kind}`)),
      };
    });
}

export function incomingProposals(state: GameState, me: string): Proposal[] {
  return state.proposals.filter((p) => p.to === me && state.factions[p.from]?.alive);
}
