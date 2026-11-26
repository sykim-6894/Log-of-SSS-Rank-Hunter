/**
 * Retro sound effects and background music made on the fly with Web Audio, so the game needs
 * no sound files (and so no licences to track). Browsers only allow audio after the player
 * touches or presses something: call unlockAudio then.
 *
 * Volumes: effects and music each have a level 0 (off) to 3 (loud), saved in localStorage.
 * The old on/off key ('sss-hunter-sound') is still the master mute, toggled with M in the tower.
 */
import type { ClassId } from '../core/classes';
import type { Element } from '../core/monsters';

const KEY = 'sss-hunter-sound';
const SFX_KEY = 'sss-hunter-sfx-vol';
const MUSIC_KEY = 'sss-hunter-music-vol';
const SHAKE_KEY = 'sss-hunter-shake';

export type Level = 0 | 1 | 2 | 3;
const LEVEL_GAIN = [0, 0.5, 1, 1.5];
/** Music sits under the effects. */
const MUSIC_GAIN = 0.9;

let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = read(KEY) === 'off';
let sfxLevel = readLevel(SFX_KEY, 2);
let musicLevel = readLevel(MUSIC_KEY, 2);

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, v: string) {
  try {
    window.localStorage.setItem(key, v);
  } catch {
    // Private mode: the setting just lasts for this visit.
  }
}

function readLevel(key: string, fallback: Level): Level {
  const n = Number(read(key));
  return read(key) !== null && n >= 0 && n <= 3 ? (n as Level) : fallback;
}

function applyVolumes() {
  if (!ctx || !sfxBus || !musicBus) return;
  const t = ctx.currentTime;
  sfxBus.gain.setTargetAtTime(muted ? 0 : LEVEL_GAIN[sfxLevel], t, 0.03);
  musicBus.gain.setTargetAtTime(muted ? 0 : LEVEL_GAIN[musicLevel] * MUSIC_GAIN, t, 0.15);
}

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    // A gentle limiter keeps stacked hits from clipping.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 6;
    comp.connect(ctx.destination);
    sfxBus = ctx.createGain();
    musicBus = ctx.createGain();
    sfxBus.gain.value = 0;
    musicBus.gain.value = 0;
    sfxBus.connect(comp);
    musicBus.connect(comp);
    const len = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    applyVolumes();
    // Quiet while the tab or app is in the background.
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) void ctx.suspend();
      else void ctx.resume();
    });
  }
  if (ctx.state === 'suspended' && !document.hidden) void ctx.resume();
  startScheduler();
}

export function soundOn() {
  return !muted;
}

/** Master mute (the M key in the tower). */
export function toggleSound(): boolean {
  muted = !muted;
  write(KEY, muted ? 'off' : 'on');
  applyVolumes();
  return !muted;
}

export function sfxVolume(): Level {
  return muted ? 0 : sfxLevel;
}

export function musicVolume(): Level {
  return muted ? 0 : musicLevel;
}

/** Picking a volume in settings also lifts the master mute. */
export function setSfxVolume(v: Level) {
  sfxLevel = v;
  write(SFX_KEY, String(v));
  if (muted && v > 0) {
    muted = false;
    write(KEY, 'on');
  }
  applyVolumes();
}

export function setMusicVolume(v: Level) {
  musicLevel = v;
  write(MUSIC_KEY, String(v));
  if (muted && v > 0) {
    muted = false;
    write(KEY, 'on');
  }
  applyVolumes();
}

/** Screen shake can be turned off for players who find it uncomfortable. */
export function shakeOn() {
  return read(SHAKE_KEY) !== 'off';
}

export function setShake(on: boolean) {
  write(SHAKE_KEY, on ? 'on' : 'off');
}

function live(): boolean {
  return !!ctx && ctx.state === 'running';
}

// ---------------------------------------------------------------- effects

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  /** Slide to this frequency over the note. */
  to?: number;
  delay?: number;
  /** Attack time; 0 means instant. */
  attack?: number;
  /** Small pitch wobble for a richer sound. */
  detune?: number;
}

