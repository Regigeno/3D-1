import { rules } from "../engine";

const MAP_KEYS: Array<[string, string]> = [
  ["Select a province or army", "Left click"],
  ["Move or attack with the selected army", "Click a highlighted province"],
  ["Pan / rotate / zoom", "Left drag / right drag / scroll"],
  ["Research", "R"],
  ["Diplomacy", "D"],
  ["End turn", "Enter"],
  ["Deselect, close, game menu", "Esc"],
  ["This help", "H or ?"],
];

const BATTLE_KEYS: Array<[string, string]> = [
  ["Watch / Skip (at the prompt)", "W / S"],
  ["Pause", "Space"],
  ["Speed 0.25× to 4×", "1–5"],
  ["Follow a soldier / free camera", "Click it or F / Esc"],
  ["Skip to result", "S"],
];

export function HelpPanel({ onClose, welcome = false }: { onClose(): void; welcome?: boolean }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel dialog help" onClick={(e) => e.stopPropagation()}>
        <header className="research-head">
          <h2>{welcome ? "Welcome to Petty Empires" : "How to play"}</h2>
          <div className="spacer" />
          <button className="ghost icon-button" onClick={onClose} title="Close (Esc)">
            ×
          </button>
        </header>
        <div className="help-columns">
          <div>
            <h3>Your turn</h3>
            <ol>
              <li>
                <strong>Expand.</strong> Select your army and click a neighboring province. Neutral land is captured by walking in.
              </li>
              <li>
                <strong>Grow.</strong> Click a province you own to build and recruit. One squad costs {rules.POP_PER_SQUAD} people living there. Markets and barracks help population grow. Unpaid troops stay; you just run out of gold.
              </li>
              <li>
                <strong>Research.</strong> Each military type climbs the eras on its own, so mix and match: Futuristic snipers can escort Prehistoric wolf sleds.
              </li>
              <li>
                <strong>Attack.</strong> Red highlights start a battle. You never control a battle: watch the physics play out, or skip it for the same result.
              </li>
              <li>
                <strong>Make friends, briefly.</strong> Use Diplomacy to make peace or alliances. Allies share vision; peace lasts at least 10 turns.
              </li>
            </ol>
            <p className="muted small">Counters matter: infantry beats cavalry, cavalry rides down ranged and artillery, ranged and artillery shred infantry, and specials are big enough to trample both infantry and cavalry.</p>
            <p className="muted small">The game saves itself every turn. Open the menu (Esc) to save a copy or export it as a file.</p>
          </div>
          <div>
            <h3>Map</h3>
            <table className="keys">
              <tbody>
                {MAP_KEYS.map(([what, key]) => (
                  <tr key={what}>
                    <td>{what}</td>
                    <td>
                      <kbd>{key}</kbd>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>Battles</h3>
            <table className="keys">
              <tbody>
                {BATTLE_KEYS.map(([what, key]) => (
                  <tr key={what}>
                    <td>{what}</td>
                    <td>
                      <kbd>{key}</kbd>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <button className="primary" onClick={onClose} autoFocus>
          {welcome ? "Start playing" : "Back to the game"}
        </button>
      </div>
    </div>
  );
}
