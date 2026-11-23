import {
  combatPower, createHunter, Grade, gradeRank, hallOfFameScore, Hunter, levelUp, powerGrade, rankGradeOf,
  TrainingKind, TRIBUTE_RATE,
} from './hunter';
import { Rng } from './rng';

export interface Agent {
  name: string;
  gold: number;
}

/** A hunter who is gone for good: died unrescued, or was finished off. */
export interface HallOfFameEntry {
  id: number;
  name: string;
  grade: Grade;
  level: number;
  kills: number;
  bestFloor: number;
  totalTribute: number;
  score: number;
  fate: string;
}

export interface RivalAgency {
  name: string;
  /** Hunters it took from us, plus its own rival hunters. */
  roster: Hunter[];
}

/** Famous hunters of other agencies already on the association ranking. Ours must climb past them. */
export interface WorldRanker {
  id: number;
  name: string;
  agency: string;
  level: number;
  bestFloor: number;
  score: number;
}

export const SLOT_COUNT = 3;

export function worldRankers(): WorldRanker[] {
  const list: Array<[string, string, number, number, number]> = [
    ['천도결', '하늘문 길드', 42, 10, 9000],
    ['서리안', '청운 에이전시', 36, 10, 7000],
    ['마태한', '철갑 헌터스', 31, 10, 5500],
    ['연소휘', '하늘문 길드', 27, 10, 4200],
    ['구자겸', '바람결 컴퍼니', 23, 9, 3300],
    ['하은재', '청운 에이전시', 19, 8, 2600],
    ['방도철', '철갑 헌터스', 16, 7, 2000],
    ['유가람', '바람결 컴퍼니', 13, 6, 1600],
    ['진무열', '독립 헌터', 11, 5, 1300],
    ['나세아', '독립 헌터', 9, 5, 1000],
  ];
  return list.map(([name, agency, level, bestFloor, score], i) => ({ id: -1 - i, name, agency, level, bestFloor, score }));
}

/** Everything that survives between runs. */
export interface GameState {
  version: 2;
  agent: Agent;
  slots: Array<Hunter | null>;
  activeSlot: number;
  hallOfFame: HallOfFameEntry[];
  rival: RivalAgency;
  world: WorldRanker[];
  nextHunterId: number;
  /** How many hunters this agency has ever signed. */
  hunterNumber: number;
}

const AGENCY_NAMES = ['새벽 에이전시', '청람 헌터스', '북극성 매니지먼트', '흑요 에이전시', '은하 헌터 협회'];
const RIVAL_NAMES = ['적월 길드', '흑철 헌터스', '마그나 에이전시', '백야 컴퍼니'];

export function newGame(rng: Rng): GameState {
  const state: GameState = {
    version: 2,
    agent: { name: rng.pick(AGENCY_NAMES), gold: 100 },
    slots: [null, null, null],
    activeSlot: 0,
    hallOfFame: [],
    rival: { name: rng.pick(RIVAL_NAMES), roster: [] },
    world: worldRankers(),
    nextHunterId: 1,
    hunterNumber: 0,
  };
  hire(state, rng, 0);
  return state;
}

export function activeHunter(state: GameState): Hunter | undefined {
  return state.slots[state.activeSlot] ?? undefined;
}

function allNames(state: GameState): string[] {
  return [
    ...state.slots.filter((h): h is Hunter => !!h).map((h) => h.name),
    ...state.rival.roster.map((h) => h.name),
    ...state.hallOfFame.map((e) => e.name),
    ...state.world.map((w) => w.name),
  ];
}

/** Sign a new hunter into an empty slot. */
export function hire(state: GameState, rng: Rng, slot: number): Hunter | undefined {
  if (state.slots[slot]) return undefined;
  const h = createHunter(rng, state.nextHunterId++, allNames(state));
  h.contractGrade = powerGrade(h);
  state.slots[slot] = h;
  state.hunterNumber += 1;
  state.activeSlot = slot;
  return h;
}

