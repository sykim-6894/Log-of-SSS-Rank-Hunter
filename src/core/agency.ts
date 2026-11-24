import {
  combatPower, createHunter, Grade, GRADE_A_POWER, gradeRank, hallOfFameScore, Hunter, levelUp, powerGrade, rankGradeOf,
  TrainingKind, TRIBUTE_RATE,
} from './hunter';
import { autoPick, ClassId, CLASS_IDS, classSkills, COUNTER_CLASS, SkillId, slotCount } from './classes';
import { BAG_MAX, CONSUMABLES, ConsumableKind, startingBag } from './items';
import { Gate, GATE_GRADES, GATE_SLOTS, rollGate, rollGateGrade } from './gates';
import { TOP_FLOOR } from './monsters';
import { Rng } from './rng';
import type { RunSnapshot } from './run';

export interface Agent {
  name: string;
  gold: number;
  /** False until the player names the agency on the first screen. Older saves never had this. */
  named?: boolean;
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
  /** Combat power when they fell. Older saves lack it. */
  power?: number;
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
  /** Ranking score, which is combat power. */
  score: number;
  cls?: ClassId;
}

export const SLOT_COUNT = 3;

/**
 * The association's top 10 at the start. All of them are stronger than any A grade hunter
 * (combat power 2000), so S and above have to be earned by real strength.
 */
export function worldRankers(): WorldRanker[] {
  const list: Array<[string, string, number, number, number]> = [
    ['천도결', '하늘문 길드', 72, 20, 9000],
    ['서리안', '청운 에이전시', 64, 20, 7200],
    ['마태한', '철갑 헌터스', 58, 20, 5800],
    ['연소휘', '하늘문 길드', 52, 20, 4700],
    ['구자겸', '바람결 컴퍼니', 47, 20, 3900],
    ['하은재', '청운 에이전시', 43, 19, 3300],
    ['방도철', '철갑 헌터스', 40, 18, 2900],
    ['유가람', '바람결 컴퍼니', 37, 17, 2600],
    ['진무열', '독립 헌터', 35, 16, 2350],
    ['나세아', '독립 헌터', 33, 15, 2150],
  ];
  return list.map(([name, agency, level, bestFloor, score], i) => ({
    id: -1 - i, name, agency, level, bestFloor, score, cls: CLASS_IDS[(i * 3 + 1) % CLASS_IDS.length],
  }));
}

/** Saves from before the rankers were raised hold rankers weaker than A grade: swap in the new ones. */
export function refreshWorldRankers(state: GameState) {
  if (state.world.some((w) => w.score < GRADE_A_POWER || !w.cls)) state.world = worldRankers();
}

/** Everything that survives between runs. */
export interface GameState {
  version: 3;
  agent: Agent;
  slots: Array<Hunter | null>;
  activeSlot: number;
  hallOfFame: HallOfFameEntry[];
  rival: RivalAgency;
  world: WorldRanker[];
  nextHunterId: number;
  /** How many hunters this agency has ever signed. */
  hunterNumber: number;
  /** A tower run that was still going when the game was last saved. */
  run?: { hunterId: number; data: RunSnapshot };
  /** Gates open right now. Filled in by refreshGates; older saves have none. */
  gates?: Gate[];
  /** Days passed: one for every return from the tower or a gate. */
  day?: number;
  nextGateId?: number;
}

/** Drops gates past their last day and opens new ones until there are GATE_SLOTS. */
export function refreshGates(state: GameState, rng: Rng) {
  const day = state.day ?? 0;
  const best = Math.max(1, ...state.slots.map((h) => h?.level ?? 1));
  state.gates = (state.gates ?? []).filter((g) => g.closesOn >= day);
  while (state.gates.length < GATE_SLOTS) {
    const id = state.nextGateId ?? 1;
    state.nextGateId = id + 1;
    state.gates.push(rollGate(rng, id, rollGateGrade(rng, best), day));
  }
  state.gates.sort((a, b) => GATE_GRADES.indexOf(a.grade) - GATE_GRADES.indexOf(b.grade));
}

/** Takes a gate off the board for the hunter going in. Win or lose, it is gone. */
export function enterGate(state: GameState, id: number): Gate | undefined {
  const gates = state.gates ?? [];
  const i = gates.findIndex((g) => g.id === id);
  return i < 0 ? undefined : gates.splice(i, 1)[0];
}

