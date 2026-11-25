import { ClassId, CLASS_IDS, CLASSES, classSkills, LevelCard, OwnedSkill, SkillId } from './classes';
import { Bag, Equipment, startingBag } from './items';
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
  /** Deepest floor of the abyss above floor 20 reached, counted from 1. */
  abyssBest?: number;
  /** Most survival-arena waves cleared. */
  arenaBest?: number;
  /** Day of the last survival-arena entry: once a day. */
  arenaDay?: number;
  /** Gold this hunter put into the agency. Lowers their cut. */
  invested?: number;
  /** Day this hunter was sent on a dispatch. They come back at the next return. */
  dispatchDay?: number;
  /** A scout-center hire's gift. */
  talent?: string;
  /** Association rankers (by id) this hunter has beaten in a challenge. */
  beaten?: number[];
  /** Day of the last ranker challenge: one a day. */
  duelDay?: number;
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
  /** Times this enemy hunter was beaten and let go for a reward. Each makes them much stronger. */
  spared?: number;
  /** Which pixel figure to draw. Always the class's look. */
  look?: number;
  /** Class, chosen at hiring. Fixed for life. */
  cls: ClassId;
  /** Skills in their slots, in order. At most slotCount(level). */
  skills: OwnedSkill[];
  /** Level-up cards still to pick. */
  picks: number;
  /** Health and mana won back each turn in a run. Grows a little every level. */
  hpRegen: number;
  mpRegen: number;
  /** The three cards on offer for the next pick, once rolled. */
  cards?: LevelCard[];
}

export type TrainingKind = 'atk' | 'def' | 'hp' | 'mp';

const NAMES = [
  '강도윤', '한서준', '윤하린', '서지호', '임채원', '오세린', '정우진', '백이안',
  '최다온', '문시우', '신유나', '권태오', '류하늘', '남궁별', '차은호', '도민아',
];

export function createHunter(
  rng: Rng,
  id: number,
  avoidNames: string[] = [],
  cls: ClassId = rng.pick(CLASS_IDS),
  firstSkill: SkillId = classSkills(cls)[0],
): Hunter {
  const free = NAMES.filter((n) => !avoidNames.includes(n));
  const c = CLASSES[cls];
  return {
    id,
    name: rng.pick(free.length ? free : NAMES),
    origin: 'ours',
    level: 1,
    exp: 0,
    hp: c.base.hp,
    maxHp: c.base.hp,
    mp: c.base.mp,
    maxMp: c.base.mp,
    atk: c.base.atk,
    def: c.base.def,
    gold: 20,
    bag: startingBag(),
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
    look: c.look,
    cls,
    skills: [{ id: firstSkill, lv: 1 }],
    picks: 0,
    hpRegen: c.regen.hp,
    mpRegen: c.regen.mp,
  };
}

/** One number that sums up a hunter's strength. Decides grades A to F. */
export function combatPower(h: Pick<Hunter, 'maxHp' | 'maxMp' | 'atk' | 'def' | 'level'>): number {
  return h.maxHp + h.maxMp + (h.atk + h.def) * 5 + h.level * 20;
}

export const GRADE_A_POWER = 2000;

/** Lower bound of combat power for each grade, highest first. */
export const GRADE_THRESHOLDS: ReadonlyArray<[PowerGrade, number]> = [
  ['A', GRADE_A_POWER],
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

/** Quick first levels, steeper later: 6, 17, 31, 48, 67 ... 190 at level 10. */
export function expToNext(level: number): number {
  return Math.round(6 * level ** 1.5);
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

/** One level: the class's stat gains, full health and mana, and one level-up card to pick. */
export function levelUp(h: Hunter) {
  const g = CLASSES[h.cls ?? 'sword'].growth;
  h.level += 1;
  h.maxHp += g.hp;
  h.maxMp += g.mp;
  h.atk += g.atk;
  // Mages gain defense only on odd levels.
  h.def += h.cls === 'mage' ? h.level % 2 : g.def;
  h.hp = h.maxHp;
  h.mp = h.maxMp;
  h.picks = (h.picks ?? 0) + 1;
  h.hpRegen = roundRegen((h.hpRegen ?? 0) + REGEN_GROWTH.hp);
  h.mpRegen = roundRegen((h.mpRegen ?? 0) + REGEN_GROWTH.mp);
}

/** Every level adds this much health and mana regeneration per turn. */
export const REGEN_GROWTH = { hp: 0.02, mp: 0.01 };

function roundRegen(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Regeneration a hunter of this class and level should have: for saves from before it existed. */
export function baseRegen(cls: ClassId, level: number): { hp: number; mp: number } {
  const r = CLASSES[cls].regen;
  return { hp: roundRegen(r.hp + REGEN_GROWTH.hp * (level - 1)), mp: roundRegen(r.mp + REGEN_GROWTH.mp * (level - 1)) };
}

export function hallOfFameScore(h: Hunter): number {
  return h.killScore + h.bestFloor * 100 + h.level * 50;
}
