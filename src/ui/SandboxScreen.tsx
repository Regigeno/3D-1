import { useEffect, useRef, useState } from "react";
import { BATTLE_SPEEDS, BattleSim, BattleView, MAX_BATTLE_SECONDS, type EndReason, type Rapier, type Soldier } from "../battle";
import {
  ALL_ERAS,
  MILITARY_TYPES,
  SQUAD_SIZE,
  unitFor,
  type BattleResult,
  type Era,
  type MilitaryType,
  type PendingBattle,
  type Squad,
  type Terrain,
} from "../engine";
import { ERA_LABEL, TYPE_LABEL } from "../game/describe";
import { settings } from "./services";

const TERRAINS: Terrain[] = ["plains", "forest", "hills", "mountains", "desert", "coast", "wasteland"];
const MAX_SQUADS = 12;
const ATTACKER = "#d94040";
const DEFENDER = "#3f6fd9";

const REASON: Record<EndReason, { attacker: string; defender: string }> = {
  "wiped-out": { attacker: "wiped out the defenders", defender: "wiped out the attackers" },
  rout: { attacker: "routed the defenders", defender: "routed the attackers" },
  timeout: { attacker: "", defender: "held until time ran out" },
};

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function starter(side: "attacker" | "defender"): Squad[] {
  if (side === "attacker") {
    return [
      { type: "infantry", era: "prehistoric", soldiers: SQUAD_SIZE.infantry },
      { type: "infantry", era: "prehistoric", soldiers: SQUAD_SIZE.infantry },
      { type: "ranged", era: "prehistoric", soldiers: SQUAD_SIZE.ranged },
    ];
  }
  return [
    { type: "infantry", era: "prehistoric", soldiers: SQUAD_SIZE.infantry },
    { type: "cavalry", era: "prehistoric", soldiers: SQUAD_SIZE.cavalry },
    { type: "ranged", era: "medieval", soldiers: SQUAD_SIZE.ranged },
  ];
}

function battleOf(attacker: Squad[], defender: Squad[], fortified: boolean): PendingBattle {
  return {
    id: "sandbox",
    seed: Math.floor(Math.random() * 1_000_000_000),
    province: "field",
    attackerFrom: "field",
    attackerArmyId: "attacker",
    attacker: { faction: "attacker", squads: attacker },
    defender: { faction: "defender", squads: defender },
    defenderSources: defender.map((_, squadIndex) => ({ kind: "army" as const, armyId: "defender", squadIndex })),
    fortified,
  };
}

function Roster({
  title,
  color,
  squads,
  onChange,
}: {
  title: string;
  color: string;
  squads: Squad[];
  onChange(next: Squad[]): void;
}) {
  const [type, setType] = useState<MilitaryType>("infantry");
  const [era, setEra] = useState<Era>("prehistoric");
  const add = () => {
    if (squads.length >= MAX_SQUADS) return;
    onChange([...squads, { type, era, soldiers: SQUAD_SIZE[type] }]);
  };
  return (
    <section className="sandbox-roster panel">
      <header>
        <span className="swatch" style={{ background: color }} />
        <h2>{title}</h2>
        <span className="muted small">
          {squads.length}/{MAX_SQUADS}
        </span>
      </header>
      <ul>
        {squads.map((squad, index) => (
          <li key={`${squad.type}-${squad.era}-${index}`}>
            <span>
              {unitFor(squad.type, squad.era).name}
              <span className="muted small">
                {" "}
                · {SQUAD_SIZE[squad.type]}
              </span>
            </span>
            <button type="button" className="ghost small" onClick={() => onChange(squads.filter((_, i) => i !== index))}>
              Remove
            </button>
          </li>
        ))}
        {squads.length === 0 && <li className="muted small">No squads yet.</li>}
      </ul>
      <div className="row">
        <select value={type} onChange={(e) => setType(e.target.value as MilitaryType)} aria-label={`${title} type`}>
          {MILITARY_TYPES.map((id) => (
            <option key={id} value={id}>
              {TYPE_LABEL[id]}
            </option>
          ))}
        </select>
        <select value={era} onChange={(e) => setEra(e.target.value as Era)} aria-label={`${title} era`}>
          {ALL_ERAS.map((id) => (
            <option key={id} value={id}>
              {ERA_LABEL[id]}
            </option>
          ))}
        </select>
        <button type="button" onClick={add} disabled={squads.length >= MAX_SQUADS}>
          Add
        </button>
      </div>
    </section>
  );
}

