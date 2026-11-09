import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { GameSession } from "../game/session";
import { MapView } from "../render/MapView";
import { EventLog } from "./EventLog";
import { ProvincePanel } from "./ProvincePanel";
import { TopBar } from "./TopBar";
import { TreasuryPanel } from "./TreasuryPanel";
import { BattleReport } from "./BattleReport";
import { ResearchScreen } from "./ResearchScreen";
import { GameOver } from "./GameOver";
import { provinceName } from "../game/describe";
import type { Rapier } from "../battle";
import { BattlePrompt } from "./BattlePrompt";
import { BattleScreen } from "./BattleScreen";

interface Hover {
  province: string;
  x: number;
  y: number;
}

export function GameScreen({ session, rapier, onQuit }: { session: GameSession; rapier: Rapier; onQuit(): void }) {
  const version = useSyncExternalStore(session.subscribe, session.getVersion);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MapView | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [showTreasury, setShowTreasury] = useState(false);
  const [showResearch, setShowResearch] = useState(false);
  const [watching, setWatching] = useState<string | null>(null);
  const showResearchRef = useRef(showResearch);
  showResearchRef.current = showResearch;
  const prompt = session.battlePrompt;
  const watched = prompt && prompt.id === watching ? prompt : null;
  const watchedRef = useRef(watched);
  watchedRef.current = watched;

  useEffect(() => {
    if (viewRef.current) viewRef.current.paused = !!watched;
    if (watched) setHover(null);
  }, [watched]);

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
    viewRef.current?.update({
      state: session.state,
      viewer: session.viewer,
      selection: session.selection,
      targets,
      revealAll: !!session.state.winner || session.defeated,
    });
  }, [session, version, targets]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (watchedRef.current) return;
      const battle = session.battlePrompt;
      if (battle) {
        if (e.key === "w" || e.key === "W") setWatching(battle.id);
        if (e.key === "s" || e.key === "S" || e.key === "Enter") {
          e.preventDefault();
          session.skipBattle();
        }
        return;
      }
      if (session.battleReport) {
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          session.dismissBattleReport();
        }
        return;
      }
      if (showResearchRef.current) {
        if (e.key === "Escape" || e.key === "r" || e.key === "R") setShowResearch(false);
        return;
      }
      if (e.key === "r" || e.key === "R") setShowResearch(true);
      if (e.key === "Escape") session.clearSelection();
      if (e.key === "Enter" && session.isHumanTurn) {
        // Otherwise Enter would also "click" whichever button was focused last.
        e.preventDefault();
        session.dispatch({ kind: "end-turn" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session]);

  const gameOver = !!session.state.winner || session.defeated;

  return (
    <div className="game">
      <div className="map" ref={containerRef} />
      <TopBar session={session} onQuit={onQuit} onToggleTreasury={() => setShowTreasury((v) => !v)} onOpenResearch={() => setShowResearch(true)} />
      {showTreasury && <TreasuryPanel session={session} onClose={() => setShowTreasury(false)} />}
      <ProvincePanel session={session} targets={targets} onFocus={(p) => viewRef.current?.focusProvince(p)} />
      <EventLog session={session} />
      {session.lastError && <div className="toast error">{session.lastError}</div>}
      {!session.selection.province && !gameOver && !prompt && (
        <div className="hint panel">
          Click a province or army. Drag to pan, right-drag to rotate, scroll to zoom. <kbd>R</kbd> opens research, <kbd>Enter</kbd> ends your turn.
        </div>
      )}
      {hover && (
        <div className="tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          {provinceName(session.state, hover.province)}
          {targets.has(hover.province) && <span className={`tag ${targets.get(hover.province)}`}>{targets.get(hover.province)}</span>}
        </div>
      )}
      {showResearch && <ResearchScreen session={session} onClose={() => setShowResearch(false)} />}
      {watched ? (
        <BattleScreen session={session} battle={watched} rapier={rapier} />
      ) : prompt ? (
        <BattlePrompt session={session} battle={prompt} onWatch={() => setWatching(prompt.id)} />
      ) : session.battleReport ? (
        <BattleReport session={session} report={session.battleReport} />
      ) : (
        gameOver && <GameOver session={session} onQuit={onQuit} />
      )}
    </div>
  );
}
