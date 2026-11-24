/**
 * Small retro sound effects made on the fly with Web Audio, so the game needs no sound files.
 * Browsers only allow audio after the player touches or presses something: call unlockAudio then.
 */
const KEY = 'sss-hunter-sound';

let ctx: AudioContext | null = null;
let muted = readMuted();

function readMuted() {
  try {
    return window.localStorage.getItem(KEY) === 'off';
  } catch {
    return false;
  }
}

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

export function soundOn() {
  return !muted;
}

export function toggleSound(): boolean {
  muted = !muted;
  try {
    window.localStorage.setItem(KEY, muted ? 'off' : 'on');
  } catch {
    // Private mode: the setting just lasts for this visit.
  }
  return !muted;
}

/** One blip: a frequency that may slide to another, with a quick fade out. */
function tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; to?: number; delay?: number } = {}) {
  if (muted || !ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + (opts.delay ?? 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type ?? 'square';
  osc.frequency.setValueAtTime(freq, t);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
  gain.gain.setValueAtTime(opts.vol ?? 0.06, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** A short burst of noise, for hits. */
function noise(dur: number, vol = 0.08, delay = 0) {
  if (muted || !ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t);
  src.connect(gain).connect(ctx.destination);
  src.start(t);
}

export const sfx = {
  hit: () => {
    noise(0.06, 0.07);
    tone(220, 0.06, { to: 110 });
  },
  hurt: () => {
    noise(0.1, 0.1);
    tone(160, 0.14, { type: 'sawtooth', to: 60, vol: 0.07 });
  },
  skill: () => {
    tone(520, 0.12, { type: 'sawtooth', to: 1040, vol: 0.05 });
    noise(0.08, 0.05, 0.04);
  },
  block: () => tone(900, 0.08, { type: 'triangle', to: 1200, vol: 0.05 }),
  kill: () => {
    tone(330, 0.07, { vol: 0.05 });
    tone(220, 0.12, { delay: 0.06, to: 90, vol: 0.05 });
  },
  bigKill: () => {
    noise(0.25, 0.1);
    [262, 330, 392, 523].forEach((f, i) => tone(f, 0.12, { delay: i * 0.07, vol: 0.06 }));
  },
  heal: () => [523, 659, 784].forEach((f, i) => tone(f, 0.09, { type: 'triangle', delay: i * 0.05, vol: 0.06 })),
  mana: () => [440, 660].forEach((f, i) => tone(f, 0.1, { type: 'sine', delay: i * 0.06, vol: 0.07 })),
  chest: () => [392, 523, 784].forEach((f, i) => tone(f, 0.08, { type: 'triangle', delay: i * 0.05, vol: 0.06 })),
  curse: () => tone(300, 0.4, { type: 'sawtooth', to: 70, vol: 0.06 }),
  gear: () => [330, 440, 554, 659].forEach((f, i) => tone(f, 0.07, { delay: i * 0.04, vol: 0.05 })),
  buy: () => [988, 1319].forEach((f, i) => tone(f, 0.08, { type: 'square', delay: i * 0.06, vol: 0.04 })),
  levelup: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, { delay: i * 0.08, vol: 0.06 })),
  rescue: () => [784, 659, 784, 1047].forEach((f, i) => tone(f, 0.1, { type: 'triangle', delay: i * 0.07, vol: 0.06 })),
  floor: () => [262, 392].forEach((f, i) => tone(f, 0.15, { type: 'triangle', delay: i * 0.1, vol: 0.06 })),
  death: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.25, { type: 'sawtooth', delay: i * 0.18, vol: 0.06 })),
};
