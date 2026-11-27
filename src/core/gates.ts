import { eliteOf, MONSTERS, MonsterKind, monsterPool, recommendedLevel } from './monsters';
import { Rng } from './rng';
import { L } from './lang';

/**
 * Gates: short dungeons that open at the agency for a few days and then close.
 * A gate's grade sets how dangerous it is, measured as the tower floor it matches.
 */
export type GateGrade = 'E' | 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS';
export const GATE_GRADES: GateGrade[] = ['E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];

/**
 * Tower floor the first gate floor matches, and how many floors the gate has.
 * SS and SSS gates are as deep as the abyss and pay more gold and magic stones for the clear.
 */
export const GATE_INFO: Record<GateGrade, { danger: number; floors: number; gold?: number; stones?: number }> = {
  E: { danger: 2, floors: 3 },
  D: { danger: 5, floors: 3 },
  C: { danger: 8, floors: 4 },
  B: { danger: 11, floors: 4 },
  A: { danger: 14, floors: 5 },
  S: { danger: 17, floors: 5 },
  SS: { danger: 21, floors: 6, gold: 1.5, stones: 2 },
  SSS: { danger: 26, floors: 6, gold: 2, stones: 3 },
};

/** Magic stones for clearing a gate. */
export function gateClearStones(g: Gate): number {
  const info = GATE_INFO[g.grade];
  return Math.round((2 + Math.floor(gateDanger(g, gateFloors(g)) / 4)) * (g.rift ? RIFT.stones : info.stones ?? 1));
}

export type GateThemeId = 'goblin' | 'wolf' | 'orc' | 'swamp' | 'shadow';

export interface GateTheme {
  name: string;
  pool: string[];
  /** Monster the gate's master is a stronger version of. */
  boss: string;
}

export const GATE_THEMES: Record<GateThemeId, GateTheme> = {
  goblin: { name: L('고블린 소굴', 'Goblin Den'), pool: ['goblin', 'archer', 'bomber'], boss: 'orc' },
  wolf: { name: L('잿빛 늑대 숲', 'Ashen Wolf Woods'), pool: ['wolf', 'beast'], boss: 'beast' },
  orc: { name: L('오크 전초기지', 'Orc Outpost'), pool: ['orc', 'archer', 'goblin'], boss: 'orc' },
  swamp: { name: L('독안개 늪', 'Poison Mist Swamp'), pool: ['lizard', 'shaman'], boss: 'lizard' },
  shadow: { name: L('그림자 성채', 'Shadow Keep'), pool: ['knight', 'shaman'], boss: 'knight' },
};
const THEME_IDS = Object.keys(GATE_THEMES) as GateThemeId[];

/** A special rule on a gate. Harder, but the clear reward is half again as big. */
export type GateRule = 'dark' | 'swarm' | 'elite' | 'sealed';
export const GATE_RULES: Record<GateRule, { name: string; text: string }> = {
  dark: { name: L('어둠', 'Dark'), text: L('시야가 4칸으로 줄어든다', 'Sight drops to 4 tiles') },
  swarm: { name: L('무리', 'Swarm'), text: L('적이 1.5배로 많다', '1.5x as many enemies') },
  elite: { name: L('정예', 'Elite'), text: L('층마다 중간보스가 나온다', 'A mid-boss on every floor') },
  sealed: { name: L('봉인', 'Sealed'), text: L('체력 물약을 쓸 수 없다', 'Health potions cannot be used') },
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
  /** A rival agency's team went in on this day. It tries to clear the gate when the next day comes. */
  rival?: RivalRaid;
  /** The great rift: a rare, harder gate sized to the agency's best hunter. */
  rift?: boolean;
  /** Overrides for the rift: the tower floor its first floor matches, and its floor count. */
  danger?: number;
  floors?: number;
  /** Our hunter went in: settled when they come back. */
  entered?: boolean;
}

/** Great rift: how often it opens, how long it stays, how much harder and richer it is. */
export const RIFT = {
  firstDay: 4,
  gapMin: 5,
  gapMax: 7,
  days: 3,
  floors: 5,
  /** Floors above the best hunter's comfortable floor. */
  extraDanger: 2,
  gold: 2.5,
  stones: 3,
  /** Levels the rival agency's best hunter gains when they close it instead of us. */
  rivalLevels: 3,
};

/** The grade that matches a tower floor, for showing a rift's grade. */
export function gradeForDanger(danger: number): GateGrade {
  let best: GateGrade = 'E';
  for (const gr of GATE_GRADES) if (GATE_INFO[gr].danger <= danger) best = gr;
  return best;
}

/** A rival agency's team working on a gate. */
export interface RivalRaid {
  agency: string;
  /** Named hunter leading the team, if the agency has one strong enough. */
  hunter?: string;
  hunterId?: number;
  level: number;
  since: number;
}

/** Clearing a gate a rival team is already in pays this much more. */
export const INTERCEPT_BONUS = 1.3;

export function gateName(g: Gate): string {
  if (g.rift) return L(`대균열 · ${GATE_THEMES[g.theme].name}`, `Great Rift · ${GATE_THEMES[g.theme].name}`);
  return L(`${g.grade}급 ${GATE_THEMES[g.theme].name}`, `${g.grade}-Rank ${GATE_THEMES[g.theme].name}`);
}

export function gateFloors(g: Gate): number {
  return g.floors ?? GATE_INFO[g.grade].floors;
}

/** The tower floor a gate floor (counted from 1) is as dangerous as. */
export function gateDanger(g: Gate, depth: number): number {
  return (g.danger ?? GATE_INFO[g.grade].danger) + depth - 1;
}

export function gateLevel(g: Gate): number {
  return recommendedLevel(g.danger ?? GATE_INFO[g.grade].danger);
}

/** Gold for clearing the gate, on top of what was picked up inside. */
export function gateClearGold(g: Gate): number {
  const base = 40 * gateDanger(g, gateFloors(g));
  const grade = g.rift ? RIFT.gold : GATE_INFO[g.grade].gold ?? 1;
  return Math.round(base * grade * (g.rule ? 1.5 : 1) * (g.rival ? INTERCEPT_BONUS : 1));
}

/** The grade that suits a hunter of this level best. */
export function gradeForLevel(level: number): GateGrade {
  let best: GateGrade = 'E';
  for (const gr of GATE_GRADES) if (recommendedLevel(GATE_INFO[gr].danger) <= level + 1) best = gr;
  return best;
}

/** Chance a rival team at this level clears the gate. */
export function raidSuccess(g: Gate, level: number): number {
  return Math.max(0.25, Math.min(0.9, 0.6 + 0.1 * (level - gateLevel(g))));
}

/** A great rift for a hunter of this level: a few floors above what they handle comfortably, always swarming. */
export function rollRift(rng: Rng, id: number, bestLevel: number, day: number): Gate {
  const danger = Math.max(3, bestLevel - 2 + RIFT.extraDanger);
  return {
    id,
    grade: gradeForDanger(danger),
    theme: rng.pick(THEME_IDS),
    rule: 'swarm',
    closesOn: day + RIFT.days - 1,
    rift: true,
    danger,
    floors: RIFT.floors,
  };
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
    name: g.rift ? L(`[대균열의 군주] ${base.name}`, `[Rift Lord] ${base.name}`) : L(`[게이트 주인] ${base.name}`, `[Gate Master] ${base.name}`),
    hp: Math.round(e.hp * (g.rift ? 1.5 : 1.25)),
    exp: Math.round(e.exp * 1.5),
    score: e.score * 2,
    elite: false,
    boss: true,
  };
}
