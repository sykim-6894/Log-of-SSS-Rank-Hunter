import type { GameState } from './agency';
import { agencyLevel } from './agencyLevel';
import { DailyRecord } from './daily';
import { gradeRank, powerGrade, Grade } from './hunter';
import { L } from './lang';
import { TOP_FLOOR } from './monsters';

/**
 * The monster codex and the agency's achievements.
 * A monster kind is written into the codex the first time one of our hunters kills it, in the
 * tower, a gate, the arena or today's rift, and its kills keep counting. Achievements are
 * checked whenever the office opens; each pays a small reward once and gives a title the
 * agency can wear.
 */
export interface CodexEntry {
  kills: number;
  /** In-game day of the first kill. */
  day: number;
}

export interface Achievements {
  done: string[];
  /** The title worn, by achievement id. */
  title?: string;
}

/** Kinds in the codex, in the order they show: ordinary monsters by floor, then the bosses. */
export const CODEX_IDS = ['goblin', 'wolf', 'archer', 'orc', 'bomber', 'lizard', 'knight', 'shaman', 'beast', 'warden', 'overlord', 'dragon', 'master'];

/** "elite-orc" → "orc". Kinds that are not codex monsters (rival hunters, rankers) give undefined. */
export function codexId(kindId: string): string | undefined {
  const id = kindId.startsWith('elite-') ? kindId.slice(6) : kindId;
  return CODEX_IDS.includes(id) ? id : undefined;
}

/** Floors of the tower where a kind turns up, as "1~8층" / "1-8F". */
export function codexWhere(id: string): string {
  const boss = { warden: 5, overlord: 10, dragon: 15, master: 20 }[id];
  if (boss) return L(`${boss}층 보스`, `${boss}F boss`);
  const ranges: Record<string, [number, number]> = {
    goblin: [1, 5], wolf: [1, 8], archer: [2, 8], orc: [3, 11], bomber: [4, TOP_FLOOR], lizard: [6, 15], knight: [9, TOP_FLOOR], shaman: [9, TOP_FLOOR], beast: [12, TOP_FLOOR],
  };
  const [a, b] = ranges[id] ?? [1, TOP_FLOOR];
  return L(`${a}~${b}층`, `${a}-${b}F`);
}

/** Writes a run's kills into the codex. Returns the kinds seen for the first time. */
export function recordKills(state: GameState, tally: Record<string, number>): string[] {
  const codex = (state.codex ??= {});
  const fresh: string[] = [];
  for (const [key, n] of Object.entries(tally)) {
    const id = codexId(key);
    if (!id || n <= 0) continue;
    if (!codex[id]) {
      codex[id] = { kills: 0, day: state.day ?? 0 };
      fresh.push(id);
    }
    codex[id].kills += n;
  }
  return fresh;
}

export function codexCount(state: GameState): number {
  return CODEX_IDS.filter((id) => state.codex?.[id]).length;
}

export function codexKills(state: GameState): number {
  return Object.values(state.codex ?? {}).reduce((a, e) => a + e.kills, 0);
}

export interface Achievement {
  id: string;
  name: string;
  /** What it takes. */
  text: string;
  /** The title it gives. */
  title: string;
  stones: number;
  gold: number;
  /** Progress toward it: have and need. */
  progress: (s: GameState) => [number, number];
}

/** How the hall of fame marks rival hunters we finished off (in either language). */
const FINISHED_FATES = ['우리 헌터에게 완전히 쓰러짐', 'Finished off by our hunter'];

/** Our hunters, alive or in the hall of fame. Rival hunters we finished off are left out. */
function ours(state: GameState) {
  return {
    hunters: state.slots.filter((h) => !!h).map((h) => h!),
    records: state.hallOfFame.filter((e) => !FINISHED_FATES.includes(e.fate)),
  };
}

