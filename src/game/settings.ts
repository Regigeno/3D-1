import type { KeyValueStore } from "./storage";

export type GraphicsQuality = "high" | "low";
/** What happens when one of your battles starts. */
export type BattleMode = "ask" | "watch" | "skip";

export interface Settings {
  /** 0 to 1. */
  volume: number;
  muted: boolean;
  graphics: GraphicsQuality;
  battles: BattleMode;
  /** Shown once at the start of the first campaign. */
  seenIntro: boolean;
}

export const DEFAULT_SETTINGS: Settings = { volume: 0.6, muted: false, graphics: "high", battles: "ask", seenIntro: false };

const KEY = "petty-empires:settings";

/** User preferences, persisted in browser storage and observable from React. */
export class SettingsStore {
  private current: Settings;
  private listeners = new Set<() => void>();

  constructor(private readonly store: KeyValueStore | null) {
    this.current = { ...DEFAULT_SETTINGS, ...read(store) };
  }

  get = (): Settings => this.current;

  set(patch: Partial<Settings>): void {
    this.current = { ...this.current, ...patch };
    try {
      this.store?.setItem(KEY, JSON.stringify(this.current));
    } catch {
      // Preferences are a convenience; keep them for this visit if storage is full.
    }
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

function read(store: KeyValueStore | null): Partial<Settings> {
  try {
    const parsed = JSON.parse(store?.getItem(KEY) ?? "{}") as Partial<Settings>;
    const out: Partial<Settings> = {};
    if (typeof parsed.volume === "number") out.volume = Math.min(1, Math.max(0, parsed.volume));
    if (typeof parsed.muted === "boolean") out.muted = parsed.muted;
    if (parsed.graphics === "high" || parsed.graphics === "low") out.graphics = parsed.graphics;
    if (parsed.battles === "ask" || parsed.battles === "watch" || parsed.battles === "skip") out.battles = parsed.battles;
    if (typeof parsed.seenIntro === "boolean") out.seenIntro = parsed.seenIntro;
    return out;
  } catch {
    return {};
  }
}
