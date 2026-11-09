import {
  applyCommand,
  createGame,
  generateRandomScenario,
  nextAiCommand,
  placeholderResolver,
  presetScenario,
  rejectAiCommand,
  resolveBattle,
  scenarioProvince,
  startAiTurn,
  visibleProvinces,
  type AiTurn,
  type BattleResolver,
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
import { SAVE_FORMAT, SAVE_VERSION, type SaveData } from "./save";

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
  /** The faction the player controls; defaults to the scenario's first faction. */
  humanFaction?: string;
}

export interface NewGameSettings extends Partial<GameRules> {
  /** "random" (the default) or a preset map id; presets ignore `provinces` and `factions`. */
  map?: string;
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

export interface SessionOptions {
  /** Settles battles that are not watched. Defaults to the quick resolver, which tests use. */
  resolver?: BattleResolver;
  /**
   * Lets computer turns run in slices so the screen can repaint between them,
   * e.g. `(fn) => setTimeout(fn, 0)`. Without it they run to completion at once.
   */
  schedule?: (fn: () => void) => void;
}

const MAX_LOG = 60;
const AI_SLICE_MS = 30;
const MAX_AI_COMMANDS = 400;

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
  private readonly resolver: BattleResolver;
  private readonly schedule: SessionOptions["schedule"];
  private aiTurn: AiTurn | null = null;
  private aiCommands = 0;
  private aiVisible = new Set<string>();
  private aiScheduled = false;

  constructor(state: GameState, initialEvents: GameEvent[] = [], options: SessionOptions = {}) {
    this.state = state;
    this.resolver = options.resolver ?? placeholderResolver;
    this.schedule = options.schedule;
    this.record(initialEvents);
    this.proceed();
  }

  static newRandomGame(settings: NewGameSettings, options: SessionOptions = {}): GameSession {
    if (settings.map && settings.map !== "random") return GameSession.fromScenario(presetScenario(settings.map), settings.seed, settings, options);
    const scenario = generateRandomScenario({
      seed: settings.seed,
      provinces: settings.provinces,
      factions: settings.factions,
    });
    return GameSession.fromScenario(scenario, settings.seed, settings, options);
  }

  static fromScenario(scenario: Scenario, seed: number, rules: Partial<GameRules> = {}, options: SessionOptions = {}): GameSession {
    const human = rules.humanFaction && scenario.factions.some((f) => f.id === rules.humanFaction) ? rules.humanFaction : scenario.factions[0]!.id;
    const { state, events } = createGame(scenario, {
      seed,
      difficulty: rules.difficulty ?? DEFAULT_RULES.difficulty,
      victory: rules.victory ?? DEFAULT_RULES.victory,
      controllers: { [human]: "human" },
    });
    return new GameSession(state, events, options);
  }

  /** Resumes a saved game. */
  static fromSave(save: SaveData, options: SessionOptions = {}): GameSession {
    const session = new GameSession(save.state, [], options);
    session.log = [...save.log, ...session.log].slice(-MAX_LOG);
    session.nextLogId = Math.max(0, ...session.log.map((e) => e.id)) + 1;
    session.battleReports = [...save.battleReports, ...session.battleReports];
    return session;
  }

  toSave(): SaveData {
    return {
      format: SAVE_FORMAT,
      version: SAVE_VERSION,
      savedAt: Date.now(),
      state: this.state,
      log: this.log,
      battleReports: this.battleReports,
    };
  }

  /** Whether this is a good moment to autosave: nothing is half-done in the background. */
  get settled(): boolean {
    return !this.aiScheduled && (this.isHumanTurn || !!this.state.winner || this.defeated);
  }

  get gameOver(): boolean {
    return !!this.state.winner || this.defeated;
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
    if (command.kind === "end-turn") this.selection = { province: null, army: null };
    this.proceed();
    this.fixSelection();
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

  /** A battle a human fights in, waiting for the player to Watch or Skip it. */
  get battlePrompt(): PendingBattle | null {
    const battle = this.state.pendingBattle;
    return battle && this.humanFights(battle) ? battle : null;
  }

  /** Resolves the prompted battle headless. Same simulation as watching it. */
  skipBattle(): void {
    const battle = this.battlePrompt;
    if (!battle) return;
    this.finishBattle(this.resolver(battle, scenarioProvince(this.state, battle.province).terrain));
  }

  /** Applies the result of the prompted battle, e.g. once the player has watched it. */
  finishBattle(result: BattleResult): void {
    const battle = this.battlePrompt;
    if (!battle) return;
    this.applyBattleResult(battle, result);
    this.fixSelection();
    this.proceed();
    this.emit();
  }

  /** True while computer factions are still taking their turns in the background. */
  get aiBusy(): boolean {
    return this.aiScheduled;
  }

  private humanFights(battle: PendingBattle): boolean {
    return [battle.attacker.faction, battle.defender.faction].some((f) => f && this.state.factions[f]?.controller === "human");
  }

  private applyBattleResult(battle: PendingBattle, result: BattleResult): void {
    const actor = this.state.activeFaction;
    const visibleBefore = visibleProvinces(this.state, this.viewer);
    const resolved = resolveBattle(this.state, result);
    if (!resolved.ok) throw new Error(resolved.error);
    if (this.humanFights(battle)) this.battleReports.push({ battle, result });
    this.state = resolved.state;
    this.record(resolved.events, actor, visibleBefore);
  }

  /**
   * Moves the game forward until a human has to act: settles battles between
   * computer factions, and plays computer turns. Stops at a battle a human
   * fights in, which waits for Watch or Skip.
   */
  private proceed(): void {
    const deadline = this.schedule ? performance.now() + AI_SLICE_MS : Infinity;
    this.aiScheduled = false;
    while (!this.state.winner && !this.defeated) {
      const battle = this.state.pendingBattle;
      if (battle) {
        if (this.humanFights(battle)) return;
        this.applyBattleResult(battle, this.resolver(battle, scenarioProvince(this.state, battle.province).terrain));
        continue;
      }
      if (this.state.factions[this.state.activeFaction]?.controller !== "ai") {
        this.aiTurn = null;
        return;
      }
      if (performance.now() > deadline) {
        this.aiScheduled = true;
        this.schedule!(() => {
          this.proceed();
          this.emit();
        });
        return;
      }
      this.stepAi();
    }
  }

  private stepAi(): void {
    if (!this.aiTurn || this.aiTurn.me !== this.state.activeFaction) {
      this.aiTurn = startAiTurn(this.state);
      this.aiCommands = 0;
      this.aiVisible = visibleProvinces(this.state, this.viewer);
    }
    const actor = this.state.activeFaction;
    const command: Command = ++this.aiCommands > MAX_AI_COMMANDS ? { kind: "end-turn" } : nextAiCommand(this.state, this.aiTurn);
    const result = applyCommand(this.state, command);
    if (!result.ok) {
      if (command.kind === "end-turn") throw new Error(`AI could not end its turn: ${result.error}`);
      rejectAiCommand(this.aiTurn, command);
      return;
    }
    this.state = result.state;
    this.record(result.events, actor, this.aiVisible);
    if (command.kind === "end-turn") this.aiTurn = null;
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