const AGENCY_FIRST = [
  '새벽', '청람', '북극성', '흑요', '은하', '백랑', '청룡', '주작', '현무', '태양', '월광', '천둥',
  '바람결', '별빛', '은빛', '금강', '해오름', '노을', '설화', '불꽃', '푸른달', '검은별', '한빛', '창공',
];
const AGENCY_LAST = ['에이전시', '헌터스', '매니지먼트', '컴퍼니', '길드', '헌터 협회', '기획', '엔터'];
export const AGENCY_NAME_MAX = 12;

/** A made-up agency name like "청룡 헌터스", different from any name in avoid. */
export function randomAgencyName(rng: Rng, avoid: string[] = []): string {
  for (let i = 0; i < 20; i++) {
    const name = `${rng.pick(AGENCY_FIRST)} ${rng.pick(AGENCY_LAST)}`;
    if (!avoid.includes(name)) return name;
  }
  return `${rng.pick(AGENCY_FIRST)} ${rng.pick(AGENCY_LAST)}`;
}

/** Trims spaces and cuts to the length limit. Empty means the name can't be used. */
export function cleanAgencyName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, AGENCY_NAME_MAX);
}

/** Names the agency on the first screen. The rival agency never shares the name. */
export function foundAgency(state: GameState, rng: Rng, raw: string): boolean {
  const name = cleanAgencyName(raw);
  if (!name) return false;
  state.agent.name = name;
  state.agent.named = true;
  if (state.rival.name === name) state.rival.name = rng.pick(RIVAL_NAMES.filter((n) => n !== name));
  return true;
}
const RIVAL_NAMES = ['적월 길드', '흑철 헌터스', '마그나 에이전시', '백야 컴퍼니'];