/** Highest grade any of our hunters reached: SSS counts for anyone who was ever #1. */
function bestGrade(state: GameState): number {
  const o = ours(state);
  const grades: Grade[] = [
    ...o.hunters.map((h) => (h.everSSS ? 'SSS' : h.contractGrade)),
    ...o.records.map((e) => (e.legend ? 'SSS' : e.grade)),
  ];
  // Live hunters may have outgrown their contract.
  for (const h of o.hunters) grades.push(powerGrade(h));
  return Math.max(0, ...grades.map(gradeRank));
}

function bestOf(state: GameState, key: 'bestFloor' | 'abyssBest' | 'arenaBest'): number {
  const o = ours(state);
  return Math.max(0, ...o.hunters.map((h) => h[key] ?? 0), ...o.records.map((e) => e[key] ?? 0));
}

const daily = (s: GameState): DailyRecord | undefined => s.daily;

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'kill1', name: L('첫 사냥', 'First Hunt'), text: L('몬스터 1마리 처치', 'Defeat a monster'), title: L('새내기 에이전시', 'Rookie Agency'), stones: 1, gold: 30, progress: (s) => [codexKills(s), 1] },
  { id: 'kill100', name: L('사냥꾼의 길', 'Way of the Hunter'), text: L('몬스터 100마리 처치', 'Defeat 100 monsters'), title: L('사냥꾼들', 'The Hunters'), stones: 3, gold: 150, progress: (s) => [codexKills(s), 100] },
  { id: 'kill1000', name: L('천 마리의 증인', 'A Thousand Down'), text: L('몬스터 1000마리 처치', 'Defeat 1000 monsters'), title: L('게이트 청소부', 'Gate Sweepers'), stones: 10, gold: 600, progress: (s) => [codexKills(s), 1000] },
  { id: 'codex6', name: L('도감 반', 'Half the Codex'), text: L('도감 6종 등록', 'Fill 6 codex pages'), title: L('몬스터 연구회', 'Monster Society'), stones: 3, gold: 100, progress: (s) => [codexCount(s), 6] },
  { id: 'codex12', name: L('도감 완성', 'Codex Complete'), text: L(`도감 ${CODEX_IDS.length}종 모두 등록`, `Fill all ${CODEX_IDS.length} codex pages`), title: L('이계 박물학자', 'Otherworld Naturalists'), stones: 10, gold: 500, progress: (s) => [codexCount(s), CODEX_IDS.length] },
  { id: 'floor10', name: L('탑의 중턱', 'Halfway Up'), text: L('성장의 탑 10층 도달', 'Reach Tower 10F'), title: L('중턱의 개척자', 'Midway Pioneers'), stones: 3, gold: 150, progress: (s) => [Math.min(10, bestOf(s, 'bestFloor')), 10] },
  { id: 'floor20', name: L('탑의 정상', 'Top of the Tower'), text: L(`성장의 탑 ${TOP_FLOOR}층 도달`, `Reach Tower ${TOP_FLOOR}F`), title: L('정상에 선 자들', 'Summiteers'), stones: 6, gold: 400, progress: (s) => [Math.min(TOP_FLOOR, bestOf(s, 'bestFloor')), TOP_FLOOR] },
  { id: 'abyss10', name: L('심연 10층', 'Abyss 10F'), text: L('심연 10층 도달', 'Reach Abyss 10F'), title: L('심연을 걷는 자', 'Abyss Walkers'), stones: 8, gold: 500, progress: (s) => [Math.min(10, bestOf(s, 'abyssBest')), 10] },
  { id: 'abyss30', name: L('심연 30층', 'Abyss 30F'), text: L('심연 30층 도달', 'Reach Abyss 30F'), title: L('끝없는 어둠', 'Endless Dark'), stones: 15, gold: 1000, progress: (s) => [Math.min(30, bestOf(s, 'abyssBest')), 30] },
  { id: 'arena10', name: L('아레나 10웨이브', 'Arena Wave 10'), text: L('생존 아레나 10웨이브 돌파', 'Clear 10 arena waves'), title: L('투기장의 별', 'Arena Stars'), stones: 5, gold: 300, progress: (s) => [Math.min(10, bestOf(s, 'arenaBest')), 10] },
  { id: 'gates10', name: L('게이트 사냥꾼', 'Gate Hunters'), text: L('게이트 10번 클리어', 'Clear 10 gates'), title: L('게이트 브레이커', 'Gate Breakers'), stones: 5, gold: 300, progress: (s) => [Math.min(10, s.gateRecord?.ours ?? 0), 10] },
  { id: 'gradeS', name: L('S급 배출', 'An S-Rank'), text: L('S급 헌터 배출', 'Raise an S-Rank hunter'), title: L('명문 에이전시', 'Prestigious Agency'), stones: 5, gold: 300, progress: (s) => [bestGrade(s) >= gradeRank('S') ? 1 : 0, 1] },
  { id: 'gradeSSS', name: L('그래, 너였구나', 'So It Was You'), text: L('SSS급 헌터 배출', 'Raise an SSS-Rank hunter'), title: L('주인공의 에이전시', "The Protagonist's Agency"), stones: 20, gold: 2000, progress: (s) => [bestGrade(s) >= gradeRank('SSS') ? 1 : 0, 1] },
  { id: 'agency8', name: L('최고의 에이전시', 'Top Agency'), text: L('에이전시 Lv.8', 'Reach agency Lv.8'), title: L('업계 1위', 'Industry Leaders'), stones: 10, gold: 0, progress: (s) => [agencyLevel(s.agent), 8] },
  { id: 'legend', name: L('전설의 은퇴', 'Legendary Retirement'), text: L('SSS급 헌터 은퇴', 'Retire an SSS-Rank hunter'), title: L('전설을 키운 곳', 'Home of Legends'), stones: 10, gold: 0, progress: (s) => [s.hallOfFame.some((e) => e.retired && e.legend) ? 1 : 0, 1] },
  { id: 'daily1', name: L('균열 탐험가', 'Rift Explorer'), text: L('오늘의 균열 첫 도전', "Try Today's Rift"), title: L('균열 탐험대', 'Rift Explorers'), stones: 1, gold: 50, progress: (s) => [Math.min(1, daily(s)?.played ?? 0), 1] },
  { id: 'daily1000', name: L('균열 정복자', 'Rift Conqueror'), text: L('오늘의 균열 1000점', "Score 1000 in Today's Rift"), title: L('균열의 지배자', 'Rift Masters'), stones: 5, gold: 300, progress: (s) => [Math.min(1000, daily(s)?.ever ?? 0), 1000] },
];

