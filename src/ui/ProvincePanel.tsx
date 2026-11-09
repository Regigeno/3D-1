import { armiesAt, garrisonSquadCount, isAllied, provinceIncome, relationBetween, scenarioProvince, visibleProvinces } from "../engine";
import { STATUS_LABEL } from "../game/diplomacy";
import { TERRAIN_LABEL, factionName } from "../game/describe";
import { BUILDING_INFO } from "../game/economy";
import type { GameSession, MoveKind } from "../game/session";
import { ArmyCard } from "./ArmyCard";
import { BuildSection } from "./BuildSection";
import { RecruitSection } from "./RecruitSection";

interface Props {
  session: GameSession;
  targets: Map<string, MoveKind>;
  onFocus(province: string): void;
}

export function ProvincePanel({ session, targets, onFocus }: Props) {
  const { state, selection } = session;
  const id = selection.province;
  if (!id) return null;

  const info = scenarioProvince(state, id);
  const province = state.provinces[id]!;
  const owner = province.owner ? state.factions[province.owner] : null;
  const isCapital = owner?.capital === id;
  const income = provinceIncome(state, id);
  const visible = visibleProvinces(state, session.viewer).has(id);
  const armies = armiesAt(state, id).filter((a) => visible || isAllied(state, session.viewer, a.owner));
  const garrison = garrisonSquadCount(state, id);
  const selectedArmy = selection.army ? state.armies[selection.army] : undefined;
  const managing = session.isHumanTurn && province.owner === state.activeFaction;

  return (
    <aside className="sidepanel panel">
      <header>
        <h2>{info.name}</h2>
        <button className="ghost icon-button" onClick={() => session.clearSelection()} title="Close (Esc)">
          ×
        </button>
      </header>

      <div className="owner">
        <span className="swatch" style={{ background: owner?.color ?? "#888" }} />
        {factionName(state, province.owner)}
        {isCapital && <span className="tag">Capital</span>}
        {owner && owner.id !== session.viewer && (
          <span className={`status ${relationBetween(state, session.viewer, owner.id)?.status ?? "war"}`}>
            {STATUS_LABEL[relationBetween(state, session.viewer, owner.id)?.status ?? "war"]}
          </span>
        )}
      </div>

      <dl className="facts">
        <dt>Terrain</dt>
        <dd>{TERRAIN_LABEL[info.terrain]}</dd>
        <dt>Income</dt>
        <dd>
          +{income.gold} gold
          {income.knowledge > 0 && `, +${income.knowledge} knowledge`}
          {income.mana > 0 && `, +${income.mana} mana`}
          {income.energy > 0 && `, +${income.energy} energy`}
        </dd>
        {info.special && (
          <>
            <dt>Resource</dt>
            <dd>{info.special === "ley-line" ? "Ley line (Mana)" : "Power site (Energy)"}</dd>
          </>
        )}
        <dt>Buildings</dt>
        <dd>{province.buildings.length ? province.buildings.map((b) => BUILDING_INFO[b].name).join(", ") : "None"}</dd>
        {garrison > 0 && (
          <>
            <dt>Garrison</dt>
            <dd>{garrison} infantry squads</dd>
          </>
        )}
      </dl>

      <section>
        <h3>Armies</h3>
        {!visible && <p className="muted">Hidden by fog of war.</p>}
        {visible && armies.length === 0 && <p className="muted">No armies here.</p>}
        {armies.map((army) => (
          <ArmyCard key={army.id} session={session} army={army} selected={army.id === selection.army} />
        ))}
        {selectedArmy && selectedArmy.owner === state.activeFaction && session.isHumanTurn && (
          <p className="muted small">
            {targets.size > 0
              ? "Click a highlighted province: green to move, amber to capture, red to attack."
              : selectedArmy.movementLeft === 0
                ? "This army has no movement left this turn."
                : "No legal moves from here."}
          </p>
        )}
      </section>

      {managing && province.buildings.includes("barracks") && <RecruitSection session={session} province={id} />}
      {managing && <BuildSection session={session} province={id} />}

      <button className="ghost small" onClick={() => onFocus(id)}>
        Center camera
      </button>
    </aside>
  );
}
