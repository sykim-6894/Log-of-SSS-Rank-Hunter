import { L } from './lang';
import { TOP_FLOOR } from './monsters';
import { Rng } from './rng';

/**
 * Today's Rift: a daily challenge. The calendar date picks the seed, so every floor's layout,
 * monsters and chests are the same all day, and two special rules are in force. A few tries a
 * day for the whole agency; the best score of the day counts, and beating it pays mana stones.
 * Falling is not death: the hunter is pulled out, keeps the score but loses what the run earned.
 */
export type DailyRule = 'fury' | 'iron' | 'dim' | 'horde' | 'drain' | 'sealed' | 'elite' | 'treasure' | 'haste' | 'bounty';

export const DAILY_RULES: Record<DailyRule, { name: string; text: string; good?: boolean }> = {
  fury: { name: L('광기', 'Fury'), text: L('적 공격 +25%', 'Enemy ATK +25%') },
  iron: { name: L('강철', 'Iron'), text: L('적 체력 +30%', 'Enemy HP +30%') },
  dim: { name: L('암흑', 'Gloom'), text: L('시야 -2', 'Sight -2') },
  horde: { name: L('군세', 'Horde'), text: L('적 수 +40%', 'Enemies +40%') },
  drain: { name: L('고갈', 'Drain'), text: L('체력·마나 회복 절반', 'HP and MP regen halved') },
  sealed: { name: L('봉인', 'Seal'), text: L('체력 물약을 쓸 수 없다', 'Health potions do not work') },
  elite: { name: L('정예', 'Elite'), text: L('층마다 중간보스가 꼭 나온다', 'A mid-boss on every floor') },
  treasure: { name: L('보물', 'Treasure'), text: L('층마다 상자 +2', '+2 chests per floor'), good: true },
  haste: { name: L('질풍', 'Gale'), text: L('모든 몬스터가 한 턴에 두 칸', 'Every monster moves 2 tiles a turn') },
  bounty: { name: L('현상금', 'Bounty'), text: L('처치 점수 1.5배', 'Kill points x1.5'), good: true },
};
export const DAILY_RULE_IDS = Object.keys(DAILY_RULES) as DailyRule[];

/** Floors in today's rift; the last one has a guardian by the stairs. */
export const DAILY_FLOORS = 5;
/** Tries a day for the whole agency. */
export const DAILY_TRIES = 3;
/** Points for each floor cleared. */
export const DAILY_FLOOR_POINTS = 100;
/** Clearing every floor adds a speed bonus: this many points less one per turn taken. */
export const DAILY_SPEED_BONUS = 500;
/** Mana stones for every this many points of the day's best score. */
export const DAILY_POINTS_PER_STONE = 150;
/** Extra stones for beating the agency's all-time best. */
export const DAILY_RECORD_STONES = 5;
export const BOUNTY_MULT = 1.5;
/** Daily rules are a little stronger than one abyss stack. */
export const DAILY_RULE_POWER = { fury: 1.25, iron: 1.3, dim: 2, horde: 1.4, drain: 0.5 };

/** A daily rift in progress (kept in the run's save). */
export interface DailyRun {
  date: string;
  seed: number;
  rules: DailyRule[];
  /** The tower floor the rift's first floor is as dangerous as. */
  base: number;
  /** Kill points so far. */
  points: number;
  kills: number;
  /** Floors cleared (stairs reached and taken). */
  cleared: number;
  /** Set when the hunter fell and was pulled out. */
  fell?: boolean;
}

/** What the agency remembers about the daily rift. */
export interface DailyRecord {
  /** Date of the tries counted below. */
  date: string;
  tries: number;
  /** Best score today, and who made it. */
  best: number;
  bestBy?: string;
  /** Best score ever, when and by whom. */
  ever: number;
  everDate?: string;
  everBy?: string;
  /** Tries over all days. */
  played?: number;
}

/** "2026-11-26" in the player's own time zone. */
export function todayKey(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** "11월 26일" / "Nov 26". */
export function dateLabel(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return L(`${m}월 ${d}일`, `${months[m - 1]} ${d}`);
}

/** The same number for the same date on every device. */
export function dailySeed(date: string): number {
  let h = 2166136261;
  for (const ch of `daily:${date}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Seed for one floor of the day's rift: same layout for that floor all day. */
export function floorSeed(seed: number, floor: number): number {
  return (seed ^ Math.imul(floor + 1, 0x9e3779b1)) >>> 0;
}

/** Today's two rules. At most one of them is a good one. */
export function dailyRules(date: string): DailyRule[] {
  const rng = new Rng(dailySeed(date));
  const first = rng.pick(DAILY_RULE_IDS);
  const rest = DAILY_RULE_IDS.filter((r) => r !== first && !(DAILY_RULES[first].good && DAILY_RULES[r].good));
  return [first, rng.pick(rest)];
}

/** The rift's first floor matches a tower floor a little below the hunter's best. */
export function dailyBase(bestFloor: number): number {
  return Math.max(1, Math.min(TOP_FLOOR - DAILY_FLOORS + 1, bestFloor - 3));
}

/** Score so far: kill points, floors cleared, and a speed bonus for clearing them all. */
export function dailyScore(d: DailyRun, turns: number): number {
  const speed = d.cleared >= DAILY_FLOORS ? Math.max(0, DAILY_SPEED_BONUS - turns) : 0;
  return Math.round(d.points) + d.cleared * DAILY_FLOOR_POINTS + speed;
}

/** The record for today, starting a fresh day when the date changed. */
export function dailyToday(rec: DailyRecord | undefined, date: string): DailyRecord {
  if (!rec) return { date, tries: 0, best: 0, ever: 0 };
  if (rec.date !== date) return { ...rec, date, tries: 0, best: 0, bestBy: undefined };
  return rec;
}

export function triesLeft(rec: DailyRecord | undefined, date: string): number {
  return Math.max(0, DAILY_TRIES - dailyToday(rec, date).tries);
}

/** Sets up today's rift for a hunter. */
export function makeDailyRun(date: string, bestFloor: number): DailyRun {
  return { date, seed: dailySeed(date), rules: dailyRules(date), base: dailyBase(bestFloor), points: 0, kills: 0, cleared: 0 };
}

export interface DailyResult {
  score: number;
  /** Beat today's best (the first try of a day always does, if it scored). */
  dayBest: boolean;
  /** Beat the agency's best ever. */
  record: boolean;
  /** Mana stones paid to the agency. */
  stones: number;
  previousBest: number;
}

/** Stones a score is worth. */
export function scoreStones(score: number): number {
  return Math.floor(score / DAILY_POINTS_PER_STONE);
}

/**
 * Books a finished try. Only the part of the score above today's best pays stones,
 * so trying again pays only for doing better; a new all-time best pays extra.
 */
export function settleDailyRecord(rec: DailyRecord | undefined, date: string, score: number, by: string): { record: DailyRecord; result: DailyResult } {
  const r = { ...dailyToday(rec, date) };
  const previousBest = r.best;
  const dayBest = score > r.best;
  const record = score > r.ever;
  // The very first score ever is not a "record" worth the bonus.
  const firstEver = r.ever <= 0;
  let stones = 0;
  if (dayBest) {
    stones += scoreStones(score) - scoreStones(r.best);
    r.best = score;
    r.bestBy = by;
  }
  if (record) {
    if (!firstEver) stones += DAILY_RECORD_STONES;
    r.ever = score;
    r.everDate = date;
    r.everBy = by;
  }
  return { record: r, result: { score, dayBest, record: record && !firstEver, stones, previousBest } };
}