/** One blip: a frequency that may slide to another, with a quick fade out. */
function tone(freq: number, dur: number, opts: ToneOpts = {}, bus: AudioNode | null = sfxBus, at?: number) {
  if (!live() || !bus) return;
  const c = ctx!;
  const t = (at ?? c.currentTime) + (opts.delay ?? 0);
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = opts.type ?? 'square';
  osc.frequency.setValueAtTime(freq, t);
  if (opts.detune) osc.detune.setValueAtTime(opts.detune, t);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
  const vol = opts.vol ?? 0.06;
  if (opts.attack) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + opts.attack);
  } else gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(bus);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

interface NoiseOpts {
  vol?: number;
  delay?: number;
  /** Filter: 'lowpass' for thuds, 'highpass' for hiss, 'bandpass' for swishes. */
  filter?: BiquadFilterType;
  freq?: number;
  /** Slide the filter to this frequency. */
  to?: number;
  q?: number;
}

/** A short burst of noise, for hits, swishes and drums. */
function noise(dur: number, opts: NoiseOpts = {}, bus: AudioNode | null = sfxBus, at?: number) {
  if (!live() || !bus || !noiseBuf) return;
  const c = ctx!;
  const t = (at ?? c.currentTime) + (opts.delay ?? 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const gain = c.createGain();
  gain.gain.setValueAtTime(opts.vol ?? 0.08, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node: AudioNode = src;
  if (opts.filter) {
    const f = c.createBiquadFilter();
    f.type = opts.filter;
    f.frequency.setValueAtTime(opts.freq ?? 1000, t);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    f.Q.value = opts.q ?? 1;
    node.connect(f);
    node = f;
  }
  node.connect(gain).connect(bus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

const arp = (notes: number[], step: number, o: ToneOpts & { len?: number } = {}) =>
  notes.forEach((f, i) => tone(f, o.len ?? step * 1.6, { ...o, delay: (o.delay ?? 0) + i * step }));

/** The hunter's own swing, by class. */
const SWING: Record<ClassId, () => void> = {
  sword: () => noise(0.09, { vol: 0.09, filter: 'bandpass', freq: 2500, to: 700, q: 2 }),
  knight: () => {
    noise(0.12, { vol: 0.12, filter: 'lowpass', freq: 900, to: 200 });
    tone(110, 0.12, { type: 'triangle', to: 55, vol: 0.12 });
  },
  mage: () => tone(880, 0.1, { type: 'sine', to: 330, vol: 0.07 }),
  archer: () => tone(520, 0.08, { type: 'triangle', to: 260, vol: 0.06 }),
};

const SKILL_SOUND: Record<Element | 'none', (big: boolean) => void> = {
  fire: (big) => {
    noise(big ? 0.7 : 0.35, { vol: big ? 0.16 : 0.11, filter: 'lowpass', freq: 400, to: 3000 });
    noise(big ? 0.5 : 0.25, { vol: 0.06, filter: 'highpass', freq: 3000, delay: 0.08 });
    tone(big ? 90 : 140, big ? 0.6 : 0.3, { type: 'sawtooth', to: 40, vol: 0.06 });
  },
  ice: (big) => {
    arp([1568, 2093, 1760, 2637], 0.04, { type: 'sine', vol: 0.06, len: 0.25 });
    noise(0.2, { vol: 0.05, filter: 'highpass', freq: 5000 });
    if (big) tone(196, 0.5, { type: 'triangle', vol: 0.08 });
  },
  lightning: (big) => {
    for (let i = 0; i < (big ? 6 : 4); i++) tone(200 + Math.random() * 1400, 0.05, { type: 'sawtooth', vol: 0.06, delay: i * 0.03 });
    noise(0.25, { vol: 0.1, filter: 'bandpass', freq: 3000, q: 0.7 });
    if (big) noise(0.6, { vol: 0.12, filter: 'lowpass', freq: 300, delay: 0.1 });
  },
  none: (big) => {
    tone(520, 0.12, { type: 'sawtooth', to: 1040, vol: 0.05 });
    noise(0.12, { vol: 0.07, filter: 'bandpass', freq: 1800, to: 600, delay: 0.03 });
    if (big) tone(130, 0.4, { type: 'square', to: 65, vol: 0.07, delay: 0.05 });
  },
};

export const sfx = {
  /** A hunter's blow landing; several at once (skills) still make one sound. */
  hit: (cls: ClassId = 'sword', count = 1, weak = false) => {
    SWING[cls]();
    noise(0.07, { vol: 0.09 + Math.min(0.06, count * 0.015), filter: 'lowpass', freq: 2400, delay: 0.02 });
    tone(220, 0.07, { to: 100, vol: 0.06, delay: 0.02 });
    if (weak) tone(1400, 0.1, { type: 'square', to: 700, vol: 0.04, delay: 0.03 });
  },
  shoot: () => {
    tone(700, 0.05, { type: 'triangle', to: 1400, vol: 0.05 });
    noise(0.05, { vol: 0.04, filter: 'highpass', freq: 3000 });
  },
  hurt: () => {
    noise(0.12, { vol: 0.12, filter: 'lowpass', freq: 1500 });
    tone(160, 0.16, { type: 'sawtooth', to: 60, vol: 0.07 });
  },
  skill: (element?: Element, big = false) => SKILL_SOUND[element ?? 'none'](big),
  block: () => {
    tone(900, 0.08, { type: 'triangle', to: 1200, vol: 0.05 });
    tone(1800, 0.12, { type: 'sine', vol: 0.03 });
  },
  miss: () => noise(0.12, { vol: 0.05, filter: 'bandpass', freq: 1200, to: 3000, q: 3 }),
  kill: () => {
    tone(330, 0.07, { vol: 0.05 });
    tone(220, 0.12, { delay: 0.06, to: 90, vol: 0.05 });
    noise(0.1, { vol: 0.05, filter: 'lowpass', freq: 800, delay: 0.04 });
  },
  bigKill: () => {
    noise(0.45, { vol: 0.14, filter: 'lowpass', freq: 1200, to: 150 });
    tone(80, 0.5, { type: 'triangle', to: 35, vol: 0.14 });
    arp([262, 330, 392, 523], 0.07, { vol: 0.06, delay: 0.1, len: 0.14 });
  },
  heal: () => arp([523, 659, 784], 0.05, { type: 'triangle', vol: 0.06, len: 0.09 }),
  mana: () => arp([440, 660], 0.06, { type: 'sine', vol: 0.07, len: 0.1 }),
  chest: () => {
    noise(0.06, { vol: 0.06, filter: 'lowpass', freq: 600 });
    arp([392, 523, 784, 1047], 0.05, { type: 'triangle', vol: 0.06, delay: 0.06, len: 0.12 });
  },
  coin: () => arp([988, 1319], 0.06, { type: 'square', vol: 0.04, len: 0.09 }),
  curse: () => {
    tone(300, 0.45, { type: 'sawtooth', to: 70, vol: 0.06 });
    tone(311, 0.45, { type: 'sawtooth', to: 74, vol: 0.04 });
  },
  gear: () => arp([330, 440, 554, 659], 0.04, { vol: 0.05, len: 0.07 }),
  buy: () => arp([988, 1319], 0.06, { type: 'square', vol: 0.04, len: 0.08 }),
  levelup: () => {
    arp([523, 659, 784, 1047], 0.08, { vol: 0.06, len: 0.12 });
    arp([1047, 1319, 1568], 0.06, { type: 'triangle', vol: 0.05, delay: 0.32, len: 0.2 });
  },
  rescue: () => arp([784, 659, 784, 1047], 0.07, { type: 'triangle', vol: 0.06, len: 0.1 }),
  floor: () => {
    noise(0.3, { vol: 0.05, filter: 'bandpass', freq: 400, to: 1600, q: 2 });
    arp([262, 392, 523], 0.1, { type: 'triangle', vol: 0.06, len: 0.18 });
  },
  death: () => {
    noise(0.6, { vol: 0.12, filter: 'lowpass', freq: 600, to: 80 });
    arp([392, 330, 262, 196], 0.2, { type: 'sawtooth', vol: 0.06, len: 0.3 });
  },
  /** A boss steps into view. */
  boss: () => {
    tone(55, 1.2, { type: 'sawtooth', vol: 0.1, attack: 0.05 });
    tone(82, 1.2, { type: 'square', vol: 0.05, attack: 0.05, detune: 8 });
    noise(1, { vol: 0.08, filter: 'lowpass', freq: 200, to: 60 });
    arp([147, 156], 0.35, { type: 'sawtooth', vol: 0.06, delay: 0.3, len: 0.5 });
  },
  /** Gate or wave cleared, or a big win. */
  fanfare: () => {
    arp([523, 523, 523, 698], 0.1, { type: 'square', vol: 0.06, len: 0.12 });
    tone(880, 0.5, { type: 'square', vol: 0.06, delay: 0.42 });
    tone(523, 0.5, { type: 'triangle', vol: 0.07, delay: 0.42 });
    noise(0.4, { vol: 0.05, filter: 'highpass', freq: 6000, delay: 0.42 });
  },
  /** A hunter moved up a grade: the biggest fanfare. */
  gradeUp: () => {
    arp([392, 523, 659, 784], 0.08, { type: 'square', vol: 0.06, len: 0.12 });
    arp([784, 988, 1175], 0.09, { type: 'square', vol: 0.05, delay: 0.36, len: 0.14 });
    tone(1568, 0.9, { type: 'triangle', vol: 0.07, delay: 0.66 });
    tone(784, 0.9, { type: 'square', vol: 0.04, delay: 0.66 });
    tone(523, 0.9, { type: 'triangle', vol: 0.06, delay: 0.66 });
    noise(0.6, { vol: 0.06, filter: 'highpass', freq: 7000, delay: 0.66 });
  },
  /** Enhancement or gacha: rising tension before the result. */
  charge: () => {
    tone(200, 0.45, { type: 'sawtooth', to: 900, vol: 0.04 });
    for (let i = 0; i < 6; i++) noise(0.04, { vol: 0.04, filter: 'highpass', freq: 3000, delay: i * 0.07 });
  },
  shatter: () => {
    noise(0.5, { vol: 0.14, filter: 'highpass', freq: 2500, to: 800 });
    for (let i = 0; i < 5; i++) tone(2000 + Math.random() * 2000, 0.08, { type: 'sine', vol: 0.04, delay: 0.03 + i * 0.05 });
    arp([330, 247, 196], 0.12, { type: 'sawtooth', vol: 0.05, delay: 0.2, len: 0.2 });
  },
  /** Buttons: a soft tick. */
  click: () => tone(1200, 0.03, { type: 'square', vol: 0.025 }),
};

// ---------------------------------------------------------------- music

export type TrackId = 'title' | 'hq' | 'tower' | 'boss';

interface Track {
  bpm: number;
  /** One chord per bar, like 'Am', 'F', 'C#m', 'Bb'. */
  chords: string[];
  /** One string per bar, eight eighth-notes: a note ('E5', 'F#4', 'Bb4') starts, '-' holds, '.' rests. */
  melody: string[];
  lead: OscillatorType;
  leadVol: number;
  /** Eighth-note bass: r root, f fifth, o octave up, . rest. */
  bass: string;
  bassType: OscillatorType;
  /** Eighth-note broken chord: 0-2 chord notes, 3 the root an octave up. */
  arp?: string;
  /** Soft held chord under everything. */
  pad?: boolean;
  /** Kick, snare and hi-hat, x on the beat, per bar. */
  kick?: string;
  snare?: string;
  hat?: string;
}

export const TRACKS: Record<TrackId, Track> = {
  // Slow and a little mysterious: a gate opening at night.
  title: {
    bpm: 76,
    chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'E'],
    melody: [
      'E5 - - - D5 - C5 -',
      'A4 - - - - - . .',
      'G4 - C5 - E5 - G5 -',
      'F5 - E5 - D5 - - -',
      'E5 - - - A5 - - -',
      'G5 - F5 - E5 - C5 -',
      'D5 - - - B4 - D5 -',
      'E5 - - - - - . .',
    ],
    lead: 'triangle',
    leadVol: 0.07,
    bass: 'r...f...',
    bassType: 'triangle',
    arp: '0.1.2.1.',
    pad: true,
  },
  // The office: easy-going and bright.
  hq: {
    bpm: 104,
    chords: ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G'],
    melody: [
      'E5 . G5 . C6 - G5 .',
      'A5 - G5 - E5 - . .',
      'F5 . A5 . C6 - A5 .',
      'G5 - - - D5 - . .',
      'E5 . G5 . C6 - D6 .',
      'E6 - D6 - C6 - A5 .',
      'F5 - A5 - G5 - F5 -',
      'D5 - B4 - C5 - - -',
    ],
    lead: 'square',
    leadVol: 0.035,
    bass: 'r.o.r.f.',
    bassType: 'triangle',
    arp: '01230123',
    kick: 'x...x...',
    snare: '..x...x.',
    hat: '.x.x.x.x',
  },
  // Climbing: minor, driving, not too busy so effects stay clear.
  tower: {
    bpm: 118,
    chords: ['Dm', 'Bb', 'C', 'Dm', 'Dm', 'Gm', 'A', 'A'],
    melody: [
      'D5 - - A4 - - D5 -',
      'F5 - E5 - D5 - C5 -',
      'E5 - - C5 - - G4 -',
      'A4 - - - - - . .',
      'D5 - F5 - A5 - G5 F5',
      'G5 - - D5 - - Bb4 -',
      'C#5 - - E5 - - A5 -',
      'G5 - F5 - E5 - C#5 -',
    ],
    lead: 'square',
    leadVol: 0.03,
    bass: 'rorororo',
    bassType: 'triangle',
    kick: 'x..x.x..',
    snare: '....x...',
    hat: 'xxxxxxxx',
  },
  // A boss, a ranker duel or the abyss stalker: fast and loud.
  boss: {
    bpm: 152,
    chords: ['Em', 'Em', 'C', 'D', 'Em', 'Em', 'C', 'B'],
    melody: [
      'E5 - E5 G5 - E5 B5 -',
      'A5 - G5 - F#5 - E5 -',
      'E5 - - G5 - - C6 -',
      'B5 - A5 - F#5 - D5 -',
      'E5 - E5 G5 - E5 B5 -',
      'D6 - B5 - G5 - E5 -',
      'C6 - B5 - G5 - E5 -',
      'D#5 - F#5 - B5 - - -',
    ],
    lead: 'sawtooth',
    leadVol: 0.03,
    bass: 'rorororo',
    bassType: 'square',
    arp: '0123.3.2',
    kick: 'x.x.x.x.',
    snare: '..x...x.',
    hat: 'xxxxxxxx',
  },
};

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'F#4' → MIDI number. */
export function midi(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + NOTE_INDEX[m[1]] + acc;
}

const hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** 'C#m' → the triad's MIDI numbers with the root in octave 3. */
export function chordNotes(name: string): number[] {
  const m = /^([A-G][#b]?)(m?)$/.exec(name);
  if (!m) throw new Error(`bad chord ${name}`);
  const root = midi(`${m[1]}3`);
  return [root, root + (m[2] ? 3 : 4), root + 7];
}

/** A melody bar as [step, MIDI note, length in steps]. */
export function parseBar(bar: string): Array<[number, number, number]> {
  const tokens = bar.trim().split(/\s+/);
  const out: Array<[number, number, number]> = [];
  tokens.forEach((tok, i) => {
    if (tok === '-' || tok === '.') {
      if (tok === '-' && out.length && out[out.length - 1][0] + out[out.length - 1][2] === i) out[out.length - 1][2] += 1;
      return;
    }
    out.push([i, midi(tok), 1]);
  });
  return out;
}

const parsed = new Map<TrackId, Array<Array<[number, number, number]>>>();
function melodyOf(id: TrackId) {
  if (!parsed.has(id)) parsed.set(id, TRACKS[id].melody.map(parseBar));
  return parsed.get(id)!;
}

let wanted: TrackId | null = null;
let playing: TrackId | null = null;
let trackGain: GainNode | null = null;
let step = 0;
let nextTime = 0;
let timer: number | undefined;

/** Ask for a track; the same one keeps playing without a restart. null fades to silence. */
export function playMusic(id: TrackId | null) {
  wanted = id;
  if (live()) switchTrack();
}

function switchTrack() {
  if (wanted === playing || !ctx || !musicBus) return;
  const c = ctx;
  const old = trackGain;
  if (old) {
    old.gain.setTargetAtTime(0, c.currentTime, 0.25);
    setTimeout(() => old.disconnect(), 2000);
  }
  playing = wanted;
  trackGain = null;
  if (!playing) return;
  trackGain = c.createGain();
  trackGain.gain.setValueAtTime(0.0001, c.currentTime);
  trackGain.gain.setTargetAtTime(1, c.currentTime + 0.1, 0.3);
  trackGain.connect(musicBus);
  step = 0;
  nextTime = c.currentTime + 0.12;
}

function startScheduler() {
  if (timer !== undefined) return;
  timer = window.setInterval(tick, 30);
}

function tick() {
  if (!live()) return;
  if (wanted !== playing) switchTrack();
  if (!playing || !trackGain) return;
  const c = ctx!;
  // Fell far behind (a hitch or a suspended tab): pick up from now instead of rushing.
  if (nextTime < c.currentTime - 0.2) nextTime = c.currentTime + 0.05;
  while (nextTime < c.currentTime + 0.15) {
    playStep(TRACKS[playing], playing, step, nextTime, trackGain);
    nextTime += 60 / TRACKS[playing].bpm / 2;
    step++;
  }
}

function playStep(tr: Track, id: TrackId, s: number, t: number, bus: GainNode) {
  const len = 60 / tr.bpm / 2;
  const bars = tr.chords.length;
  const bar = Math.floor(s / 8) % bars;
  const i = s % 8;
  const chord = chordNotes(tr.chords[bar]);
  const root = chord[0];

  const b = tr.bass[i];
  if (b && b !== '.') {
    const n = b === 'f' ? root + 7 - 12 : b === 'o' ? root : root - 12;
    tone(hz(n), len * 0.9, { type: tr.bassType, vol: tr.bassType === 'square' ? 0.05 : 0.11 }, bus, t);
  }
  const a = tr.arp?.[i];
  if (a && a !== '.') {
    const n = a === '3' ? root + 12 : chord[Number(a)];
    tone(hz(n + 12), len * 0.8, { type: 'square', vol: 0.018 }, bus, t);
  }
  if (tr.pad && i === 0) {
    const barLen = len * 8;
    for (const n of chord) tone(hz(n + 12), barLen, { type: 'triangle', vol: 0.025, attack: 0.4 }, bus, t);
  }
  for (const [at, n, l] of melodyOf(id)[bar]) {
    if (at !== i) continue;
    tone(hz(n), len * l * 0.95, { type: tr.lead, vol: tr.leadVol, attack: 0.01 }, bus, t);
    // A faint echo an eighth later gives the lead some room.
    tone(hz(n), len * l * 0.8, { type: tr.lead, vol: tr.leadVol * 0.3, attack: 0.01, detune: 6 }, bus, t + len * 0.75);
  }
  if (tr.kick?.[i] === 'x') tone(150, 0.16, { type: 'sine', to: 40, vol: 0.14 }, bus, t);
  if (tr.snare?.[i] === 'x') {
    noise(0.12, { vol: 0.07, filter: 'highpass', freq: 1500 }, bus, t);
    tone(200, 0.06, { type: 'triangle', vol: 0.05 }, bus, t);
  }
  if (tr.hat?.[i] === 'x') noise(0.03, { vol: 0.025, filter: 'highpass', freq: 7000 }, bus, t);
}
