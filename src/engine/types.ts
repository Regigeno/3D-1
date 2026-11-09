export const MILITARY_TYPES = ["infantry", "ranged", "cavalry", "artillery", "special"] as const;
export type MilitaryType = (typeof MILITARY_TYPES)[number];

export const MAIN_ERAS = ["prehistoric", "ancient", "medieval", "modern", "futuristic"] as const;
export type MainEra = (typeof MAIN_ERAS)[number];
export type Era = MainEra | "fantastical";
export const ALL_ERAS: readonly Era[] = [...MAIN_ERAS, "fantastical"];

export type Terrain = "plains" | "forest" | "hills" | "mountains" | "desert" | "coast" | "wasteland";
export type SpecialResource = "ley-line" | "power-site";

export const BUILDINGS = ["market", "library", "shrine", "power-plant", "fort", "barracks"] as const;
export type Building = (typeof BUILDINGS)[number];

export type ResourceKind = "gold" | "knowledge" | "mana" | "energy";
export type Resources = Record<ResourceKind, number>;
export type Cost = Partial<Resources>;

// ---------- Scenario (static map data) ----------

export interface ScenarioProvince {
  id: string;
  name: string;
  terrain: Terrain;
  neighbors: string[];
  baseIncome: number;
  special?: SpecialResource;
  position: { x: number; y: number };
  /** Outline in map units. When missing, the renderer derives a Voronoi cell from the positions. */
  polygon?: Array<[number, number]>;
}

export interface FactionStart {
  id: string;
  name: string;
  color: string;
  capital: string;
}

export interface Scenario {
  id: string;
  name: string;
  kind: "fictional" | "fantasy-earth" | "random";
  /** Map extent in map units; province positions lie inside [0, width] x [0, height]. */
  bounds?: { width: number; height: number };
  provinces: ScenarioProvince[];
  factions: FactionStart[];
}

// ---------- Game state (everything that changes) ----------

export type Controller = "human" | "ai";
export const AI_PERSONALITIES = ["aggressive", "builder", "opportunist"] as const;
export type AiPersonality = (typeof AI_PERSONALITIES)[number];
export type Difficulty = "easy" | "normal" | "hard";

export type VictoryCondition =
  | { kind: "domination"; percent: number }
  | { kind: "capitals" }
  | { kind: "score"; turnLimit: number };

export interface FactionState {
  id: string;
  name: string;
  color: string;
  capital: string;
  controller: Controller;
  aiPersonality?: AiPersonality;
  resources: Resources;
  research: Record<MilitaryType, Era[]>;
  alive: boolean;
}

export interface ProvinceState {
  owner: string | null;
  buildings: Building[];
}

export interface Squad {
  type: MilitaryType;
  era: Era;
  soldiers: number;
}

export interface Army {
  id: string;
  owner: string;
  location: string;
  movementLeft: number;
  squads: Squad[];
}

export type RelationStatus = "war" | "peace" | "alliance";

export interface Relation {
  status: RelationStatus;
  sinceTurn: number;
  trust: number;
}

export interface Proposal {
  from: string;
  to: string;
  kind: "peace" | "alliance";
  turn: number;
}

export type SquadSource = { kind: "army"; armyId: string; squadIndex: number } | { kind: "garrison" };

export interface BattleSide {
  faction: string | null;
  squads: Squad[];
}

export interface PendingBattle {
  id: string;
  seed: number;
  province: string;
  attackerFrom: string;
  attackerArmyId: string;
  attacker: BattleSide;
  defender: BattleSide;
  /** Where each defender squad came from, by index, so survivors can be written back. */
  defenderSources: SquadSource[];
  /** The defender holds a Fort here, which gives them a palisade on the battlefield. */
  fortified?: boolean;
}

export interface GameOptions {
  seed: number;
  difficulty: Difficulty;
  victory: VictoryCondition;
  controllers?: Record<string, Controller>;
  personalities?: Record<string, AiPersonality>;
}

export interface GameState {
  version: 1;
  scenario: Scenario;
  options: GameOptions;
  rngState: number;
  nextId: number;
  turn: number;
  activeFaction: string;
  factionOrder: string[];
  factions: Record<string, FactionState>;
  provinces: Record<string, ProvinceState>;
  armies: Record<string, Army>;
  /** Keyed by `relationKey(a, b)`. */
  relations: Record<string, Relation>;
  proposals: Proposal[];
  pendingBattle: PendingBattle | null;
  winner: string | null;
}

// ---------- Commands ----------

export type Command =
  /** `era` defaults to the best unlocked main-line era; pass "fantastical" to recruit that branch. */
  | { kind: "recruit"; province: string; type: MilitaryType; era?: Era }
  | { kind: "research"; type: MilitaryType; era: Era }
  | { kind: "build"; province: string; building: Building }
  | { kind: "move"; army: string; to: string }
  | { kind: "split"; army: string; squads: number[] }
  | { kind: "merge"; armies: string[] }
  | { kind: "upgrade-squad"; army: string; squad: number }
  | { kind: "disband"; army: string; squads: number[] }
  | { kind: "diplomacy"; target: string; action: "propose-peace" | "propose-alliance" | "declare-war" }
  | { kind: "respond-proposal"; from: string; accept: boolean }
  | { kind: "end-turn" };

// ---------- Events (what happened, for UI and logs) ----------

export type GameEvent =
  | { kind: "income"; faction: string; gained: Resources; upkeep: number }
  | { kind: "desertion"; faction: string; armyId: string; squad: Squad }
  | { kind: "recruited"; faction: string; armyId: string; squad: Squad }
  | { kind: "researched"; faction: string; type: MilitaryType; era: Era }
  | { kind: "built"; faction: string; province: string; building: Building }
  | { kind: "moved"; armyId: string; from: string; to: string }
  | { kind: "captured"; faction: string; province: string; previousOwner: string | null }
  | { kind: "battle-started"; battle: PendingBattle }
  | {
      kind: "battle-resolved";
      battleId: string;
      winner: "attacker" | "defender";
      province: string;
      attacker: string | null;
      defender: string | null;
    }
  | { kind: "split"; armyId: string; newArmyId: string }
  | { kind: "merged"; into: string; removed: string[] }
  | { kind: "upgraded"; armyId: string; squadIndex: number; era: Era }
  | { kind: "disbanded"; armyId: string; squads: Squad[] }
  | { kind: "relation-changed"; a: string; b: string; status: RelationStatus }
  | { kind: "proposal"; proposal: Proposal }
  | { kind: "proposal-rejected"; proposal: Proposal }
  | { kind: "eliminated"; faction: string }
  | { kind: "turn-started"; faction: string; turn: number }
  | { kind: "victory"; faction: string };

export type CommandResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };

// ---------- Battle resolution ----------

export interface BattleResult {
  winner: "attacker" | "defender";
  /** Soldiers remaining per squad, same order as the pending battle's squads. */
  attackerSurvivors: number[];
  defenderSurvivors: number[];
}

export type BattleResolver = (battle: PendingBattle, terrain: Terrain) => BattleResult;
