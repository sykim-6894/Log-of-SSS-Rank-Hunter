import { eliteOf, MONSTERS, MonsterKind, monsterPool, recommendedLevel } from './monsters';
import { Rng } from './rng';

/**
 * Gates: short dungeons that open at the agency for a few days and then close.
 * A gate's grade sets how dangerous it is, measured as the tower floor it matches.
 */
export type GateGrade = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';
export const GATE_GRADES: GateGrade[] = ['E', 'D', 'C', 'B', 'A', 'S'];

/** Tower floor the first gate floor matches, and how many floors the gate has. */
export const GATE_INFO: Record<GateGrade, { danger: number; floors: number }> = {
  E: { danger: 2, floors: 3 },
  D: { danger: 5, floors: 3 },
  C: { danger: 8, floors: 4 },
  B: { danger: 11, floors: 4 },
  A: { danger: 14, floors: 5 },
  S: { danger: 17, floors: 5 },
};

export type GateThemeId = 'goblin' | 'wolf' | 'orc' | 'swamp' | 'shadow';

export interface GateTheme {
  name: string;
  pool: string[];
  /** Monster the gate's master is a stronger version of. */
  boss: string;
}

export const GATE_THEMES: Record<GateThemeId, GateTheme> = {
  goblin: { name: '고블린 소굴', pool: ['goblin', 'archer'], boss: 'orc' },
  wolf: { name: '잿빛 늑대 숲', pool: ['wolf', 'beast'], boss: 'beast' },
  orc: { name: '오크 전초기지', pool: ['orc', 'archer', 'goblin'], boss: 'orc' },
  swamp: { name: '독안개 늪', pool: ['lizard', 'shaman'], boss: 'lizard' },
  shadow: { name: '그림자 성채', pool: ['knight', 'shaman'], boss: 'knight' },
};
const THEME_IDS = Object.keys(GATE_THEMES) as GateThemeId[];

/** A special rule on a gate. Harder, but the clear reward is half again as big. */
export type GateRule = 'dark' | 'swarm' | 'elite' | 'sealed';
export const GATE_RULES: Record<GateRule, { name: string; text: string }> = {
  dark: { name: '어둠', text: '시야가 4칸으로 줄어든다' },
  swarm: { name: '무리', text: '적이 1.5배로 많다' },
  elite: { name: '정예', text: '층마다 중간보스가 나온다' },
  sealed: { name: '봉인', text: '체력 물약을 쓸 수 없다' },
};
const RULE_IDS = Object.keys(GATE_RULES) as GateRule[];

export const GATE_SLOTS = 3;
/** A gate stays open this many days. A day passes each time a hunter comes back from anywhere. */
export const GATE_DAYS = 3;
export const DARK_SIGHT = 4;

export interface Gate {
  id: number;
  grade: GateGrade;
  theme: GateThemeId;
  rule?: GateRule;
  /** Last day it can be entered. */
  closesOn: number;
}

export function gateName(g: Gate): string {
  return `${g.grade}급 ${GATE_THEMES[g.theme].name}`;
}

export function gateFloors(g: Gate): number {
  return GATE_INFO[g.grade].floors;
}

/** The tower floor a gate floor (counted from 1) is as dangerous as. */
export function gateDanger(g: Gate, depth: number): number {
  return GATE_INFO[g.grade].danger + depth - 1;
}

export function gateLevel(g: Gate): number {
  return recommendedLevel(GATE_INFO[g.grade].danger);
}

/** Gold for clearing the gate, on top of what was picked up inside. */
export function gateClearGold(g: Gate): number {
  const base = 40 * gateDanger(g, gateFloors(g));
  return Math.round(base * (g.rule ? 1.5 : 1));
}

/** The grade that suits a hunter of this level best. */
export function gradeForLevel(level: number): GateGrade {
  let best: GateGrade = 'E';
  for (const gr of GATE_GRADES) if (recommendedLevel(GATE_INFO[gr].danger) <= level + 1) best = gr;
  return best;
}

export function rollGate(rng: Rng, id: number, grade: GateGrade, day: number): Gate {
  const idx = GATE_GRADES.indexOf(grade);
  const ruleChance = idx === 0 ? 0 : idx === 1 ? 0.4 : 0.7;
  return {
    id,
    grade,
    theme: rng.pick(THEME_IDS),
    rule: rng.chance(ruleChance) ? rng.pick(RULE_IDS) : undefined,
    closesOn: day + GATE_DAYS - 1 + rng.int(0, 1),
  };
}

/** Grade of a new gate: around what the agency's best hunter can handle, sometimes a step either way. */
export function rollGateGrade(rng: Rng, bestLevel: number): GateGrade {
  const i = GATE_GRADES.indexOf(gradeForLevel(bestLevel)) + rng.pick([-1, 0, 0, 1]);
  return GATE_GRADES[Math.max(0, Math.min(GATE_GRADES.length - 1, i))];
}

function strength(kinds: MonsterKind[]): number {
  return kinds.reduce((s, k) => s + k.hp * k.atk, 0) / kinds.length;
}

/**
 * Gate monsters are as tough as the tower's at the same danger, whatever the theme:
 * goblins in an S gate are hardened goblins, shadow knights in an E gate are weakened ones.
 * Health and attack take half the gap each; armour only ever shrinks.
 */
export function gateKind(kind: MonsterKind, danger: number, theme: GateThemeId): MonsterKind {
  const themeKinds = GATE_THEMES[theme].pool.map((id) => MONSTERS[id]);
  const ratio = Math.max(0.25, strength(monsterPool(danger)) / strength(themeKinds));
  const f = Math.sqrt(ratio);
  return {
    ...kind,
    hp: Math.max(1, Math.round(kind.hp * f)),
    atk: Math.max(1, Math.round(kind.atk * f)),
    def: Math.round(kind.def * Math.min(1, f)),
    exp: Math.round(kind.exp * ratio),
    gold: Math.round(kind.gold * ratio),
    score: Math.round(kind.score * ratio),
  };
}

export function gatePool(g: Gate, danger: number): MonsterKind[] {
  return GATE_THEMES[g.theme].pool.map((id) => gateKind(MONSTERS[id], danger, g.theme));
}

/** The gate's master waits on its last floor. */
export function gateBoss(g: Gate, danger: number): MonsterKind {
  // The master is as strong as the toughest ordinary monster of the tower at this danger, then made an elite.
  const kind = MONSTERS[GATE_THEMES[g.theme].boss];
  const top = Math.max(...monsterPool(danger).map((k) => strength([k])));
  const f = Math.sqrt(top / strength([kind]));
  const base = { ...kind, hp: Math.round(kind.hp * f), atk: Math.round(kind.atk * f), def: Math.round(kind.def * Math.min(1, f)) };
  const e = eliteOf(base);
  return {
    ...e,
    name: `[게이트 주인] ${base.name}`,
    hp: Math.round(e.hp * 1.25),
    exp: Math.round(e.exp * 1.5),
    score: e.score * 2,
    elite: false,
    boss: true,
  };
}
