import { createHunter, Grade, GRADE_THRESHOLDS, gradeOf, combatPower, Hunter, hallOfFameScore, TrainingKind, TRIBUTE_RATE } from './hunter';
import { Rng } from './rng';

export interface Agent {
  name: string;
  gold: number;
}

export interface HallOfFameEntry {
  name: string;
  grade: Grade;
  level: number;
  kills: number;
  bestFloor: number;
  totalTribute: number;
  score: number;
  fate: string;
}

/** Everything that survives between runs. */
export interface GameState {
  version: 1;
  agent: Agent;
  hunter: Hunter;
  /** The grade the current contract was signed at. Sets the tribute rate. */
  contractGrade: Grade;
  hallOfFame: HallOfFameEntry[];
  hunterNumber: number;
}

const AGENCY_NAMES = ['새벽 에이전시', '청람 헌터스', '북극성 매니지먼트', '흑요 에이전시', '은하 헌터 협회'];

export function newGame(rng: Rng): GameState {
  const hunter = createHunter(rng);
  return {
    version: 1,
    agent: { name: rng.pick(AGENCY_NAMES), gold: 100 },
    hunter,
    contractGrade: gradeOf(combatPower(hunter)),
    hallOfFame: [],
    hunterNumber: 1,
  };
}

export const TRAINING: Record<TrainingKind, { label: string; describe: string; apply: (h: Hunter) => void }> = {
  atk: { label: '공격 훈련', describe: '공격 +1', apply: (h) => (h.atk += 1) },
  def: { label: '방어 훈련', describe: '방어 +1', apply: (h) => (h.def += 1) },
  hp: { label: '체력 훈련', describe: '최대 체력 +5', apply: (h) => { h.maxHp += 5; h.hp += 5; } },
  mp: { label: '마나 훈련', describe: '최대 마나 +3', apply: (h) => { h.maxMp += 3; h.mp += 3; } },
};

export function trainingCost(h: Hunter, kind: TrainingKind): number {
  return 20 + 15 * h.training[kind];
}

/** The agent invests in the hunter. Paid from agent gold. */
export function train(state: GameState, kind: TrainingKind): boolean {
  const cost = trainingCost(state.hunter, kind);
  if (state.agent.gold < cost) return false;
  state.agent.gold -= cost;
  state.hunter.training[kind] += 1;
  TRAINING[kind].apply(state.hunter);
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

/** Hunter buys a potion. Sometimes the agent covers part of the price. */
export function buyPotion(state: GameState, rng: Rng): PurchaseResult {
  const { agent, hunter } = state;
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

export interface ReturnResult {
  earned: number;
  tribute: number;
  kept: number;
  rate: number;
  promotedFrom?: Grade;
  promotedTo?: Grade;
  /** Gold the agent gave the hunter for items when renewing the contract. */
  signingSupport: number;
}

const GRADE_ORDER: Grade[] = GRADE_THRESHOLDS.map(([g]) => g).reverse(); // F..A

export function gradeRank(g: Grade): number {
  return GRADE_ORDER.indexOf(g);
}

/** Hunter came back alive: pay tribute under the current contract, then re-contract on promotion. */
export function settleReturn(state: GameState, earned: number): ReturnResult {
  const { agent, hunter } = state;
  const rate = TRIBUTE_RATE[state.contractGrade];
  const tribute = Math.floor(earned * rate);
  agent.gold += tribute;
  hunter.gold += earned - tribute;
  hunter.totalTribute += tribute;
  hunter.hp = hunter.maxHp;
  hunter.mp = hunter.maxMp;

  const result: ReturnResult = { earned, tribute, kept: earned - tribute, rate, signingSupport: 0 };
  const now = gradeOf(combatPower(hunter));
  if (gradeRank(now) > gradeRank(state.contractGrade)) {
    result.promotedFrom = state.contractGrade;
    result.promotedTo = now;
    state.contractGrade = now;
    const support = Math.min(agent.gold, 20 * gradeRank(now));
    agent.gold -= support;
    hunter.gold += support;
    result.signingSupport = support;
  }
  return result;
}

/** Hunter died: record them in the hall of fame and hire a fresh hunter. */
export function recordDeath(state: GameState, rng: Rng, killer: string): HallOfFameEntry {
  const h = state.hunter;
  const entry: HallOfFameEntry = {
    name: h.name,
    grade: gradeOf(combatPower(h)),
    level: h.level,
    kills: h.kills,
    bestFloor: h.bestFloor,
    totalTribute: h.totalTribute,
    score: hallOfFameScore(h),
    fate: `${killer}에게 사망`,
  };
  state.hallOfFame = [...state.hallOfFame, entry].sort((a, b) => b.score - a.score).slice(0, 10);
  state.hunter = createHunter(rng);
  state.contractGrade = gradeOf(combatPower(state.hunter));
  state.hunterNumber += 1;
  return entry;
}
