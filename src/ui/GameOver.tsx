import { useEffect } from "react";
import { sound } from "../audio/sound";
import type { GameSession } from "../game/session";
import { VICTORY_LABEL, standings } from "../game/victory";

export function GameOver({ session, onQuit }: { session: GameSession; onQuit(): void }) {
  const { state } = session;
  const winner = state.winner ? state.factions[state.winner] : null;
  const won = winner?.id === session.viewer;
  const title = won ? "Victory!" : winner ? `${winner.name} wins` : "Defeated";
  const subtitle = won
    ? `Your empire prevailed on turn ${state.turn}.`
    : winner
      ? `${winner.name} won by ${VICTORY_LABEL[state.options.victory.kind].toLowerCase()} on turn ${state.turn}.`
      : `${state.factions[session.viewer]?.name ?? "Your empire"} was wiped off the map on turn ${state.turn}.`;
  useEffect(() => sound.play(won ? "victory" : "defeat"), [won]);

  return (
    <div className="overlay">
      <div className="panel victory">
        <h2 style={{ color: winner?.color }}>{title}</h2>
        <p className="muted">{subtitle}</p>
        <table className="standings">
          <thead>
            <tr>
              <th>Faction</th>
              <th className="num">Provinces</th>
              <th className="num">Score</th>
            </tr>
          </thead>
          <tbody>
            {standings(state).map((s) => (
              <tr key={s.faction} className={s.alive ? undefined : "eliminated"}>
                <td>
                  <span className="swatch small" style={{ background: s.color }} />
                  {s.name}
                  {s.faction === session.viewer && <span className="muted small"> (you)</span>}
                </td>
                <td className="num">{s.alive ? s.provinces : "—"}</td>
                <td className="num">{s.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="primary" onClick={onQuit} autoFocus>
          New campaign
        </button>
      </div>
    </div>
  );
}
