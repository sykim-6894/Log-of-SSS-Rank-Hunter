export interface MonsterKind {
  id: string;
  name: string;
  glyph: string;
  hp: number;
  atk: number;
  def: number;
  exp: number;
  gold: number;
  /** Points toward the hall of fame score. */
  score: number;
  boss?: boolean;
  /** A stronger named version of an ordinary monster: the floor's mid-boss. */
  elite?: boolean;
}

export const MONSTERS: Record<string, MonsterKind> = {
  goblin: { id: 'goblin', name: '게이트 고블린', glyph: 'g', hp: 10, atk: 6, def: 0, exp: 6, gold: 4, score: 5 },
  wolf: { id: 'wolf', name: '이계 늑대', glyph: 'w', hp: 15, atk: 7, def: 1, exp: 8, gold: 5, score: 8 },
  orc: { id: 'orc', name: '오크 전사', glyph: 'o', hp: 23, atk: 8, def: 2, exp: 14, gold: 9, score: 14 },
  lizard: { id: 'lizard', name: '리자드맨', glyph: 'L', hp: 30, atk: 10, def: 3, exp: 18, gold: 12, score: 20 },
  knight: { id: 'knight', name: '그림자 기사', glyph: 'k', hp: 30, atk: 11, def: 4, exp: 24, gold: 16, score: 28 },
  beast: { id: 'beast', name: '이계 마수', glyph: 'B', hp: 38, atk: 13, def: 5, exp: 30, gold: 20, score: 36 },
  warden: { id: 'warden', name: '게이트 수문장', glyph: 'W', hp: 80, atk: 12, def: 4, exp: 70, gold: 50, score: 100, boss: true },
  overlord: { id: 'overlord', name: '이계의 군주', glyph: 'K', hp: 150, atk: 17, def: 6, exp: 180, gold: 120, score: 300, boss: true },
  dragon: { id: 'dragon', name: '균열의 용', glyph: 'D', hp: 170, atk: 19, def: 7, exp: 320, gold: 220, score: 600, boss: true },
  master: { id: 'master', name: '탑의 주인', glyph: 'M', hp: 200, atk: 21, def: 8, exp: 500, gold: 400, score: 1000, boss: true },
};

/** Highest floor for now. A boss guards every fifth floor. */
export const TOP_FLOOR = 20;
export const BOSS_EVERY = 5;

/** Which ordinary monsters can appear on a floor. */
export function monsterPool(floor: number): MonsterKind[] {
  if (floor <= 2) return [MONSTERS.goblin, MONSTERS.wolf];
  if (floor <= 5) return [MONSTERS.goblin, MONSTERS.wolf, MONSTERS.orc];
  if (floor <= 8) return [MONSTERS.wolf, MONSTERS.orc, MONSTERS.lizard];
  if (floor <= 11) return [MONSTERS.orc, MONSTERS.lizard, MONSTERS.knight];
  if (floor <= 15) return [MONSTERS.lizard, MONSTERS.knight, MONSTERS.beast];
  return [MONSTERS.knight, MONSTERS.beast];
}

const BOSSES = [MONSTERS.warden, MONSTERS.overlord, MONSTERS.dragon, MONSTERS.master];

/** The boss of every fifth floor (5, 10, 15, 20). */
export function bossFor(floor: number): MonsterKind | undefined {
  if (floor % BOSS_EVERY !== 0) return undefined;
  return BOSSES[Math.min(BOSSES.length, floor / BOSS_EVERY) - 1];
}

/** Mid-boss: an ordinary monster made much tougher, with a title. */
export function eliteOf(kind: MonsterKind): MonsterKind {
  return {
    ...kind,
    id: `elite-${kind.id}`,
    name: `[중간보스] 정예 ${kind.name}`,
    glyph: kind.glyph.toUpperCase(),
    hp: Math.round(kind.hp * 2.6),
    atk: Math.round(kind.atk * 1.35),
    def: kind.def + 1,
    exp: kind.exp * 4,
    gold: kind.gold * 4,
    score: kind.score * 4,
    elite: true,
  };
}

/** Monsters get 14% stronger per floor above the first. */
export function floorScale(floor: number): number {
  return 1 + 0.14 * (floor - 1);
}
