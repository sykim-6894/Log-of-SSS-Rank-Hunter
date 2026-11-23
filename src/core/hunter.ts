import { Bag, emptyBag, Equipment } from './items';
import { Rng } from './rng';

/** F to A come from combat power. S, SS and SSS come from the live ranking. */
export type PowerGrade = 'F' | 'E' | 'D' | 'C' | 'B' | 'A';
export type RankGrade = 'S' | 'SS' | 'SSS';
export type Grade = PowerGrade | RankGrade;

export const GRADE_ORDER: Grade[] = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];

export function gradeRank(g: Grade): number {
  return GRADE_ORDER.indexOf(g);
}

export type HunterOrigin = 'ours' | 'scouted' | 'released' | 'rival';

export interface Hunter {
  id: number;
  name: string;
  /** Where the hunter belongs now and how they got there. */
  origin: HunterOrigin;
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
  /** Consumables carried into the tower. */
  bag: Bag;
  /** One piece per slot; its bonuses are already included in the stats above. */
  gear: Equipment;
  kills: number;
  killScore: number;
  bestFloor: number;
  totalTribute: number;
  /** How many times each kind of training the agent has paid for. */
  training: Record<TrainingKind, number>;
  /** The grade the current contract was signed at. Sets the tribute rate. */
  contractGrade: Grade;
  /** Reached #1 in the ranking at least once. Always scouted on death. */
  everSSS: boolean;
  /** One-time rescues: survive a killing blow with 30% health. */
  rescues: number;
  /** Damage multiplier of the spin attack. */
  skillPower: number;
  /** For a rival hunter: the id of our hunter they shadow. */
  rivalOf?: number;
}

export type TrainingKind = 'atk' | 'def' | 'hp' | 'mp';

const NAMES = [
  '강도윤', '한서준', '윤하린', '서지호', '임채원', '오세린', '정우진', '백이안',
  '최다온', '문시우', '신유나', '권태오', '류하늘', '남궁별', '차은호', '도민아',
];

export function createHunter(rng: Rng, id: number, avoidNames: string[] = []): Hunter {
  const free = NAMES.filter((n) => !avoidNames.includes(n));
  return {
    id,
    name: rng.pick(free.length ? free : NAMES),
    origin: 'ours',
    level: 1,
    exp: 0,
    hp: 30,
    maxHp: 30,
    mp: 10,
    maxMp: 10,
    atk: 5,
    def: 2,
    gold: 20,
    bag: { ...emptyBag(), hp: 2 },
    gear: {},
    kills: 0,
    killScore: 0,
    bestFloor: 0,
    totalTribute: 0,
    training: { atk: 0, def: 0, hp: 0, mp: 0 },
    contractGrade: 'F',
    everSSS: false,
    rescues: 0,
    skillPower: 1.5,
  };
}

/** One number that sums up a hunter's strength. Decides grades A to F. */
export function combatPower(h: Pick<Hunter, 'maxHp' | 'maxMp' | 'atk' | 'def' | 'level'>): number {
  return h.maxHp + h.maxMp + (h.atk + h.def) * 5 + h.level * 20;
}

/** Lower bound of combat power for each grade, highest first. */
export const GRADE_THRESHOLDS: ReadonlyArray<[PowerGrade, number]> = [
  ['A', 2000],
  ['B', 1000],
  ['C', 500],
  ['D', 250],
  ['E', 100],
  ['F', 0],
];

export function gradeOf(power: number): PowerGrade {
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
  S: 0.2,
  SS: 0.15,
  SSS: 0.1,
};

export function powerGrade(h: Hunter): PowerGrade {
  return gradeOf(combatPower(h));
}

/** Grade for a ranking position (0-based): #1 SSS, #2-4 SS, #5-10 S. */
export function rankGradeOf(index: number): RankGrade | undefined {
  if (index === 0) return 'SSS';
  if (index < 4) return 'SS';
  if (index < 10) return 'S';
  return undefined;
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
    levelUp(h);
    gained += 1;
  }
  return gained;
}

export function levelUp(h: Hunter) {
  h.level += 1;
  h.maxHp += 5;
  h.maxMp += 2;
  h.atk += 1;
  h.def += 1;
  h.hp = h.maxHp;
  h.mp = h.maxMp;
}

export function hallOfFameScore(h: Hunter): number {
  return h.killScore + h.bestFloor * 100 + h.level * 50;
}
