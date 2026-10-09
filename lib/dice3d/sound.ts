// Dice clatter, made from short bursts of noise (no sound files to download).
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

/** Must be called from a tap (browsers only allow sound after the user does something). */
export function unlockAudio() {
  if (typeof window === "undefined") return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx ??= new AC();
  if (ctx.state === "suspended") void ctx.resume();
  if (!noise) {
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  }
}

/** One "clack". strength 0..1 */
export function playHit(strength: number) {
  if (!ctx || !noise || ctx.state !== "running") return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.8 + Math.random() * 0.5;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 1800 + Math.random() * 2600;
  band.Q.value = 1.2;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.05 + strength * 0.45, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07 + strength * 0.05);
  src.connect(band).connect(gain).connect(ctx.destination);
  src.start(t);
  src.stop(t + 0.15);
}

/** A little chime for a natural 20, a low thud for a natural 1. */
export function playCue(kind: "crit" | "fumble") {
  if (!ctx || ctx.state !== "running") return;
  const t = ctx.currentTime;
  const notes = kind === "crit" ? [784, 988, 1319] : [196, 147];
  notes.forEach((f, i) => {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = kind === "crit" ? "triangle" : "sine";
    o.frequency.value = f;
    const s = t + i * (kind === "crit" ? 0.08 : 0.14);
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(kind === "crit" ? 0.18 : 0.25, s + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, s + (kind === "crit" ? 0.5 : 0.35));
    o.connect(g).connect(ctx!.destination);
    o.start(s);
    o.stop(s + 0.6);
  });
}
