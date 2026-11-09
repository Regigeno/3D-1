import type { Cost as CostValue, ResourceKind } from "../engine";

export const RESOURCE_ICON: Record<ResourceKind, string> = {
  gold: "◆",
  knowledge: "✦",
  mana: "✧",
  energy: "⚡",
};

export function Cost({ cost }: { cost: CostValue }) {
  const parts = (Object.keys(RESOURCE_ICON) as ResourceKind[]).filter((k) => (cost[k] ?? 0) > 0);
  return (
    <span className="cost">
      {parts.map((k) => (
        <span key={k} className={`resource ${k}`}>
          <span className="icon">{RESOURCE_ICON[k]}</span>
          {cost[k]}
        </span>
      ))}
    </span>
  );
}
