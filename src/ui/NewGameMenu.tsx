import { useRef, useState } from "react";
import { PRESETS, type Difficulty, type VictoryCondition } from "../engine";
import { parseSave, saveFileName, type SaveData, type SaveSummary } from "../game/save";
import type { NewGameSettings } from "../game/session";
import { AUTOSAVE_ID } from "../game/storage";
import { HelpPanel } from "./HelpPanel";
import { downloadJson, saves, timeAgo } from "./services";
import { SettingsPanel } from "./SettingsPanel";

const randomSeed = () => Math.floor(Math.random() * 1_000_000);

const DIFFICULTIES: Array<{ id: Difficulty; label: string; hint: string }> = [
  { id: "easy", label: "Easy", hint: "Rivals earn 15% less and only attack with clear odds." },
  { id: "normal", label: "Normal", hint: "Rivals play by your rules, with your income." },
  { id: "hard", label: "Hard", hint: "Rivals earn 25% more and take bolder risks. They never see through fog." },
];

interface Props {
  onStart(settings: NewGameSettings): void;
  onLoad(save: SaveData): void;
}

function SaveRow({ summary, onLoad, onDelete }: { summary: SaveSummary; onLoad(): void; onDelete(): void }) {
  return (
    <li className="save-row">
      <span className="swatch" style={{ background: summary.color }} />
      <div className="save-info">
        <strong>
          {summary.faction} · turn {summary.turn}
        </strong>
        <span className="muted small">
          {summary.id === AUTOSAVE_ID ? "Autosave · " : ""}
          {summary.scenario} · {timeAgo(summary.savedAt)}
        </span>
      </div>
      <button className="small" onClick={onLoad}>
        Load
      </button>
      <button
        className="ghost small"
        title="Export as a file"
        onClick={() => {
          const save = saves.read(summary.id);
          downloadJson(saveFileName(save), save);
        }}
      >
        Export
      </button>
      <button className="ghost small danger" title="Delete" onClick={onDelete}>
        Delete
      </button>
    </li>
  );
}

