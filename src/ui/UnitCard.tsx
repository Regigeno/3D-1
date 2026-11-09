import { SQUAD_SIZE, strongAgainst, unitFor, weakAgainst, type Era, type MilitaryType } from "../engine";
import { ERA_LABEL, TYPE_LABEL } from "../game/describe";
import { Cost } from "./Cost";

const WEAPON_LABEL: Record<string, string> = {
  melee: "Melee",
  projectile: "Projectile",
  beam: "Beam",
  area: "Area blast",
  magic: "Magic (ignores armor)",
};

export function UnitCard({ type, era }: { type: MilitaryType; era: Era }) {
  const unit = unitFor(type, era);
  const dps = unit.weapon.damage / unit.weapon.cooldown;
  const strong = strongAgainst(type);
  const weak = weakAgainst(type);

  return (
    <div className="unit-card">
      <div className="unit-card-head">
        <h3>{unit.name}</h3>
        <span className="muted small">
          {ERA_LABEL[era]} {TYPE_LABEL[type]}
        </span>
      </div>
      <dl className="facts">
        <dt>Cost</dt>
        <dd>
          <Cost cost={unit.cost} /> per squad
        </dd>
        <dt>Upkeep</dt>
        <dd>{unit.upkeep} gold per turn</dd>
        <dt>Squad</dt>
        <dd>{SQUAD_SIZE[type]} soldiers</dd>
        <dt>Health</dt>
        <dd>{unit.health} each</dd>
        <dt>Armor</dt>
        <dd>{Math.round(unit.armor * 100)}%</dd>
        <dt>Damage</dt>
        <dd>
          {unit.weapon.damage} every {unit.weapon.cooldown}s ({dps.toFixed(1)}/s)
        </dd>
        <dt>Weapon</dt>
        <dd>
          {WEAPON_LABEL[unit.weapon.kind]}, range {unit.weapon.range}
        </dd>
        <dt>Speed</dt>
        <dd>{unit.speed}</dd>
      </dl>
      <p className="small">
        <span className="good">Strong vs</span> {strong.map((t) => TYPE_LABEL[t]).join(", ") || "nothing in particular"}
        <br />
        <span className="bad">Weak vs</span> {weak.map((t) => TYPE_LABEL[t]).join(", ") || "nothing in particular"}
      </p>
    </div>
  );
}
