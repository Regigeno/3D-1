import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { sound } from "../audio/sound";
import type { Rapier } from "../battle";
import { factionName, provinceName } from "../game/describe";
import { incomingProposals } from "../game/diplomacy";
import type { GameSession } from "../game/session";
import { AUTOSAVE_ID } from "../game/storage";
import { MapView } from "../render/MapView";
import { BattlePrompt } from "./BattlePrompt";
import { BattleReport } from "./BattleReport";
import { BattleScreen } from "./BattleScreen";
import { DiplomacyScreen } from "./DiplomacyScreen";
import { EventLog } from "./EventLog";
import { GameMenu } from "./GameMenu";
import { GameOver } from "./GameOver";
import { HelpPanel } from "./HelpPanel";
import { ProvincePanel } from "./ProvincePanel";
import { ResearchScreen } from "./ResearchScreen";
import { saves, settings, useSettings } from "./services";
import { SettingsPanel } from "./SettingsPanel";
import { TopBar } from "./TopBar";
import { TreasuryPanel } from "./TreasuryPanel";

interface Hover {
  province: string;
  x: number;
  y: number;
}

type Panel = "research" | "diplomacy" | "menu" | "settings" | "help" | "welcome";

export function GameScreen({ session, rapier, onQuit }: { session: GameSession; rapier: Rapier; onQuit(): void }) {
  const version = useSyncExternalStore(session.subscribe, session.getVersion);
  const prefs = useSettings();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<MapView | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [showTreasury, setShowTreasury] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(() => (settings.get().seenIntro ? null : "welcome"));
  const humanIds = session.state.factionOrder.filter((id) => session.state.factions[id]?.controller === "human");
  const passKey = `${session.state.turn}:${session.state.activeFaction}`;
  const [acked, setAcked] = useState<string | null>(() => (humanIds.length > 1 ? null : passKey));
  const conceal = humanIds.length > 1 && acked !== passKey;
  const concealRef = useRef(conceal);
  concealRef.current = conceal;
  const [watching, setWatching] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);
  const panelRef = useRef(panel);
  panelRef.current = panel;
  const prompt = session.battlePrompt;
  const watched = prompt && prompt.id === watching ? prompt : null;
  const watchedRef = useRef(watched);
  watchedRef.current = watched;
  const gameOver = session.gameOver;

  const closePanel = () => {
    if (panelRef.current === "welcome") settings.set({ seenIntro: true });
    setPanel(null);
  };
  const closePanelRef = useRef(closePanel);
  closePanelRef.current = closePanel;

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
    view.setQuality(settings.get().graphics);
    viewRef.current = view;
    if (import.meta.env.DEV) Object.assign(window, { __session: session, __mapView: view });
    return () => {
      view.dispose();
      viewRef.current = null;
    };
  }, [session]);

  useEffect(() => viewRef.current?.setQuality(prefs.graphics), [prefs.graphics]);

  useEffect(() => {
    viewRef.current?.update({
      state: session.state,
      viewer: session.viewer,
      selection: session.selection,
      targets,
      revealAll: gameOver,
    });
  }, [session, version, targets, gameOver]);
  // Autosave at the start of each of your turns, including the first. Drop the slot
  // only if this sitting wrote it and then ended; opening an old finished save must
  // not erase a different game's autosave.
  const savedState = useRef<typeof session.state | null>(null);
  const wroteAutosave = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => {
    if (!session.settled || savedState.current === session.state) return;
    savedState.current = session.state;
    try {
      if (session.gameOver) {
        if (wroteAutosave.current) saves.delete(AUTOSAVE_ID);
      } else {
        saves.write(session.toSave(), AUTOSAVE_ID);
        wroteAutosave.current = true;
      }
      setSaveError(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }, [session, version]);

  // "Your turn" once the computer players are done, and a chime when someone proposes a treaty.
  const wasMyTurn = useRef(session.isHumanTurn);
  const proposalCount = useRef(incomingProposals(session.state, session.viewer).length);
  useEffect(() => {
    const mine = session.isHumanTurn && !session.aiBusy;
    const proposals = incomingProposals(session.state, session.viewer);
    if (mine && !wasMyTurn.current && !gameOver) {
      sound.play("turn");
      const label = humanIds.length > 1 ? `${factionName(session.state, session.state.activeFaction)}'s turn` : `Turn ${session.state.turn}: your move`;
      setNotice({ id: Date.now(), text: label });
    }
    if (proposals.length > proposalCount.current && mine) {
      const p = proposals.at(-1)!;
      sound.play("proposal");
      setNotice({ id: Date.now(), text: `${factionName(session.state, p.from)} proposes ${p.kind === "peace" ? "peace" : "an alliance"}. Press D to answer.` });
    }
    wasMyTurn.current = mine;
    proposalCount.current = proposals.length;
  }, [session, version, gameOver]);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(t);
  }, [notice]);

  // The "Your battles" setting can answer the Watch/Skip prompt for you.
  useEffect(() => {
    if (!prompt || panel === "welcome") return;
    if (prefs.battles === "skip") session.skipBattle();
    else if (prefs.battles === "watch") setWatching(prompt.id);
  }, [prompt?.id, prefs.battles, panel, session]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (concealRef.current) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (watchedRef.current) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const open = panelRef.current;
      if (open) {
        const toggles: Partial<Record<Panel, string>> = { research: "r", diplomacy: "d", help: "h" };
        if (key === "Escape" || toggles[open] === key) closePanelRef.current();
        return;
      }
      const battle = session.battlePrompt;
      if (battle) {
        if (key === "w") setWatching(battle.id);
        if (key === "s" || key === "Enter") {
          e.preventDefault();
          session.skipBattle();
        }
        return;
      }
      if (session.battleReport) {
        if (key === "Enter" || key === "Escape") {
          e.preventDefault();
          session.dismissBattleReport();
        }
        return;
      }
      if (key === "r") setPanel("research");
      else if (key === "d") setPanel("diplomacy");
      else if (key === "h" || key === "?") setPanel("help");
      else if (key === "Escape") {
        if (session.selection.province) session.clearSelection();
        else setPanel("menu");
      } else if (key === "Enter" && session.isHumanTurn) {
        // Otherwise Enter would also "click" whichever button was focused last.
        e.preventDefault();
        session.dispatch({ kind: "end-turn" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session]);

  const error = session.lastError ?? saveError;

  return (
    <div className="game">
      <div className="map" ref={containerRef} />
      <TopBar
        session={session}
        onMenu={() => setPanel("menu")}
        onToggleTreasury={() => setShowTreasury((v) => !v)}
        onOpenResearch={() => setPanel("research")}
        onOpenDiplomacy={() => setPanel("diplomacy")}
      />
      {showTreasury && <TreasuryPanel session={session} onClose={() => setShowTreasury(false)} />}
      <ProvincePanel session={session} targets={targets} onFocus={(p) => viewRef.current?.focusProvince(p)} />
      <EventLog session={session} />
      {error && <div className="toast error">{error}</div>}
      {!error && notice && (
        <div key={notice.id} className="toast notice">
          {notice.text}
        </div>
      )}
      {!session.selection.province && !gameOver && !prompt && (
        <div className="hint panel">
          Click a province or army. Drag to pan, right-drag to rotate, scroll to zoom. <kbd>R</kbd> research, <kbd>D</kbd> diplomacy, <kbd>H</kbd> help,{" "}
          <kbd>Enter</kbd> ends your turn.
        </div>
      )}
      {hover && (
        <div className="tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          {provinceName(session.state, hover.province)}
          {targets.has(hover.province) && <span className={`tag ${targets.get(hover.province)}`}>{targets.get(hover.province)}</span>}
        </div>
      )}
      {panel === "research" && <ResearchScreen session={session} onClose={closePanel} />}
      {panel === "diplomacy" && <DiplomacyScreen session={session} onClose={closePanel} />}
      {watched ? (
        <BattleScreen session={session} battle={watched} rapier={rapier} />
      ) : prompt ? (
        <BattlePrompt session={session} battle={prompt} onWatch={() => setWatching(prompt.id)} />
      ) : session.battleReport ? (
        <BattleReport session={session} report={session.battleReport} />
      ) : (
        gameOver && <GameOver session={session} onQuit={onQuit} />
      )}
      {panel === "menu" && (
        <GameMenu session={session} onResume={closePanel} onSettings={() => setPanel("settings")} onHelp={() => setPanel("help")} onQuit={onQuit} />
      )}
      {panel === "settings" && <SettingsPanel onClose={closePanel} />}
      {(panel === "help" || panel === "welcome") && <HelpPanel welcome={panel === "welcome"} onClose={closePanel} />}
      {conceal && (
        <div className="pass-cover">
          <div className="panel dialog pass-card">
            {session.isHumanTurn ? (
              <>
                <h2>Pass the device</h2>
                <p>
                  <span className="swatch" style={{ background: session.state.factions[session.state.activeFaction]?.color }} />
                  {factionName(session.state, session.state.activeFaction)} is up. The map stays hidden until you continue.
                </p>
                <button className="primary" onClick={() => setAcked(passKey)}>
                  I'm {factionName(session.state, session.state.activeFaction)}
                </button>
              </>
            ) : (
              <>
                <h2>{factionName(session.state, session.state.activeFaction)} is thinking</h2>
                <p className="muted">The map stays covered between human turns.</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
