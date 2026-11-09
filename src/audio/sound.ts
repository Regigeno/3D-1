/**
 * Synthesized sound effects (Web Audio, no audio files). Everything is built
 * from oscillators and filtered noise so the download stays small.
 */
export type SoundKind = "click" | "turn" | "melee" | "bow" | "gun" | "beam" | "magic" | "explosion" | "victory" | "defeat" | "proposal";

const MIN_GAP: Partial<Record<SoundKind, number>> = { melee: 0.05, bow: 0.06, gun: 0.04, beam: 0.06, magic: 0.1, explosion: 0.12 };
const MAX_VOICES = 24;

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<SoundKind, number>();
  private voices = 0;
  private volume = 0.6;
  private muted = false;

  setVolume(volume: number, muted: boolean): void {
    this.volume = volume;
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : volume * 0.5;
  }

  /** Browsers only allow audio after a user gesture; call this from one. */
  unlock(): void {
    const ctx = this.context();
    if (ctx?.state === "suspended") void ctx.resume();
  }

  /** Plays a sound. `gain` scales it, e.g. by distance from the camera. */
  play(kind: SoundKind, gain = 1): void {
    if (this.muted || this.volume <= 0 || gain <= 0.02) return;
    const ctx = this.context();
    if (!ctx || ctx.state !== "running" || this.voices >= MAX_VOICES) return;
    const now = ctx.currentTime;
    const gap = MIN_GAP[kind] ?? 0;
    if (now - (this.last.get(kind) ?? -1) < gap) return;
    this.last.set(kind, now);
    const out = ctx.createGain();
    out.gain.value = gain;
    out.connect(this.master!);
    this.voices++;
    const duration = RECIPES[kind](ctx, out, now, this.noise!);
    window.setTimeout(() => {
      out.disconnect();
      this.voices--;
    }, (duration + 0.1) * 1000);
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = typeof window !== "undefined" ? window.AudioContext : undefined;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume * 0.5;
    this.master.connect(this.ctx.destination);
    const length = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return this.ctx;
  }
}

type Recipe = (ctx: AudioContext, out: AudioNode, t: number, noise: AudioBuffer) => number;

function envelope(ctx: AudioContext, out: AudioNode, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return g;
}

function tone(ctx: AudioContext, out: AudioNode, t: number, type: OscillatorType, from: number, to: number, peak: number, decay: number, attack = 0.005): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
  osc.connect(envelope(ctx, out, t, peak, attack, decay));
  osc.start(t);
  osc.stop(t + attack + decay + 0.02);
}

function burst(ctx: AudioContext, out: AudioNode, t: number, noise: AudioBuffer, filter: BiquadFilterType, from: number, to: number, peak: number, decay: number, attack = 0.003, q = 1): void {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  if (to !== from) f.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
  src.connect(f);
  f.connect(envelope(ctx, out, t, peak, attack, decay));
  src.start(t, Math.random() * 0.5);
  src.stop(t + attack + decay + 0.02);
}

const jitter = (base: number) => base * (0.9 + Math.random() * 0.2);

const RECIPES: Record<SoundKind, Recipe> = {
  click: (ctx, out, t) => (tone(ctx, out, t, "triangle", 900, 700, 0.15, 0.05), 0.06),
  turn: (ctx, out, t) => {
    tone(ctx, out, t, "sine", 523, 523, 0.25, 0.35);
    tone(ctx, out, t + 0.12, "sine", 784, 784, 0.25, 0.5);
    return 0.65;
  },
  proposal: (ctx, out, t) => {
    tone(ctx, out, t, "triangle", 660, 660, 0.2, 0.2);
    tone(ctx, out, t + 0.1, "triangle", 880, 880, 0.2, 0.3);
    return 0.45;
  },
  melee: (ctx, out, t, noise) => {
    burst(ctx, out, t, noise, "bandpass", jitter(2600), jitter(1800), 0.5, 0.09, 0.002, 6);
    tone(ctx, out, t, "square", jitter(1400), jitter(900), 0.05, 0.08);
    return 0.12;
  },
  bow: (ctx, out, t, noise) => (burst(ctx, out, t, noise, "bandpass", jitter(1800), 500, 0.25, 0.22, 0.02, 2), 0.25),
  gun: (ctx, out, t, noise) => {
    burst(ctx, out, t, noise, "lowpass", jitter(3000), 300, 0.7, 0.14, 0.001);
    tone(ctx, out, t, "sine", 140, 50, 0.3, 0.1);
    return 0.16;
  },
  beam: (ctx, out, t) => (tone(ctx, out, t, "sawtooth", jitter(1600), 260, 0.12, 0.18), 0.2),
  magic: (ctx, out, t, noise) => {
    burst(ctx, out, t, noise, "bandpass", 400, 1400, 0.35, 0.35, 0.05, 3);
    tone(ctx, out, t, "sine", 300, 600, 0.08, 0.35, 0.05);
    return 0.42;
  },
  explosion: (ctx, out, t, noise) => {
    burst(ctx, out, t, noise, "lowpass", 900, 120, 0.9, 0.9, 0.005);
    tone(ctx, out, t, "sine", 90, 35, 0.6, 0.6);
    return 0.95;
  },
  victory: (ctx, out, t) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(ctx, out, t + i * 0.13, "triangle", f, f, 0.25, i === 3 ? 0.8 : 0.2));
    return 1.3;
  },
  defeat: (ctx, out, t) => {
    [392, 349, 311, 262].forEach((f, i) => tone(ctx, out, t + i * 0.2, "triangle", f, f, 0.22, i === 3 ? 0.9 : 0.25));
    return 1.6;
  },
};

export const sound = new Sound();