/** Let a hunter go. They join the rival agency and may come back as an enemy. */
export function release(state: GameState, slot: number): Hunter | undefined {
  const h = state.slots[slot];
  if (!h) return undefined;
  state.slots[slot] = null;
  h.origin = 'released';
  h.hp = h.maxHp;
  h.mp = h.maxMp;
  state.rival.roster.push(h);
  pickActiveSlot(state);
  return h;
}

function pickActiveSlot(state: GameState) {
  if (state.slots[state.activeSlot]) return;
  const i = state.slots.findIndex((h) => !!h);
  state.activeSlot = i >= 0 ? i : 0;
}

// ---------- Ranking ----------

export type RankStatus = 'ours' | 'rival' | 'gone' | 'world';

export interface RankRow {
  id: number;
  name: string;
  level: number;
  bestFloor: number;
  score: number;
  status: RankStatus;
  note: string;
}

/** Live top 10 over every named hunter: ours, the rival agency's, and the fallen. */
export function ranking(state: GameState): RankRow[] {
  const rows: RankRow[] = [];
  for (const h of state.slots) {
    if (h) rows.push({ id: h.id, name: h.name, level: h.level, bestFloor: h.bestFloor, score: hallOfFameScore(h), status: 'ours', note: '우리 소속' });
  }
  for (const h of state.rival.roster) {
    const note = h.origin === 'rival' ? '라이벌' : h.origin === 'released' ? '방출 → 경쟁사' : '스카웃 → 경쟁사';
    rows.push({ id: h.id, name: h.name, level: h.level, bestFloor: h.bestFloor, score: hallOfFameScore(h), status: 'rival', note });
  }
  for (const e of state.hallOfFame) {
    rows.push({ id: e.id, name: e.name, level: e.level, bestFloor: e.bestFloor, score: e.score, status: 'gone', note: e.fate });
  }
  for (const w of state.world) {
    rows.push({ id: w.id, name: w.name, level: w.level, bestFloor: w.bestFloor, score: w.score, status: 'world', note: w.agency });
  }
  return rows.sort((a, b) => b.score - a.score || a.id - b.id).slice(0, 10);
}

/** A hunter's grade right now: S and above from the ranking, otherwise from combat power. */
export function gradeIn(state: GameState, h: Hunter): Grade {
  const i = ranking(state).findIndex((r) => r.id === h.id);
  return (i >= 0 ? rankGradeOf(i) : undefined) ?? powerGrade(h);
}

/** Marks whoever holds #1 as having been SSS. */
function markSSS(state: GameState) {
  const top = ranking(state)[0];
  if (!top) return;
  const h = [...state.slots, ...state.rival.roster].find((x) => x?.id === top.id);
  if (h) h.everSSS = true;
}

// ---------- Training and shop ----------

export const TRAINING: Record<TrainingKind, { label: string; describe: string; apply: (h: Hunter) => void }> = {
  atk: { label: '공격 훈련', describe: '공격 +1', apply: (h) => (h.atk += 1) },
  def: { label: '방어 훈련', describe: '방어 +1', apply: (h) => (h.def += 1) },
  hp: { label: '체력 훈련', describe: '최대 체력 +5', apply: (h) => { h.maxHp += 5; h.hp += 5; } },
  mp: { label: '마나 훈련', describe: '최대 마나 +3', apply: (h) => { h.maxMp += 3; h.mp += 3; } },
};

export function trainingCost(h: Hunter, kind: TrainingKind): number {
  return 20 + 15 * h.training[kind];
}

/** The agent invests in the active hunter. Paid from agent gold. */
export function train(state: GameState, kind: TrainingKind): boolean {
  const h = activeHunter(state);
  if (!h) return false;
  const cost = trainingCost(h, kind);
  if (state.agent.gold < cost) return false;
  state.agent.gold -= cost;
  h.training[kind] += 1;
  TRAINING[kind].apply(h);
  return true;
}

