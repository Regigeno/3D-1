import { useState } from "react";
import { rules } from "../engine";
import { STATUS_LABEL, diplomacyRows, trustLabel } from "../game/diplomacy";
import type { GameSession } from "../game/session";

export function DiplomacyScreen({ session, onClose }: { session: GameSession; onClose(): void }) {
  const { state } = session;
  const me = session.viewer;
  const canAct = session.isHumanTurn && state.activeFaction === me && !session.battlePrompt;
  const rows = diplomacyRows(state, me);
  const incoming = rows.filter((r) => r.incoming);
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel diplomacy" onClick={(e) => e.stopPropagation()}>
        <header className="research-head">
          <h2>Diplomacy</h2>
          <div className="spacer" />
          <button className="ghost icon-button" onClick={onClose} title="Close (Esc)">
            ×
          </button>
        </header>

        {incoming.length > 0 && (
          <section className="proposals">
            {incoming.map((r) => (
              <div key={r.faction} className="proposal">
                <span className="swatch" style={{ background: r.color }} />
                <span>
                  <strong>{r.name}</strong> proposes {r.incoming!.kind === "peace" ? "peace" : "an alliance"}.
                </span>
                <div className="spacer" />
                <button className="primary small" disabled={!canAct} onClick={() => session.dispatch({ kind: "respond-proposal", from: r.faction, accept: true })}>
                  Accept
                </button>
                <button className="small" disabled={!canAct} onClick={() => session.dispatch({ kind: "respond-proposal", from: r.faction, accept: false })}>
                  Decline
                </button>
              </div>
            ))}
            <p className="muted small">Unanswered proposals expire when the proposer's next turn begins.</p>
          </section>
        )}

        <table className="relations">
          <thead>
            <tr>
              <th>Faction</th>
              <th>Relation</th>
              <th>Trust</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.faction}>
                <td>
                  <div className="owner">
                    <span className="swatch" style={{ background: r.color }} />
                    <strong>{r.name}</strong>
                  </div>
                  <div className="muted small">
                    {r.provinces} province{r.provinces === 1 ? "" : "s"}
                    {r.borders ? " · borders you" : ""}
                  </div>
                </td>
                <td>
                  <span className={`status ${r.status}`}>{STATUS_LABEL[r.status]}</span>
                  <div className="muted small">since turn {r.sinceTurn}</div>
                </td>
                <td>
                  <div className="trust" title={`Trust ${r.trust}/100`}>
                    <div style={{ width: `${r.trust}%` }} />
                  </div>
                  <div className="muted small">{trustLabel(r.trust)}</div>
                </td>
                <td className="actions">
                  {r.outgoing ? (
                    <span className="muted small">Waiting for an answer to your {r.outgoing.kind} proposal</span>
                  ) : (
                    r.actions.map((a) => {
                      const key = `${r.faction}:${a.label}`;
                      const reason = canAct ? session.check(a.command) : "Wait for your turn";
                      if (confirming === key) {
                        return (
                          <span key={key} className="confirm small">
                            {a.confirm}
                            <button className="danger small" onClick={() => (setConfirming(null), session.dispatch(a.command))}>
                              Confirm
                            </button>
                            <button className="ghost small" onClick={() => setConfirming(null)}>
                              Cancel
                            </button>
                          </span>
                        );
                      }
                      return (
                        <button
                          key={key}
                          className={`small ${a.danger ? "danger" : ""}`}
                          disabled={reason !== null}
                          title={reason ?? undefined}
                          onClick={() => (a.confirm ? setConfirming(key) : session.dispatch(a.command))}
                        >
                          {a.label}
                        </button>
                      );
                    })
                  )}
                  {r.peaceLockedFor > 0 && !r.outgoing && <div className="muted small">Peace must hold {r.peaceLockedFor} more turns</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="muted small">
          Peace lasts at least {rules.MIN_PEACE_TURNS} turns. Allies share vision and can march through each other's land. Rivals accept peace when they trust
          you and are not much stronger, or when they are fighting on several fronts; alliances need high trust and a shared enemy. Breaking an alliance costs
          trust with everyone.
        </p>
      </div>
    </div>
  );
}
