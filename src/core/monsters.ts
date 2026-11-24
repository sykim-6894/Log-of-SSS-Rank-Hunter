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
  /** Shoots from this many tiles away along a clear straight line. */
  range?: number;
}

export const MONSTERS: Record<string, MonsterKind> = {
  goblin: { id: 'goblin', name: '게이트 고블린', glyph: 'g', hp: 10, atk: 6, def: 0, exp: 6, gold: 4, score: 5 },
  archer: { id: 'archer', name: '고블린 궁수', glyph: 'a', hp: 8, atk: 5, def: 0, exp: 8, gold: 5, score: 7, range: 4 },
  wolf: { id: 'wolf', name: '이계 늑대', glyph: 'w', hp: 15, atk: 7, def: 1, exp: 8, gold: 5, score: 8 },
  orc: { id: 'orc', name: '오크 전사', glyph: 'o', hp: 23, atk: 8, def: 2, exp: 14, gold: 9, score: 14 },
  lizard: { id: 'lizard', name: '리자드맨', glyph: 'L', hp: 30, atk: 10, def: 3, exp: 18, gold: 12, score: 20 },
  knight: { id: 'knight', name: '그림자 기사', glyph: 'k', hp: 30, atk: 11, def: 4, exp: 24, gold: 16, score: 28 },
  shaman: { id: 'shaman', name: '이계 주술사', glyph: 's', hp: 22, atk: 10, def: 2, exp: 26, gold: 18, score: 30, range: 5 },
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
  if (floor <= 1) return [MONSTERS.goblin, MONSTERS.wolf];
  if (floor <= 2) return [MONSTERS.goblin, MONSTERS.wolf, MONSTERS.archer];
  if (floor <= 5) return [MONSTERS.goblin, MONSTERS.wolf, MONSTERS.orc, MONSTERS.archer];
  if (floor <= 8) return [MONSTERS.wolf, MONSTERS.orc, MONSTERS.lizard, MONSTERS.archer];
  if (floor <= 11) return [MONSTERS.orc, MONSTERS.lizard, MONSTERS.knight, MONSTERS.shaman];
  if (floor <= 15) return [MONSTERS.lizard, MONSTERS.knight, MONSTERS.beast, MONSTERS.shaman];
  return [MONSTERS.knight, MONSTERS.beast, MONSTERS.shaman];
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

/** Monsters get 17% stronger per floor above the first. Gold follows the same curve. */
export function floorScale(floor: number): number {
  return 1 + 0.17 * (floor - 1);
}

/** Experience grows faster than monster strength, so higher floors are worth the risk. */
export function floorExpScale(floor: number): number {
  return 1 + 0.3 * (floor - 1);
}

/** The level a hunter should be to take on a floor comfortably. */
export function recommendedLevel(floor: number): number {
  return floor + 2;
}

/**
 * Experience shrinks when the hunter is far above a floor: 15% less for each level
 * past the recommended level + 2, down to 10%. Farming low floors stops paying.
 */
export function overLevelFactor(level: number, floor: number): number {
  const gap = level - (recommendedLevel(floor) + 2);
  return gap <= 0 ? 1 : Math.max(0.1, 1 - 0.15 * gap);
}
