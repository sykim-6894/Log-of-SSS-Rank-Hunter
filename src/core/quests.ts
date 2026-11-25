import { L } from './lang';
import { floorScale, MONSTERS, monsterPool, TOP_FLOOR } from './monsters';
import { Rng } from './rng';

/**
 * The Hunter Association's quest board. Three quests are posted at a time, each open for a few days.
 * Progress counts only for hunters who come home (a death brings nothing back), and builds up across runs.
 * A finished quest pays the agency gold, mana stones and agency experience, and a new one is posted.
 */
export type QuestKind = 'hunt' | 'floor' | 'boss' | 'elite' | 'gate' | 'arena' | 'earn';

export interface Quest {
  id: number;
  kind: QuestKind;
  /** Monster id for a hunt. */
  target?: string;
  need: number;
  have: number;
  /** Last day the quest is open. */
  until: number;
  gold: number;
  stones: number;
  exp: number;
}

export interface QuestBoard {
  list: Quest[];
  nextId: number;
  /** Quests finished so far. */
  done: number;
}

/** What a hunter brought home from one run, as far as quests care. */
export interface RunReport {
  /** Kills by monster id, plus 'boss' and 'elite'. */
  kills: Record<string, number>;
  /** Highest tower floor reached (0 outside the tower). */
  floor: number;
  /** A gate was cleared. */
  gate?: boolean;
  /** Survival arena waves cleared. */
  waves?: number;
  /** Gold earned this run. */
  gold: number;
}

/** What the board knows about the agency when it posts a quest. */
export interface QuestContext {
  day: number;
  /** Highest level among our hunters. */
  level: number;
  /** Highest floor any of our hunters has reached. */
  bestFloor: number;
  arenaBest: number;
  gates: boolean;
  arena: boolean;
}

export const QUEST_SLOTS = 3;
/** Days a quest stays on the board, counting the day it is posted. */
export const QUEST_DAYS = 3;

const WEIGHT: Record<QuestKind, number> = { hunt: 1, floor: 1, elite: 1.2, earn: 1.2, boss: 1.5, gate: 1.5, arena: 1.5 };

function huntTarget(id: string): string {
  return id.replace(/^elite-/, '');
}

export function questText(q: Quest): string {
  switch (q.kind) {
    case 'hunt': {
      const name = MONSTERS[q.target ?? '']?.name ?? q.target ?? '';
      return L(`${name} ${q.need}마리 처치`, `Defeat ${q.need} ${name}`);
    }
    case 'floor':
      return q.need > TOP_FLOOR
        ? L(`심연 ${q.need - TOP_FLOOR}층 도달`, `Reach Abyss ${q.need - TOP_FLOOR}`)
        : L(`성장의 탑 ${q.need}층 도달`, `Reach floor ${q.need} of the Tower`);
    case 'boss':
      return L(`보스 ${q.need}마리 처치 (탑·게이트)`, `Defeat ${q.need} boss${q.need > 1 ? 'es' : ''} (tower or gate)`);
    case 'elite':
      return L(`중간보스 ${q.need}마리 처치`, `Defeat ${q.need} mid-bosses`);
    case 'gate':
      return L(`게이트 ${q.need}곳 클리어`, `Clear ${q.need} gate${q.need > 1 ? 's' : ''}`);
    case 'arena':
      return L(`생존 아레나 ${q.need}웨이브 돌파`, `Clear ${q.need} waves in the Survival Arena`);
    case 'earn':
      return L(`기간 안에 ${q.need}G 벌어오기`, `Bring home ${q.need}G in total`);
  }
}

export function questReward(q: Quest): string {
  return L(`${q.gold}G · 마력석 ${q.stones} · 경험치 ${q.exp}`, `${q.gold}G · ${q.stones} stones · ${q.exp} EXP`);
}

/** Days left including today, at least 1 while the quest is open. */
export function daysLeft(q: Quest, day: number): number {
  return Math.max(0, q.until - day + 1);
}

/** Posts one new quest of a kind not already on the board. */
export function rollQuest(rng: Rng, id: number, ctx: QuestContext, taken: QuestKind[] = []): Quest {
  const kinds: QuestKind[] = ['hunt', 'hunt', 'floor', 'earn', 'elite'];
  if (ctx.bestFloor >= 4) kinds.push('boss');
  if (ctx.gates) kinds.push('gate');
  if (ctx.arena) kinds.push('arena');
  const open = kinds.filter((k) => !taken.includes(k));
  const kind = rng.pick(open.length ? open : kinds);
  const f = Math.max(1, Math.min(TOP_FLOOR, ctx.bestFloor));
  let need = 1;
  let target: string | undefined;
  if (kind === 'hunt') {
    const pool = monsterPool(Math.max(1, f - rng.int(0, 2)));
    target = rng.pick(pool).id;
    need = rng.int(6, 10);
  } else if (kind === 'floor') {
    need = Math.max(3, ctx.bestFloor);
  } else if (kind === 'elite') {
    need = 2;
  } else if (kind === 'arena') {
    need = Math.max(5, Math.round(ctx.arenaBest * 0.8));
  } else if (kind === 'earn') {
    need = Math.round((50 * (f + 3) * floorScale(f)) / 10) * 10;
  }
  const base = (30 + 8 * ctx.level) * WEIGHT[kind];
  return {
    id, kind, target, need, have: 0, until: ctx.day + QUEST_DAYS - 1,
    gold: Math.round(base / 5) * 5,
    stones: WEIGHT[kind] >= 1.5 ? 2 : 1,
    exp: Math.round(base / 5) * 5,
  };
}

/** Drops finished and expired quests and posts new ones until the board is full. */
export function refreshBoard(board: QuestBoard, rng: Rng, ctx: QuestContext) {
  board.list = board.list.filter((q) => q.have < q.need && q.until >= ctx.day);
  while (board.list.length < QUEST_SLOTS) {
    board.list.push(rollQuest(rng, board.nextId++, ctx, board.list.map((q) => q.kind)));
  }
}

/** How far one run moves a quest. */
function progress(q: Quest, r: RunReport): number {
  switch (q.kind) {
    case 'hunt':
      return Object.entries(r.kills).filter(([id]) => huntTarget(id) === q.target).reduce((a, [, n]) => a + n, 0);
    case 'floor':
      return r.floor >= q.need ? q.need : 0;
    case 'boss':
      return r.kills.boss ?? 0;
    case 'elite':
      return r.kills.elite ?? 0;
    case 'gate':
      return r.gate ? 1 : 0;
    case 'arena':
      return (r.waves ?? 0) >= q.need ? q.need : 0;
    case 'earn':
      return r.gold;
  }
}

/** Counts a run toward the open quests. Returns the ones it finished (still on the board until refreshed). */
export function applyReport(board: QuestBoard, r: RunReport, day: number): Quest[] {
  const finished: Quest[] = [];
  for (const q of board.list) {
    if (q.have >= q.need || q.until < day) continue;
    q.have = Math.min(q.need, q.have + progress(q, r));
    if (q.have >= q.need) {
      finished.push(q);
      board.done += 1;
    }
  }
  return finished;
}