export function SandboxScreen({ rapier, onExit }: { rapier: Rapier; onExit(): void }) {
  const [attacker, setAttacker] = useState<Squad[]>(() => starter("attacker"));
  const [defender, setDefender] = useState<Squad[]>(() => starter("defender"));
  const [terrain, setTerrain] = useState<Terrain>("plains");
  const [fortified, setFortified] = useState(false);
  const [fight, setFight] = useState<PendingBattle | null>(null);

  if (fight) {
    return <SandboxBattle rapier={rapier} battle={fight} terrain={terrain} onDone={() => setFight(null)} />;
  }

  return (
    <div className="menu">
      <div className="sandbox-layout">
        <header className="sandbox-head">
          <div>
            <h1>Sandbox battle</h1>
            <p className="muted">Skip the campaign. Field any mix of eras and watch the physics.</p>
          </div>
          <button type="button" className="ghost" onClick={onExit}>
            Back to menu
          </button>
        </header>
        <div className="sandbox-grid">
          <Roster title="Attacker" color={ATTACKER} squads={attacker} onChange={setAttacker} />
          <form
            className="sandbox-field panel"
            onSubmit={(e) => {
              e.preventDefault();
              setFight(battleOf(attacker, defender, fortified));
            }}
          >
            <label>
              <span>Terrain</span>
              <select value={terrain} onChange={(e) => setTerrain(e.target.value as Terrain)}>
                {TERRAINS.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={fortified} onChange={(e) => setFortified(e.target.checked)} />
              <span>Defender holds a fort</span>
            </label>
            <button type="submit" className="primary" disabled={attacker.length === 0 || defender.length === 0}>
              Fight
            </button>
          </form>
          <Roster title="Defender" color={DEFENDER} squads={defender} onChange={setDefender} />
        </div>
      </div>
    </div>
  );
}

function SandboxBattle({ rapier, battle, terrain, onDone }: { rapier: Rapier; battle: PendingBattle; terrain: Terrain; onDone(): void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<BattleView | null>(null);
  const [hud, setHud] = useState({ time: 0, alive: [0, 0] as [number, number], total: [1, 1] as [number, number] });
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [followed, setFollowed] = useState<Soldier | null>(null);
  const [outcome, setOutcome] = useState<{ result: BattleResult; reason: EndReason } | null>(null);

  useEffect(() => {
    const sim = new BattleSim(rapier, battle, terrain);
    const view = new BattleView(containerRef.current!, sim, { attacker: ATTACKER, defender: DEFENDER }, { onFinished: (result) => setOutcome({ result, reason: sim.reason ?? "timeout" }), onFollow: setFollowed });
    view.setQuality(settings.get().graphics);
    viewRef.current = view;
    const read = () => setHud({ time: sim.time, alive: [sim.aliveCount(0), sim.aliveCount(1)], total: [sim.totalCount(0), sim.totalCount(1)] });
    read();
    const interval = window.setInterval(read, 150);
    return () => {
      window.clearInterval(interval);
      view.dispose();
      sim.dispose();
      viewRef.current = null;
    };
  }, [battle, rapier, terrain]);

  const changeSpeed = (s: number) => {
    setSpeed(s);
    if (viewRef.current) viewRef.current.speed = s;
  };
  const outcomeRef = useRef(outcome);
  outcomeRef.current = outcome;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const view = viewRef.current;
      if (!view) return;
      if (outcomeRef.current) {
        if (e.key === "Enter" || e.key === "Escape") onDone();
        return;
      }
      const index = Number(e.key) - 1;
      if (Number.isInteger(index) && BATTLE_SPEEDS[index] !== undefined) changeSpeed(BATTLE_SPEEDS[index]);
      else if (e.key === " ") {
        e.preventDefault();
        view.paused = !view.paused;
        setPaused(view.paused);
      } else if (e.key === "f" || e.key === "F") view.followSomeone();
      else if (e.key === "Escape") view.follow(null);
      else if (e.key === "s" || e.key === "S") view.skipToEnd();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  const sides = [
    { title: "Attacker", color: ATTACKER },
    { title: "Defender", color: DEFENDER },
  ] as const;
  const winner = outcome ? (outcome.result.winner === "attacker" ? "Attacker" : "Defender") : null;

  return (
    <div className="battle-screen">
      <div className="battle-canvas" ref={containerRef} />
      <div className="battle-hud panel">
        <div className="battle-title">
          <strong>Sandbox battle</strong>
          <span className="muted small">
            {clock(hud.time)} / {clock(MAX_BATTLE_SECONDS)}
          </span>
        </div>
        <div className="strength">
          {sides.map((s, i) => {
            const alive = hud.alive[i] ?? 0;
            const total = hud.total[i] || 1;
            return (
              <div key={s.title} className={`strength-side ${i === 1 ? "right" : ""}`}>
                <div className="owner">
                  <span className="swatch" style={{ background: s.color }} />
                  <strong>{s.title}</strong>
                  <span className="count">{alive}</span>
                </div>
                <div className="bar">
                  <div style={{ width: `${(alive / total) * 100}%`, background: s.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {!outcome && (
        <div className="battle-controls panel">
          <button className="ghost" onClick={() => viewRef.current && ((viewRef.current.paused = !viewRef.current.paused), setPaused(viewRef.current.paused))}>
            {paused ? "Resume" : "Pause"}
          </button>
          <div className="segmented">
            {BATTLE_SPEEDS.map((s) => (
              <button key={s} className={s === speed ? "active" : ""} onClick={() => changeSpeed(s)}>
                {s}×
              </button>
            ))}
          </div>
          <button className="ghost" onClick={() => viewRef.current?.followSomeone()}>
            Follow
          </button>
          <div className="spacer" />
          <button onClick={() => viewRef.current?.skipToEnd()}>Skip to result</button>
        </div>
      )}
      {!outcome &&
        (followed ? (
          <div className="battle-help following small">
            Following {unitFor(followed.unit.type, followed.unit.era).name}
            <button className="ghost small" onClick={() => viewRef.current?.follow(null)}>
              Free camera
            </button>
          </div>
        ) : (
          <div className="battle-help muted small">Drag to rotate, right-drag to pan, scroll to zoom. Click a soldier to follow it.</div>
        ))}
      {outcome && (
        <div className="battle-end panel">
          <h2 className="outcome win">{winner} wins</h2>
          <p>
            The {outcome.result.winner} {REASON[outcome.reason][outcome.result.winner] || "won the field"}.
          </p>
          <button className="primary" onClick={onDone} autoFocus>
            Edit armies
          </button>
        </div>
      )}
    </div>
  );
}