export function NewGameMenu({ onStart, onLoad }: Props) {
  const [map, setMap] = useState("random");
  const [humanFaction, setHumanFaction] = useState<string | undefined>(undefined);
  const [seed, setSeed] = useState(randomSeed);
  const [provinces, setProvinces] = useState(40);
  const [factions, setFactions] = useState(4);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [victoryKind, setVictoryKind] = useState<VictoryCondition["kind"]>("domination");
  const [percent, setPercent] = useState(70);
  const [turnLimit, setTurnLimit] = useState(30);
  const [list, setList] = useState(() => saves.list());
  const [showSaves, setShowSaves] = useState(false);
  const [dialog, setDialog] = useState<"settings" | "help" | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const preset = PRESETS.find((p) => p.id === map);
  const autosave = list.find((s) => s.id === AUTOSAVE_ID && !s.finished);
  const victory = (): VictoryCondition =>
    victoryKind === "domination" ? { kind: "domination", percent } : victoryKind === "capitals" ? { kind: "capitals" } : { kind: "score", turnLimit };

  const load = (id: string) => {
    try {
      onLoad(saves.read(id));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setList(saves.list());
    }
  };

  const importFile = async (file: File) => {
    try {
      onLoad(parseSave(await file.text()));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="menu">
      <div className="menu-layout">
        <form
          className="menu-card panel"
          onSubmit={(e) => {
            e.preventDefault();
            onStart({ map, seed, provinces, factions, difficulty, victory: victory(), humanFaction: preset ? (humanFaction ?? preset.factions[0]!.id) : undefined });
          }}
        >
          <h1>Petty Empires</h1>
          <p className="muted">Turn-based conquest. Physics battles. Every era at once.</p>

          {autosave && (
            <button type="button" className="primary continue" onClick={() => load(AUTOSAVE_ID)}>
              Continue
              <span className="small">
                {autosave.faction} · turn {autosave.turn} · {timeAgo(autosave.savedAt)}
              </span>
            </button>
          )}

          <label>
            <span>Map</span>
            <select
              value={map}
              onChange={(e) => {
                setMap(e.target.value);
                setHumanFaction(undefined);
              }}
            >
              <option value="random">Random island</option>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="small">{preset ? preset.description : "A new island every time. Pick its size and how many empires share it."}</span>
          </label>

          {preset && (
            <label>
              <span>Play as</span>
              <select value={humanFaction ?? preset.factions[0]!.id} onChange={(e) => setHumanFaction(e.target.value)}>
                {preset.factions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            <span>Seed</span>
            <div className="row">
              <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} />
              <button type="button" className="ghost" onClick={() => setSeed(randomSeed())} title="New random seed">
                Reroll
              </button>
            </div>
          </label>

          {!preset && (
            <>
              <label>
                <span>Provinces: {provinces}</span>
                <input type="range" min={30} max={60} step={5} value={provinces} onChange={(e) => setProvinces(Number(e.target.value))} />
              </label>

              <label>
                <span>Factions: {factions}</span>
                <input type="range" min={2} max={6} value={factions} onChange={(e) => setFactions(Number(e.target.value))} />
              </label>
            </>
          )}

          <div className="field">
            <span>Difficulty</span>
            <div className="segmented" role="radiogroup" aria-label="Difficulty">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={difficulty === d.id}
                  className={difficulty === d.id ? "active" : undefined}
                  onClick={() => setDifficulty(d.id)}
                  title={d.hint}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <span className="small">{DIFFICULTIES.find((d) => d.id === difficulty)!.hint}</span>
          </div>

          <label>
            <span>Victory</span>
            <select value={victoryKind} onChange={(e) => setVictoryKind(e.target.value as VictoryCondition["kind"])}>
              <option value="domination">Domination: hold {percent}% of provinces</option>
              <option value="capitals">Capitals: hold every capital</option>
              <option value="score">Score: best score after {turnLimit} turns</option>
            </select>
          </label>

          {victoryKind === "domination" && (
            <label>
              <span>Provinces to hold: {percent}%</span>
              <input type="range" min={50} max={90} step={5} value={percent} onChange={(e) => setPercent(Number(e.target.value))} />
            </label>
          )}
          {victoryKind === "score" && (
            <label>
              <span>Turn limit: {turnLimit}</span>
              <input type="range" min={15} max={60} step={5} value={turnLimit} onChange={(e) => setTurnLimit(Number(e.target.value))} />
            </label>
          )}

          <button type="submit" className={autosave ? "" : "primary"}>
            Start campaign
          </button>

          <div className="menu-links">
            <button type="button" className="ghost small" onClick={() => setShowSaves((v) => !v)}>
              Saved games{list.length ? ` (${list.length})` : ""}
            </button>
            <button type="button" className="ghost small" onClick={() => setDialog("settings")}>
              Settings
            </button>
            <button type="button" className="ghost small" onClick={() => setDialog("help")}>
              How to play
            </button>
          </div>
        </form>

        {showSaves && (
          <section className="menu-card panel saves">
            <header className="research-head">
              <h2>Saved games</h2>
              <div className="spacer" />
              <button className="ghost icon-button" onClick={() => setShowSaves(false)} title="Close">
                ×
              </button>
            </header>
            {!saves.available && <p className="bad small">This browser blocks storage, so games cannot be saved here. Export and import files instead.</p>}
            {list.length === 0 ? (
              <p className="muted small">No saved games yet. Your campaign saves itself every turn, and you can save copies from the in-game menu.</p>
            ) : (
              <ul className="save-list">
                {list.map((s) => (
                  <SaveRow
                    key={s.id}
                    summary={s}
                    onLoad={() => load(s.id)}
                    onDelete={() => {
                      saves.delete(s.id);
                      setList(saves.list());
                    }}
                  />
                ))}
              </ul>
            )}
            <button type="button" onClick={() => fileRef.current?.click()}>
              Import a save file…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void importFile(file);
              }}
            />
          </section>
        )}
      </div>

      {loadError && (
        <div className="toast error" onClick={() => setLoadError(null)}>
          {loadError}
        </div>
      )}
      {dialog === "settings" && <SettingsPanel onClose={() => setDialog(null)} />}
      {dialog === "help" && <HelpPanel onClose={() => setDialog(null)} />}
    </div>
  );
}
