import {
  applyCommand,
  createGame,
  generateRandomScenario,
  placeholderResolver,
  playAiTurn,
  resolveBattle,
  scenarioProvince,
  visibleProvinces,
  type BattleResult,
  type Command,
  type Difficulty,
  type GameEvent,
  type GameState,
  type PendingBattle,
  type Scenario,
  type VictoryCondition,
} from "../engine";
import { describeEvent } from "./describe";

export interface Selection {
  province: string | null;
  army: string | null;
}

/** "capture" takes an undefended province; "attack" starts a battle. */
export type MoveKind = "move" | "capture" | "attack";

export interface LogEntry {
  id: number;
  turn: number;
  text: string;
  faction: string | null;
}

export interface GameRules {
  difficulty: Difficulty;
  victory: VictoryCondition;
}

export interface NewGameSettings extends Partial<GameRules> {
  seed: number;
  provinces: number;
  factions: number;
}

export const DEFAULT_RULES: GameRules = {
  difficulty: "normal",
  victory: { kind: "domination", percent: 70 },
};

export interface BattleReport {
  battle: PendingBattle;
  result: BattleResult;
}

const MAX_LOG = 60;

/**
 * Owns the current game for the UI: applies commands, keeps the selection and
 * a readable event log, and plays non-human turns. Listeners are notified after
 * every change; `version` lets React detect it.
 */
export class GameSession {
  state: GameState;
  selection: Selection = { province: null, army: null };
  log: LogEntry[] = [];
  lastError: string | null = null;
  /** Battles a human faction fought that the player has not dismissed yet, oldest first. */
  battleReports: BattleReport[] = [];
  version = 0;

  private listeners = new Set<() => void>();
  private nextLogId = 1;

  constructor(state: GameState, initialEvents: GameEvent[] = []) {
    this.state = state;
    this.record(initialEvents);
    this.playAiTurns();
  }

  static newRandomGame(settings: NewGameSettings): GameSession {
    const scenario = generateRandomScenario({
      seed: settings.seed,
      provinces: settings.provinces,
      factions: settings.factions,
    });
    return GameSession.fromScenario(scenario, settings.seed, settings);
  }

