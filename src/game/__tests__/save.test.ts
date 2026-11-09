import { describe, expect, it } from "vitest";
import { lineScenario } from "../../engine/__tests__/fixtures";
import { parseSave, saveFileName } from "../save";
import { GameSession } from "../session";
import { AUTOSAVE_ID, MAX_MANUAL_SAVES, MemoryStore, SaveStore } from "../storage";

function playedSession(): GameSession {
  const session = GameSession.fromScenario(lineScenario(), 7);
  session.dispatch({ kind: "end-turn" });
  const army = Object.values(session.state.armies).find((a) => a.owner === "red")!;
  session.dispatch({ kind: "move", army: army.id, to: "B" });
  return session;
}

describe("saves", () => {
  it("round-trips through JSON and continues exactly like the original", () => {
    const original = playedSession();
    const loaded = GameSession.fromSave(parseSave(JSON.stringify(original.toSave())));
    expect(loaded.state).toEqual(original.state);
    expect(loaded.log.map((e) => e.text)).toEqual(original.log.map((e) => e.text));

    original.dispatch({ kind: "end-turn" });
    loaded.dispatch({ kind: "end-turn" });
    expect(loaded.state).toEqual(original.state);
  });

  it("keeps an unanswered battle prompt", () => {
    const session = GameSession.fromScenario(lineScenario(), 1);
    session.dispatch({ kind: "end-turn" });
    session.state.provinces.B!.owner = "blue";
    session.state.provinces.B!.buildings.push("fort");
    const army = Object.values(session.state.armies).find((a) => a.owner === "red")!;
    session.dispatch({ kind: "move", army: army.id, to: "B" });
    expect(session.battlePrompt).not.toBeNull();
    const loaded = GameSession.fromSave(parseSave(JSON.stringify(session.toSave())));
    expect(loaded.battlePrompt).toEqual(session.battlePrompt);
  });

  it("rejects files that are not saves, with a readable reason", () => {
    expect(() => parseSave("not json")).toThrow(/not valid JSON/);
    expect(() => parseSave("{}")).toThrow(/not a Petty Empires save/);
    expect(() => parseSave(JSON.stringify({ format: "petty-empires-save", version: 99 }))).toThrow(/unsupported version/);
    expect(() => parseSave(JSON.stringify({ format: "petty-empires-save", version: 1, state: { version: 1 } }))).toThrow(/damaged/);
  });

  it("names exported files after the faction and turn", () => {
    expect(saveFileName(playedSession().toSave())).toBe("petty-empires-red-turn-2.json");
  });
});

describe("SaveStore", () => {
  it("lists saves newest first and replaces the autosave in place", () => {
    const store = new SaveStore(new MemoryStore());
    const session = playedSession();
    store.write({ ...session.toSave(), savedAt: 1 }, AUTOSAVE_ID);
    const manual = store.write({ ...session.toSave(), savedAt: 2 });
    store.write({ ...session.toSave(), savedAt: 3 }, AUTOSAVE_ID);
    expect(store.list().map((s) => s.id)).toEqual([AUTOSAVE_ID, manual.id]);
    expect(store.autosave?.turn).toBe(2);
    expect(store.read(manual.id).state).toEqual(session.state);
    store.delete(manual.id);
    expect(store.list().map((s) => s.id)).toEqual([AUTOSAVE_ID]);
    expect(() => store.read(manual.id)).toThrow(/no longer exists/);
  });

  it("drops the oldest manual saves beyond the limit", () => {
    const backing = new MemoryStore();
    const store = new SaveStore(backing);
    const save = playedSession().toSave();
    const ids = Array.from({ length: MAX_MANUAL_SAVES + 2 }, (_, i) => store.write({ ...save, savedAt: i }).id);
    const listed = store.list().map((s) => s.id);
    expect(listed).toHaveLength(MAX_MANUAL_SAVES);
    expect(listed).not.toContain(ids[0]);
    expect(backing.getItem(`petty-empires:save:${ids[0]}`)).toBeNull();
  });

  it("explains a full storage", () => {
    const full = new MemoryStore();
    full.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => new SaveStore(full).write(playedSession().toSave())).toThrow(/storage is full/);
  });
});
