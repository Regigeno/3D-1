import { useEffect, useRef, useState } from "react";
import { BATTLE_SPEEDS, BattleSim, BattleView, MAX_BATTLE_SECONDS, type EndReason, type Rapier, type Soldier } from "../battle";
import { scenarioProvince, unitFor, type BattleResult, type PendingBattle } from "../engine";
import { factionName, provinceName } from "../game/describe";
import type { GameSession } from "../game/session";

interface Hud {
  time: number;
  alive: [number, number];
  total: [number, number];
}

const REASON: Record<EndReason, { attacker: string; defender: string }> = {
  "wiped-out": { attacker: "wiped out the defenders", defender: "wiped out the attackers" },
  rout: { attacker: "routed the defenders", defender: "routed the attackers" },
  timeout: { attacker: "", defender: "held until time ran out" },
};

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function BattleScreen({ session, battle, rapier }: { session: GameSession; battle: PendingBattle; rapier: Rapier }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<BattleView | null>(null);
  const [hud, setHud] = useState<Hud>({ time: 0, alive: [0, 0], total: [0, 0] });
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [followed, setFollowed] = useState<Soldier | null>(null);
  const [outcome, setOutcome] = useState<{ result: BattleResult; reason: EndReason } | null>(null);

  const state = session.state;
  const color = (faction: string | null) => (faction ? (state.factions[faction]?.color ?? "#888") : "#8a8a8a");

  useEffect(() => {
    const terrain = scenarioProvince(session.state, battle.province).terrain;
    const sim = new BattleSim(rapier, battle, terrain);
    const view = new BattleView(
      containerRef.current!,
      sim,
      { attacker: color(battle.attacker.faction), defender: color(battle.defender.faction) },
      {
        onFinished: (result) => setOutcome({ result, reason: sim.reason ?? "timeout" }),
        onFollow: setFollowed,
      },
    );
    viewRef.current = view;
    const read = () =>
      setHud({
        time: sim.time,
        alive: [sim.aliveCount(0), sim.aliveCount(1)],
        total: [sim.totalCount(0), sim.totalCount(1)],
      });
    read();
    const interval = window.setInterval(read, 150);
    if (import.meta.env.DEV) Object.assign(window, { __battleView: view });
    return () => {
      window.clearInterval(interval);
      view.dispose();
      sim.dispose();
      viewRef.current = null;
    };
  }, [battle, rapier]);

  const changeSpeed = (s: number) => {
    setSpeed(s);
    if (viewRef.current) viewRef.current.speed = s;
  };
  const togglePause = () => {
    const view = viewRef.current;
    if (!view) return;
    view.paused = !view.paused;
    setPaused(view.paused);
  };
  const finish = () => {
    if (outcome) session.finishBattle(outcome.result);
  };

  const outcomeRef = useRef(outcome);
  outcomeRef.current = outcome;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const view = viewRef.current;
      if (!view) return;
      const done = outcomeRef.current;
      if (done) {
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          session.finishBattle(done.result);
        }
        return;
      }
      const index = Number(e.key) - 1;
      if (Number.isInteger(index) && BATTLE_SPEEDS[index] !== undefined) changeSpeed(BATTLE_SPEEDS[index]);
      else if (e.key === " ") {
        e.preventDefault();
        togglePause();
      } else if (e.key === "f" || e.key === "F") view.followSomeone();
      else if (e.key === "Escape") view.follow(null);
      else if (e.key === "s" || e.key === "S") view.skipToEnd();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session]);

  const sides = [
    { faction: battle.attacker.faction, title: "Attacker" },
    { faction: battle.defender.faction, title: "Defender" },
  ] as const;
  const winnerFaction = outcome ? (outcome.result.winner === "attacker" ? battle.attacker.faction : battle.defender.faction) : null;
  const iWon = winnerFaction === session.viewer;

  return (
    <div className="battle-screen">
      <div className="battle-canvas" ref={containerRef} />
      <div className="battle-hud panel">
        <div className="battle-title">
          <strong>Battle of {provinceName(state, battle.province)}</strong>
          <span className="muted small">
            {clock(hud.time)} / {clock(MAX_BATTLE_SECONDS)}
          </span>
        </div>
        <div className="strength">
          {sides.map((s, i) => {
            const alive = hud.alive[i as 0 | 1];
            const total = hud.total[i as 0 | 1] || 1;
            return (
              <div key={s.title} className={`strength-side ${i === 1 ? "right" : ""}`}>
                <div className="owner">
                  <span className="swatch" style={{ background: color(s.faction) }} />
                  <strong>{factionName(state, s.faction)}</strong>
                  <span className="muted small">{s.title}</span>
                  <span className="count">{alive}</span>
                </div>
                <div className="bar">
                  <div style={{ width: `${(alive / total) * 100}%`, background: color(s.faction) }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {!outcome && (
        <div className="battle-controls panel">
          <button className="ghost" onClick={togglePause} title="Pause (Space)">
            {paused ? "Resume" : "Pause"}
          </button>
          <div className="segmented">
            {BATTLE_SPEEDS.map((s, i) => (
              <button key={s} className={s === speed ? "active" : ""} onClick={() => changeSpeed(s)} title={`Speed ${s}× (${i + 1})`}>
                {s}×
              </button>
            ))}
          </div>
          <button className="ghost" onClick={() => viewRef.current?.followSomeone()} title="Follow a random soldier (F)">
            Follow
          </button>
          <div className="spacer" />
          <button onClick={() => viewRef.current?.skipToEnd()} title="Skip to result (S)">
            Skip to result
          </button>
        </div>
      )}

      {!outcome &&
        (followed ? (
          <div className="battle-help following small">
            Following {unitFor(followed.unit.type, followed.unit.era).name}
            {followed.alive ? "" : " (fallen)"}
            <button className="ghost small" onClick={() => viewRef.current?.follow(null)} title="Free camera (Esc)">
              Free camera
            </button>
          </div>
        ) : (
          <div className="battle-help muted small">Drag to rotate, right-drag to pan, scroll to zoom. Click a soldier to follow it.</div>
        ))}

      {outcome && (
        <div className="battle-end panel">
          <h2 className={iWon ? "outcome win" : "outcome loss"}>{iWon ? "Victory" : "Defeat"}</h2>
          <p>
            {factionName(state, winnerFaction)} {REASON[outcome.reason][outcome.result.winner] || "won the field"}.
          </p>
          <button className="primary" onClick={finish} autoFocus>
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