export const POTION_PRICE = 15;
/** Agent must hold at least this much before it helps with item purchases. */
export const SUPPORT_MIN_AGENT_GOLD = 100;
export const SUPPORT_CHANCE = 0.3;
export const SUPPORT_SHARE = 0.4;

export interface PurchaseResult {
  ok: boolean;
  hunterPaid: number;
  agentPaid: number;
}

/** The active hunter buys a potion. Sometimes the agent covers part of the price. */
export function buyPotion(state: GameState, rng: Rng): PurchaseResult {
  const { agent } = state;
  const hunter = activeHunter(state);
  if (!hunter) return { ok: false, hunterPaid: 0, agentPaid: 0 };
  let agentPaid = 0;
  if (agent.gold >= SUPPORT_MIN_AGENT_GOLD && rng.chance(SUPPORT_CHANCE)) {
    agentPaid = Math.floor(POTION_PRICE * SUPPORT_SHARE);
  }
  const hunterPaid = POTION_PRICE - agentPaid;
  if (hunter.gold < hunterPaid) return { ok: false, hunterPaid: 0, agentPaid: 0 };
  hunter.gold -= hunterPaid;
  agent.gold -= agentPaid;
  hunter.potions += 1;
  return { ok: true, hunterPaid, agentPaid };
}

// ---------- After a run ----------

/** What happened to rival hunters met in the tower. */
export interface EncounterOutcome {
  hunterId: number;
  finished: boolean;
}

export interface AfterRunNews {
  promotedFrom?: Grade;
  promotedTo?: Grade;
  signingSupport: number;
  rivalCreated?: Hunter;
  finished: string[];
  grewStronger: string[];
}

export interface ReturnResult extends AfterRunNews {
  earned: number;
  tribute: number;
  kept: number;
  rate: number;
}

/** Hunter came back alive: pay tribute under the current contract, then re-contract on promotion. */
export function settleReturn(state: GameState, rng: Rng, earned: number, encounters: EncounterOutcome[] = []): ReturnResult {
  const { agent } = state;
  const hunter = activeHunter(state)!;
  const rate = TRIBUTE_RATE[hunter.contractGrade];
  const tribute = Math.floor(earned * rate);
  agent.gold += tribute;
  hunter.gold += earned - tribute;
  hunter.totalTribute += tribute;
  hunter.hp = hunter.maxHp;
  hunter.mp = hunter.maxMp;

  const news = afterRun(state, rng, encounters);
  const result: ReturnResult = { earned, tribute, kept: earned - tribute, rate, ...news };

  const now = gradeIn(state, hunter);
  if (gradeRank(now) > gradeRank(hunter.contractGrade)) {
    result.promotedFrom = hunter.contractGrade;
    result.promotedTo = now;
    hunter.contractGrade = now;
    const support = Math.min(agent.gold, 20 * gradeRank(now));
    agent.gold -= support;
    hunter.gold += support;
    result.signingSupport = support;
  }
  return result;
}

export interface DeathResult extends AfterRunNews {
  hunter: Hunter;
  scouted: boolean;
  entry?: HallOfFameEntry;
}

export function scoutChance(grade: Grade): number {
  return Math.min(0.9, 0.4 + 0.05 * gradeRank(grade));
}

/**
 * The active hunter died. A passing rival agency may save and sign them;
 * a hunter who was ever SSS always is. Otherwise they go into the hall of fame.
 */