  static fromScenario(scenario: Scenario, seed: number, rules: Partial<GameRules> = {}): GameSession {
    const human = scenario.factions[0]!.id;
    const { state, events } = createGame(scenario, {
      seed,
      difficulty: rules.difficulty ?? DEFAULT_RULES.difficulty,
      victory: rules.victory ?? DEFAULT_RULES.victory,
      controllers: { [human]: "human" },
    });
    return new GameSession(state, events);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  /** The faction whose eyes the map is drawn through: the active human, else the first human. */
  get viewer(): string {
    const active = this.state.factions[this.state.activeFaction];
    if (active?.controller === "human") return active.id;
    return Object.values(this.state.factions).find((f) => f.controller === "human")?.id ?? this.state.factionOrder[0]!;
  }

  /** True once every human faction is eliminated; the computer factions stop playing then. */
  get defeated(): boolean {
    return !this.state.winner && !Object.values(this.state.factions).some((f) => f.controller === "human" && f.alive);
  }

  get isHumanTurn(): boolean {
    return this.state.factions[this.state.activeFaction]?.controller === "human" && !this.state.winner;
  }

  dispatch(command: Command): boolean {
    const actor = this.state.activeFaction;
    const result = applyCommand(this.state, command);
    if (!result.ok) {
      this.lastError = result.error;
      this.emit();
      return false;
    }
    this.lastError = null;
    this.state = result.state;
    this.record(result.events, actor);
    this.resolveBattles(actor);
    this.fixSelection();
    if (command.kind === "end-turn") {
      this.selection = { province: null, army: null };
      this.playAiTurns();
    }
    this.emit();
    return true;
  }

  selectProvince(province: string | null): void {
    this.selection = { province, army: null };
    this.lastError = null;
    this.emit();
  }

  selectArmy(armyId: string): void {
    const army = this.state.armies[armyId];
    if (!army) return;
    this.selection = { province: army.location, army: armyId };
    this.lastError = null;
    this.emit();
  }

  clearSelection(): void {
    this.selectProvince(null);
  }

  /** Handles a click on a province: moves the selected army there if possible, otherwise selects it. */
  clickProvince(province: string): void {
    const armyId = this.selection.army;
    if (armyId && this.isHumanTurn && this.moveTargets(armyId).has(province)) {
      this.dispatch({ kind: "move", army: armyId, to: province });
      return;
    }
    this.selectProvince(province);
  }

  /** Neighbors the army can legally move into, and whether that move starts a fight or capture. */
  moveTargets(armyId: string): Map<string, MoveKind> {
    const targets = new Map<string, MoveKind>();
    const army = this.state.armies[armyId];
    if (!army || army.owner !== this.state.activeFaction || this.state.pendingBattle) return targets;
    const province = this.state.scenario.provinces.find((p) => p.id === army.location);
    for (const to of province?.neighbors ?? []) {
      const result = applyCommand(this.state, { kind: "move", army: armyId, to });
      if (!result.ok) continue;
      const kind: MoveKind = result.events.some((e) => e.kind === "battle-started")
        ? "attack"
        : result.events.some((e) => e.kind === "captured")
          ? "capture"
          : "move";
      targets.set(to, kind);
    }
    return targets;
  }

  /** Why a command would be rejected right now, or null if it is legal. Does not change anything. */
  check(command: Command): string | null {
    const result = applyCommand(this.state, command);
    return result.ok ? null : result.error;
  }

  get battleReport(): BattleReport | null {
    return this.battleReports[0] ?? null;
  }

  dismissBattleReport(): void {
    this.battleReports.shift();
    this.emit();
  }

  /** Settles any pending battle. Battles a human fought are queued as reports. */
  private settle = (state: GameState): { state: GameState; events: GameEvent[] } => {
    // Placeholder until physics battles (build step 6): resolve instantly.
    const events: GameEvent[] = [];
    let current = state;
    while (current.pendingBattle) {
      const battle = current.pendingBattle;
      const result = placeholderResolver(battle, scenarioProvince(current, battle.province).terrain);
      const resolved = resolveBattle(current, result);
      if (!resolved.ok) throw new Error(resolved.error);
      const humanInvolved = [battle.attacker.faction, battle.defender.faction].some(
        (f) => f && current.factions[f]?.controller === "human",
      );
      if (humanInvolved) this.battleReports.push({ battle, result });
      current = resolved.state;
      events.push(...resolved.events);
    }
    return { state: current, events };
  };

  private resolveBattles(actor: string): void {
    if (!this.state.pendingBattle) return;
    const visibleBefore = visibleProvinces(this.state, this.viewer);
    const { state, events } = this.settle(this.state);
    this.state = state;
    this.record(events, actor, visibleBefore);
  }

  private playAiTurns(): void {
    let guard = 0;
    while (!this.state.winner && !this.defeated && this.state.factions[this.state.activeFaction]?.controller === "ai" && guard++ < 100) {
      const actor = this.state.activeFaction;
      const visibleBefore = visibleProvinces(this.state, this.viewer);
      const { state, events } = playAiTurn(this.state, this.settle);
      this.state = state;
      this.record(events, actor, visibleBefore);
    }
  }

  private fixSelection(): void {
    const { army } = this.selection;
    if (army) {
      const current = this.state.armies[army];
      if (!current) this.selection = { province: this.selection.province, army: null };
      else this.selection = { province: current.location, army };
    }
  }

  /**
   * Adds events to the log, skipping what the viewing player could not know:
   * other factions' recruiting, research and building, and fighting out of sight.
   */
  private record(events: GameEvent[], actor: string | null = null, visibleBefore?: Set<string>): void {
    const viewer = this.viewer;
    const visible = visibleProvinces(this.state, viewer);
    for (const p of visibleBefore ?? []) visible.add(p);
    for (const event of events) {
      if (!eventVisibleTo(this.state, viewer, actor, visible, event)) continue;
      const described = describeEvent(this.state, event);
      if (!described) continue;
      this.log.push({ id: this.nextLogId++, turn: this.state.turn, ...described });
    }
    if (this.log.length > MAX_LOG) this.log.splice(0, this.log.length - MAX_LOG);
  }

  private emit(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }
}

function eventVisibleTo(state: GameState, viewer: string, actor: string | null, visible: Set<string>, e: GameEvent): boolean {
  const human = (f: string | null) => !!f && state.factions[f]?.controller === "human";
  switch (e.kind) {
    case "turn-started":
      return human(e.faction);
    case "income":
    case "desertion":
    case "recruited":
    case "researched":
    case "built":
      return e.faction === viewer;
    case "disbanded":
    case "split":
    case "merged":
    case "upgraded":
      return actor === viewer;
    case "captured":
      return e.faction === viewer || e.previousOwner === viewer || visible.has(e.province);
    case "battle-started":
      return [e.battle.attacker.faction, e.battle.defender.faction].includes(viewer) || visible.has(e.battle.province);
    case "battle-resolved":
      return e.attacker === viewer || e.defender === viewer || visible.has(e.province);
    case "proposal":
    case "proposal-rejected":
      return e.proposal.from === viewer || e.proposal.to === viewer;
    default:
      return true;
  }
}
