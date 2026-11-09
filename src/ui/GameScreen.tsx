import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { GameSession } from "../game/session";
import { MapView } from "../render/MapView";
import { EventLog } from "./EventLog";
import { ProvincePanel } from "./ProvincePanel";
import { TopBar } from "./TopBar";
import { provinceName } from "../game/describe";

interface Hover {
  province: string;
  x: number;
  y: number;
}

export function GameScreen({ session, onQuit }: { session: GameSession; onQuit(): void }) {
  const version = useSyncExternalStore(session.subscribe, session.getVersion);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MapView | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  const targets = useMemo(
    () => (session.selection.army ? session.moveTargets(session.selection.army) : new Map()),
    [session, version],
  );

  useEffect(() => {
    const view = new MapView(containerRef.current!, {
      onProvinceClick: (id) => session.clickProvince(id),
      onArmyClick: (id) => session.selectArmy(id),
      onEmptyClick: () => session.clearSelection(),
      onHover: (province, x, y) => setHover(province ? { province, x, y } : null),
    });
    viewRef.current = view;
    if (import.meta.env.DEV) Object.assign(window, { __session: session, __mapView: view });
    return () => {
      view.dispose();
      viewRef.current = null;
    };
  }, [session]);

  useEffect(() => {
    viewRef.current?.update({ state: session.state, viewer: session.viewer, selection: session.selection, targets });
  }, [session, version, targets]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "Escape") session.clearSelection();
      if (e.key === "Enter" && session.isHumanTurn) session.dispatch({ kind: "end-turn" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session]);

  const winner = session.state.winner ? session.state.factions[session.state.winner] : null;

  return (
    <div className="game">
      <div className="map" ref={containerRef} />
      <TopBar session={session} onQuit={onQuit} />
      <ProvincePanel session={session} targets={targets} onFocus={(p) => viewRef.current?.focusProvince(p)} />
      <EventLog session={session} />
      {session.lastError && <div className="toast error">{session.lastError}</div>}
      {!session.selection.province && !winner && (
        <div className="hint panel">
          Click a province or army. Drag to pan, right-drag to rotate, scroll to zoom. <kbd>Enter</kbd> ends your turn.
        </div>
      )}
      {hover && (
        <div className="tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          {provinceName(session.state, hover.province)}
          {targets.has(hover.province) && <span className={`tag ${targets.get(hover.province)}`}>{targets.get(hover.province)}</span>}
        </div>
      )}
      {winner && (
        <div className="overlay">
          <div className="panel victory">
            <h2 style={{ color: winner.color }}>{winner.name} wins!</h2>
            <p className="muted">Turn {session.state.turn}</p>
            <button className="primary" onClick={onQuit}>
              New campaign
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