export function settleDeath(state: GameState, rng: Rng, killer: string, encounters: EncounterOutcome[] = []): DeathResult {
  const slot = state.activeSlot;
  const h = state.slots[slot]!;
  const grade = gradeIn(state, h);
  markSSS(state);
  const scouted = h.everSSS || rng.chance(scoutChance(grade));
  state.slots[slot] = null;
  let entry: HallOfFameEntry | undefined;
  if (scouted) {
    h.origin = 'scouted';
    h.hp = h.maxHp;
    h.mp = h.maxMp;
    state.rival.roster.push(h);
  } else {
    entry = toRecord(h, grade, `${killer}에게 사망`);
    state.hallOfFame.push(entry);
  }
  const news = afterRun(state, rng, encounters);
  if (!state.slots.some((s) => !!s)) hire(state, rng, slot);
  pickActiveSlot(state);
  return { hunter: h, scouted, entry, ...news, signingSupport: 0 };
}

function toRecord(h: Hunter, grade: Grade, fate: string): HallOfFameEntry {
  return {
    id: h.id, name: h.name, grade, level: h.level, kills: h.kills, bestFloor: h.bestFloor,
    totalTribute: h.totalTribute, score: hallOfFameScore(h), fate,
  };
}

/** Shared bookkeeping at the end of every run. */
function afterRun(state: GameState, rng: Rng, encounters: EncounterOutcome[]): AfterRunNews {
  const news: AfterRunNews = { signingSupport: 0, finished: [], grewStronger: [] };

  // Rival hunters met in the tower: finished for good, or back and stronger.
  for (const o of encounters) {
    const idx = state.rival.roster.findIndex((h) => h.id === o.hunterId);
    if (idx < 0) continue;
    const h = state.rival.roster[idx];
    if (o.finished) {
      state.rival.roster.splice(idx, 1);
      state.hallOfFame.push(toRecord(h, powerGrade(h), '우리 헌터에게 완전히 쓰러짐'));
      news.finished.push(h.name);
    } else {
      levelUp(h);
      levelUp(h);
      news.grewStronger.push(h.name);
    }
  }

  // The rival agency trains its hunters too.
  for (const h of state.rival.roster) {
    if (h.origin === 'rival') continue;
    if (rng.chance(0.5)) levelUp(h);
  }

  // Rival hunters keep pace with the hunter they shadow.
  for (const r of state.rival.roster.filter((h) => h.origin === 'rival')) {
    const target = state.slots.find((h) => h?.id === r.rivalOf);
    if (!target) continue;
    const goal = combatPower(target) * (0.92 + rng.next() * 0.16);
    for (let i = 0; i < 20 && combatPower(r) < goal; i++) levelUp(r);
    r.bestFloor = Math.max(r.bestFloor, target.bestFloor + rng.int(-1, 1));
    r.killScore = Math.max(r.killScore, Math.round(target.killScore * (0.9 + rng.next() * 0.2)));
    r.kills = Math.max(r.kills, target.kills);
  }

  // Our hunters who just reached S get a rival.
  for (const h of state.slots) {
    if (!h) continue;
    const isS = gradeRank(gradeIn(state, h)) >= gradeRank('S');
    const hasRival = state.rival.roster.some((r) => r.origin === 'rival' && r.rivalOf === h.id);
    if (isS && !hasRival && !news.rivalCreated) {
      news.rivalCreated = createRival(state, rng, h);
    }
  }

  markSSS(state);
  return news;
}

function createRival(state: GameState, rng: Rng, mine: Hunter): Hunter {
  const r = createHunter(rng, state.nextHunterId++, allNames(state));
  r.origin = 'rival';
  r.rivalOf = mine.id;
  const f = 0.95 + rng.next() * 0.1;
  r.level = mine.level;
  r.maxHp = Math.round(mine.maxHp * f);
  r.maxMp = Math.round(mine.maxMp * f);
  r.atk = Math.round(mine.atk * f);
  r.def = Math.round(mine.def * f);
  r.hp = r.maxHp;
  r.mp = r.maxMp;
  r.bestFloor = mine.bestFloor;
  r.killScore = Math.round(mine.killScore * f);
  r.kills = mine.kills;
  state.rival.roster.push(r);
  return r;
}
