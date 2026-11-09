import { useEffect, useSyncExternalStore } from "react";
import { sound } from "../audio/sound";
import { SettingsStore, type Settings } from "../game/settings";
import { SaveStore, browserStore } from "../game/storage";

const store = browserStore();
export const saves = new SaveStore(store);
export const settings = new SettingsStore(store);

export function useSettings(): Settings {
  return useSyncExternalStore(settings.subscribe, settings.get);
}

/** Keeps the sound engine in step with the settings, and unlocks audio on the first interaction. */
export function useSoundSettings(): void {
  const { volume, muted } = useSettings();
  useEffect(() => sound.setVolume(volume, muted), [volume, muted]);
  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
}

/** Offers a save (or any JSON) as a file download. */
export function downloadJson(fileName: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(ms).toLocaleDateString();
}
