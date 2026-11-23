import { Rng } from './rng';

export type Grade = 'F' | 'E' | 'D' | 'C' | 'B' | 'A';

export interface Hunter {
  name: string;
  level: number;
  exp: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  atk: number;
  def: number;
  /** The hunter's own wallet, used for items. */
  gold: number;
  potions: number;
  kills: number;
  killScore: number;
  bestFloor: number;
  totalTribute: number;
  /** How many times each kind of training the agent has paid for. */
  training: Record<TrainingKind, number>;
}

export type TrainingKind = 'atk' | 'def' | 'hp' | 'mp';

const NAMES = [
  '강도윤', '한서준', '윤하린', '서지호', '임채원', '오세린', '정우진', '백이안',
  '최다온', '문시우', '신유나', '권태오', '류하늘', '남궁별', '차은호', '도민아',
];

export function createHunter(rng: Rng): Hunter {
  return {
    name: rng.pick(NAMES),
    level: 1,
    exp: 0,
    hp: 30,
    maxHp: 30,
    mp: 10,
    maxMp: 10,
    atk: 5,
    def: 2,
    gold: 20,
    potions: 2,
    kills: 0,
    killScore: 0,
    bestFloor: 0,
    totalTribute: 0,
    training: { atk: 0, def: 0, hp: 0, mp: 0 },
  };
}

/** One number that sums up a hunter's strength. Decides grades A to F. */
export function combatPower(h: Pick<Hunter, 'maxHp' | 'maxMp' | 'atk' | 'def' | 'level'>): number {
  return h.maxHp + h.maxMp + (h.atk + h.def) * 5 + h.level * 20;
}

/** Lower bound of combat power for each grade, highest first. */
export const GRADE_THRESHOLDS: ReadonlyArray<[Grade, number]> = [
  ['A', 2000],
  ['B', 1000],
  ['C', 500],
  ['D', 250],
  ['E', 100],
  ['F', 0],
];

export function gradeOf(power: number): Grade {
  for (const [grade, min] of GRADE_THRESHOLDS) {
    if (power >= min) return grade;
  }
  return 'F';
}

/** Share of run earnings paid to the agent. Falls as the grade rises. */
export const TRIBUTE_RATE: Record<Grade, number> = {
  F: 0.5,
  E: 0.45,
  D: 0.4,
  C: 0.35,
  B: 0.3,
  A: 0.25,
};

export function hunterGrade(h: Hunter): Grade {
  return gradeOf(combatPower(h));
}

export function expToNext(level: number): number {
  return 20 * level;
}

/** Adds experience and applies level ups. Returns how many levels were gained. */
export function gainExp(h: Hunter, amount: number): number {
  h.exp += amount;
  let gained = 0;
  while (h.exp >= expToNext(h.level)) {
    h.exp -= expToNext(h.level);
    h.level += 1;
    h.maxHp += 5;
    h.maxMp += 2;
    h.atk += 1;
    h.def += 1;
    h.hp = h.maxHp;
    h.mp = h.maxMp;
    gained += 1;
  }
  return gained;
}

export function hallOfFameScore(h: Hunter): number {
  return h.killScore + h.bestFloor * 100 + h.level * 50;
}
