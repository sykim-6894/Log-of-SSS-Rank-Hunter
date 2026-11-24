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
  /** What makes this kind fight differently. */
  trait?: TraitId;
  /** The abyss stalker: hunts the hunter down and cannot be killed. */
  stalker?: boolean;
  /** An association ranker met in a challenge duel. */
  ranker?: boolean;
}

export type TraitId = 'pack' | 'kite' | 'swift' | 'rage' | 'regen' | 'stealth' | 'healer' | 'thorns';

export const TRAITS: Record<TraitId, { name: string; text: string }> = {
  pack: { name: '무리', text: '2~3마리가 몰려다니고, 하나가 깨면 주변 동료도 깬다' },
  kite: { name: '거리두기', text: '붙으면 뒤로 물러나 다시 활을 쏜다' },
  swift: { name: '질주', text: '한 턴에 두 칸씩 달려든다' },
  rage: { name: '광폭', text: '체력이 절반 아래면 공격력 1.5배' },
  regen: { name: '재생', text: '매 턴 체력을 조금씩 회복한다' },
  stealth: { name: '그림자', text: '2칸 안으로 붙어야 모습이 보인다' },
  healer: { name: '치유', text: '다친 동료를 회복시킨다' },
  thorns: { name: '가시', text: '근접 공격하면 피해 일부가 되돌아온다' },
};

/** Settings for the traits, shared by the rules and the tests. */
export const TRAIT_RULES = {
  regenPerTurn: 0.06,
  rageAt: 0.5,
  rageMult: 1.5,
  stealthRange: 2,
  healEvery: 3,
  healRange: 5,
  healAmount: 0.3,
  thornsShare: 0.2,
  kiteChance: 0.6,
  packWake: 5,
};

export const MONSTERS: Record<string, MonsterKind> = {
  goblin: { id: 'goblin', name: '게이트 고블린', glyph: 'g', hp: 9, atk: 5, def: 0, exp: 5, gold: 4, score: 5, trait: 'pack' },
  archer: { id: 'archer', name: '고블린 궁수', glyph: 'a', hp: 8, atk: 5, def: 0, exp: 8, gold: 5, score: 7, range: 4, trait: 'kite' },
  wolf: { id: 'wolf', name: '이계 늑대', glyph: 'w', hp: 13, atk: 7, def: 1, exp: 8, gold: 5, score: 8, trait: 'swift' },
  orc: { id: 'orc', name: '오크 전사', glyph: 'o', hp: 23, atk: 8, def: 2, exp: 14, gold: 9, score: 14, trait: 'rage' },
  lizard: { id: 'lizard', name: '리자드맨', glyph: 'L', hp: 28, atk: 10, def: 3, exp: 18, gold: 12, score: 20, trait: 'regen' },
  knight: { id: 'knight', name: '그림자 기사', glyph: 'k', hp: 30, atk: 11, def: 4, exp: 24, gold: 16, score: 28, trait: 'stealth' },
  shaman: { id: 'shaman', name: '이계 주술사', glyph: 's', hp: 22, atk: 10, def: 2, exp: 26, gold: 18, score: 30, range: 5, trait: 'healer' },
  beast: { id: 'beast', name: '이계 마수', glyph: 'B', hp: 38, atk: 13, def: 5, exp: 30, gold: 20, score: 36, trait: 'thorns' },
  warden: { id: 'warden', name: '게이트 수문장', glyph: 'W', hp: 80, atk: 12, def: 4, exp: 70, gold: 50, score: 100, boss: true },
  overlord: { id: 'overlord', name: '이계의 군주', glyph: 'K', hp: 150, atk: 17, def: 6, exp: 180, gold: 120, score: 300, boss: true },
  dragon: { id: 'dragon', name: '균열의 용', glyph: 'D', hp: 170, atk: 19, def: 7, exp: 320, gold: 220, score: 600, boss: true },
  master: { id: 'master', name: '탑의 주인', glyph: 'M', hp: 200, atk: 21, def: 8, exp: 500, gold: 400, score: 1000, boss: true },
};

/** Highest floor for now. A boss guards every fifth floor. */
/** The tower's last floor. Above it the abyss goes on without end. */
export const TOP_FLOOR = 20;

/** "심연 3층" for floor 23. */
export function abyssDepth(floor: number): number {
  return Math.max(0, floor - TOP_FLOOR);
}
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

/** Turns on one floor before the first abyss stalker comes, and between the ones after it. */
export const STALKER_FIRST = 250;
export const STALKER_NEXT = 120;
/** A new ordinary monster wanders in every this many turns on a floor. */
export const RESPAWN_EVERY = 30;

/**
 * The abyss stalker: far too strong for the floor it appears on, always knows where
 * the hunter is, and cannot be hurt. Each one after the first is stronger.
 * Scaled by the caller like any monster (floorScale of the danger).
 */
export function stalkerKind(nth: number): MonsterKind {
  return {
    id: 'stalker',
    name: nth > 1 ? `심연의 추적자 ${nth}` : '심연의 추적자',
    glyph: '?',
    hp: 999,
    atk: Math.round(22 * (1 + 0.25 * (nth - 1))),
    def: 99,
    exp: 0,
    gold: 0,
    score: 0,
    stalker: true,
  };
}