export function achievement(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

export function isDone(state: GameState, id: string): boolean {
  return !!state.achievements?.done.includes(id);
}

/**
 * Marks every achievement now reached, pays its reward to the agency, and returns them.
 * Each is paid only once.
 */
export function checkAchievements(state: GameState): Achievement[] {
  const ach = (state.achievements ??= { done: [] });
  const fresh: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (ach.done.includes(a.id)) continue;
    const [have, need] = a.progress(state);
    if (have < need) continue;
    ach.done.push(a.id);
    state.agent.stones = (state.agent.stones ?? 0) + a.stones;
    state.agent.gold += a.gold;
    fresh.push(a);
  }
  return fresh;
}

/** Wears a title from a finished achievement, or takes the title off with undefined. */
export function wearTitle(state: GameState, id: string | undefined): boolean {
  if (id !== undefined && !isDone(state, id)) return false;
  (state.achievements ??= { done: [] }).title = id;
  return true;
}

/** The title the agency wears, if any. */
export function wornTitle(state: GameState): string | undefined {
  const id = state.achievements?.title;
  return id ? achievement(id)?.title : undefined;
}

export function rewardText(a: Achievement): string {
  const parts: string[] = [];
  if (a.stones) parts.push(L(`마력석 ${a.stones}`, `${a.stones} stones`));
  if (a.gold) parts.push(`${a.gold}G`);
  return parts.join(' · ');
}