export function newGame(rng: Rng): GameState {
  const state: GameState = {
    version: 3,
    agent: { name: randomAgencyName(rng), gold: 100, named: false },
    slots: [null, null, null],
    activeSlot: 0,
    hallOfFame: [],
    rival: { name: rng.pick(RIVAL_NAMES), roster: [] },
    world: worldRankers(),
    nextHunterId: 1,
    hunterNumber: 0,
  };
  hire(state, rng, 0);
  refreshGates(state, rng);
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
export function hire(state: GameState, rng: Rng, slot: number, cls?: ClassId, firstSkill?: SkillId): Hunter | undefined {
  if (state.slots[slot]) return undefined;
  const h = createHunter(rng, state.nextHunterId++, allNames(state), cls, firstSkill);
  h.contractGrade = powerGrade(h);
  state.slots[slot] = h;
  state.hunterNumber += 1;
  state.activeSlot = slot;
  return h;
}

/** A hunter who has done nothing yet: hired automatically, never trained, never in the tower. */
export function untouched(h: Hunter): boolean {
  const trained = Object.values(h.training).some((n) => n > 0);
  return h.level === 1 && h.exp === 0 && h.bestFloor === 0 && h.kills === 0 && !trained && Object.keys(h.gear).length === 0;
}

/** Re-sign an untouched hunter in another class. Name and number stay. */
export function changeClass(state: GameState, rng: Rng, slot: number, cls: ClassId, firstSkill: SkillId): Hunter | undefined {
  const old = state.slots[slot];
  if (!old || !untouched(old)) return undefined;
  const h = createHunter(rng, old.id, [], cls, firstSkill);
  h.name = old.name;
  h.bag = old.bag;
  h.gold = old.gold;
  h.contractGrade = powerGrade(h);
  state.slots[slot] = h;
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
  cls?: ClassId;
}

/** Live top 10 by combat power over every named hunter: ours, the rival agency's, the fallen, the rankers. */
export function ranking(state: GameState): RankRow[] {
  const rows: RankRow[] = [];
  for (const h of state.slots) {
    if (h) rows.push({ id: h.id, name: h.name, level: h.level, bestFloor: h.bestFloor, score: combatPower(h), status: 'ours', note: '우리 소속', cls: h.cls });
  }
  for (const h of state.rival.roster) {
    const note = h.origin === 'rival' ? '라이벌' : h.origin === 'released' ? '방출 → 경쟁사' : '스카웃 → 경쟁사';
    rows.push({ id: h.id, name: h.name, level: h.level, bestFloor: h.bestFloor, score: combatPower(h), status: 'rival', note, cls: h.cls });
  }
  for (const e of state.hallOfFame) {
    rows.push({ id: e.id, name: e.name, level: e.level, bestFloor: e.bestFloor, score: e.power ?? estimatePower(e.level), status: 'gone', note: e.fate });
  }
  for (const w of state.world) {
    rows.push({ id: w.id, name: w.name, level: w.level, bestFloor: w.bestFloor, score: w.score, status: 'world', note: w.agency, cls: w.cls });
  }
  return rows.sort((a, b) => b.score - a.score || a.id - b.id).slice(0, 10);
}

/** Rough combat power of an old record that did not store it: a fresh hunter plus level-ups. */
function estimatePower(level: number): number {
  return 95 + 37 * (level - 1);
}

/** A hunter's grade right now: S and above from the ranking, otherwise from combat power. */
export function gradeIn(state: GameState, h: Hunter): Grade {
  const i = ranking(state).findIndex((r) => r.id === h.id);
  return (i >= 0 ? rankGradeOf(i) : undefined) ?? powerGrade(h);
}

/** Floors cleared are skippable in steps of five: a run may start right after any boss already beaten. */
export const SKIP_STEP = 5;

/** Floors this hunter may start a run on: 1, then 6, 11, 16 once they have reached that floor before. */
export function startFloors(_state: GameState, h: Hunter): number[] {
  const floors = [1];
  for (let f = SKIP_STEP + 1; f <= h.bestFloor; f += SKIP_STEP) floors.push(f);
  return floors;
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
export function buyItem(state: GameState, rng: Rng, kind: ConsumableKind): PurchaseResult {
  const { agent } = state;
  const hunter = activeHunter(state);
  const price = CONSUMABLES[kind].price;
  const fail = { ok: false, hunterPaid: 0, agentPaid: 0 };
  if (!hunter || price === undefined || hunter.bag[kind] >= BAG_MAX) return fail;
  let agentPaid = 0;
  if (agent.gold >= SUPPORT_MIN_AGENT_GOLD && rng.chance(SUPPORT_CHANCE)) {
    agentPaid = Math.floor(price * SUPPORT_SHARE);
  }
  const hunterPaid = price - agentPaid;
  if (hunter.gold < hunterPaid) return fail;
  hunter.gold -= hunterPaid;
  agent.gold -= agentPaid;
  hunter.bag[kind] += 1;
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
  // Potions and scrolls don't come home: the bag goes back to one health potion.
  hunter.bag = startingBag();

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
    totalTribute: h.totalTribute, score: hallOfFameScore(h), power: combatPower(h), fate,
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

  // Hunters nobody plays pick their own level-up cards.
  for (const h of state.rival.roster) autoPick(h, rng);

  // Rival hunters keep pace with the hunter they shadow.
  for (const r of state.rival.roster.filter((h) => h.origin === 'rival')) {
    const target = state.slots.find((h) => h?.id === r.rivalOf);
    if (!target) continue;
    const goal = combatPower(target) * (0.92 + rng.next() * 0.16);
    for (let i = 0; i < 20 && combatPower(r) < goal; i++) levelUp(r);
    r.bestFloor = Math.min(TOP_FLOOR, Math.max(r.bestFloor, target.bestFloor + rng.int(-1, 1)));
    r.killScore = Math.max(r.killScore, Math.round(target.killScore * (0.9 + rng.next() * 0.2)));
    r.kills = Math.max(r.kills, target.kills);
    autoPick(r, rng);
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
  state.day = (state.day ?? 0) + 1;
  refreshGates(state, rng);
  return news;
}

function createRival(state: GameState, rng: Rng, mine: Hunter): Hunter {
  const cls = COUNTER_CLASS[mine.cls];
  const r = createHunter(rng, state.nextHunterId++, allNames(state), cls);
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
  // As many skills as ours, upgraded about as far.
  const pool = classSkills(cls);
  r.skills = pool.slice(0, slotCount(r.level)).map((id, i) => ({ id, lv: mine.skills[i]?.lv ?? 1 }));
  state.rival.roster.push(r);
  return r;
}
