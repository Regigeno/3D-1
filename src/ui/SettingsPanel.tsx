import { sound } from "../audio/sound";
import type { BattleMode, GraphicsQuality } from "../game/settings";
import { settings, useSettings } from "./services";

const BATTLES: Array<{ id: BattleMode; label: string; hint: string }> = [
  { id: "ask", label: "Ask", hint: "Choose Watch or Skip for every battle you fight." },
  { id: "watch", label: "Always watch", hint: "Every battle you fight opens in 3D." },
  { id: "skip", label: "Always skip", hint: "Battles resolve at once; the report still shows what happened." },
];

const GRAPHICS: Array<{ id: GraphicsQuality; label: string; hint: string }> = [
  { id: "high", label: "High", hint: "Shadows and sharp rendering." },
  { id: "low", label: "Low", hint: "No shadows and fewer pixels, for laptops and older GPUs." },
];

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ id: T; label: string }>; onChange(v: T): void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className={value === o.id ? "active" : undefined} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsPanel({ onClose }: { onClose(): void }) {
  const s = useSettings();
  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel dialog settings" onClick={(e) => e.stopPropagation()}>
        <header className="research-head">
          <h2>Settings</h2>
          <div className="spacer" />
          <button className="ghost icon-button" onClick={onClose} title="Close (Esc)">
            ×
          </button>
        </header>

        <div className="field">
          <span>Sound: {s.muted ? "muted" : `${Math.round(s.volume * 100)}%`}</span>
          <div className="row">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.volume}
              disabled={s.muted}
              onChange={(e) => settings.set({ volume: Number(e.target.value) })}
              onPointerUp={() => sound.play("click")}
            />
            <button type="button" className="ghost" onClick={() => settings.set({ muted: !s.muted })}>
              {s.muted ? "Unmute" : "Mute"}
            </button>
          </div>
        </div>

        <div className="field">
          <span>Graphics</span>
          <Segmented label="Graphics" value={s.graphics} options={GRAPHICS} onChange={(graphics) => settings.set({ graphics })} />
          <span className="small muted">{GRAPHICS.find((g) => g.id === s.graphics)!.hint}</span>
        </div>

        <div className="field">
          <span>Your battles</span>
          <Segmented label="Your battles" value={s.battles} options={BATTLES} onChange={(battles) => settings.set({ battles })} />
          <span className="small muted">{BATTLES.find((b) => b.id === s.battles)!.hint}</span>
        </div>

        <button type="button" className="ghost" onClick={() => settings.set({ seenIntro: false })} disabled={!s.seenIntro}>
          {s.seenIntro ? "Show the welcome guide again next game" : "The welcome guide shows at the start of the next game"}
        </button>
      </div>
    </div>
  );
}
