import { useState } from "react";
import type { Difficulty, VictoryCondition } from "../engine";
import type { NewGameSettings } from "../game/session";

const randomSeed = () => Math.floor(Math.random() * 1_000_000);

const DIFFICULTIES: Array<{ id: Difficulty; label: string; hint: string }> = [
  { id: "easy", label: "Easy", hint: "Rivals earn 15% less and only attack with clear odds." },
  { id: "normal", label: "Normal", hint: "Rivals play by your rules, with your income." },
  { id: "hard", label: "Hard", hint: "Rivals earn 25% more and take bolder risks. They never see through fog." },
];

export function NewGameMenu({ onStart }: { onStart(settings: NewGameSettings): void }) {
  const [seed, setSeed] = useState(randomSeed);
  const [provinces, setProvinces] = useState(40);
  const [factions, setFactions] = useState(4);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [victoryKind, setVictoryKind] = useState<VictoryCondition["kind"]>("domination");
  const [percent, setPercent] = useState(70);
  const [turnLimit, setTurnLimit] = useState(30);

  const victory = (): VictoryCondition =>
    victoryKind === "domination" ? { kind: "domination", percent } : victoryKind === "capitals" ? { kind: "capitals" } : { kind: "score", turnLimit };

  return (
    <div className="menu">
      <form
        className="menu-card panel"
        onSubmit={(e) => {
          e.preventDefault();
          onStart({ seed, provinces, factions, difficulty, victory: victory() });
        }}
      >
        <h1>Petty Empires</h1>
        <p className="muted">Turn-based conquest. Physics battles. Every era at once.</p>

        <label>
          <span>Map</span>
          <select disabled value="random">
            <option value="random">Random island</option>
          </select>
        </label>

        <label>
          <span>Seed</span>
          <div className="row">
            <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} />
            <button type="button" className="ghost" onClick={() => setSeed(randomSeed())} title="New random seed">
              Reroll
            </button>
          </div>
        </label>

        <label>
          <span>Provinces: {provinces}</span>
          <input type="range" min={30} max={60} step={5} value={provinces} onChange={(e) => setProvinces(Number(e.target.value))} />
        </label>

        <label>
          <span>Factions: {factions}</span>
          <input type="range" min={2} max={6} value={factions} onChange={(e) => setFactions(Number(e.target.value))} />
        </label>

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

        <button type="submit" className="primary">
          Start campaign
        </button>
      </form>
    </div>
  );
}
