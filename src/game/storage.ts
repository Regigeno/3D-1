import { parseSave, summarize, type SaveData, type SaveSummary } from "./save";

/** The slice of the Web Storage API the save store needs; tests pass an in-memory one. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PREFIX = "petty-empires:";
const INDEX_KEY = `${PREFIX}saves`;
const saveKey = (id: string) => `${PREFIX}save:${id}`;

export const AUTOSAVE_ID = "autosave";
export const MAX_MANUAL_SAVES = 12;

/**
 * Saved games in browser storage: one autosave slot plus manual saves. An index
 * of summaries is kept separately so the menu can list saves without parsing
 * every game state.
 */
export class SaveStore {
  constructor(private readonly store: KeyValueStore | null = browserStore()) {}

  get available(): boolean {
    return this.store !== null;
  }

  list(): SaveSummary[] {
    if (!this.store) return [];
    try {
      const index = JSON.parse(this.store.getItem(INDEX_KEY) ?? "[]") as SaveSummary[];
      return Array.isArray(index) ? [...index].sort((a, b) => b.savedAt - a.savedAt) : [];
    } catch {
      return [];
    }
  }

  get autosave(): SaveSummary | null {
    return this.list().find((s) => s.id === AUTOSAVE_ID) ?? null;
  }

  read(id: string): SaveData {
    const text = this.store?.getItem(saveKey(id));
    if (!text) throw new Error("That save no longer exists.");
    return parseSave(text);
  }

  /** Stores a save under `id` (a new id when omitted) and returns its summary. */
  write(save: SaveData, id: string = newId()): SaveSummary {
    if (!this.store) throw new Error("Saving is not available in this browser.");
    const summary = summarize(id, save);
    const manual = this.list().filter((s) => s.id !== id && s.id !== AUTOSAVE_ID);
    const autosave = this.list().filter((s) => s.id === AUTOSAVE_ID && s.id !== id);
    // Keep the newest manual saves when the list is full.
    const keep = id === AUTOSAVE_ID ? manual : manual.slice(0, MAX_MANUAL_SAVES - 1);
    for (const dropped of manual.slice(keep.length)) this.store.removeItem(saveKey(dropped.id));
    try {
      this.store.setItem(saveKey(id), JSON.stringify(save));
      this.store.setItem(INDEX_KEY, JSON.stringify([summary, ...autosave, ...keep]));
    } catch {
      throw new Error("Browser storage is full. Delete some saved games or export them as files.");
    }
    return summary;
  }

  delete(id: string): void {
    if (!this.store) return;
    this.store.removeItem(saveKey(id));
    this.store.setItem(INDEX_KEY, JSON.stringify(this.list().filter((s) => s.id !== id)));
  }
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function browserStore(): KeyValueStore | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const probe = `${PREFIX}probe`;
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

/** In-memory store for tests and for browsers that block storage. */
export class MemoryStore implements KeyValueStore {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}
