import { useState } from "react";
import type { NewGameSettings } from "../game/session";

const randomSeed = () => Math.floor(Math.random() * 1_000_000);

export function NewGameMenu({ onStart }: { onStart(settings: NewGameSettings): void }) {
  const [seed, setSeed] = useState(randomSeed);
  const [provinces, setProvinces] = useState(40);
  const [factions, setFactions] = useState(4);

  return (
    <div className="menu">
      <form
        className="menu-card panel"
        onSubmit={(e) => {
          e.preventDefault();
          onStart({ seed, provinces, factions });
        }}
      >
        <h1>3D-1</h1>
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

        <button type="submit" className="primary">
          Start campaign
        </button>
      </form>
    </div>
  );
}
