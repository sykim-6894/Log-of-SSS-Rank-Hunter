import { L } from './lang';
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
  /** Takes 1.5x from this element. */
  weak?: Element;
  /** Takes half from this element. */
  resist?: Element;
  /** Special moves this kind uses, each shown a turn ahead. See ABILITIES. */
  abilities?: AbilityId[];
}

/** Elements of magic skills. Monsters may be weak to one and resist another. */
export type Element = 'fire' | 'ice' | 'lightning';
export const ELEMENTS: Record<Element, { name: string; color: string }> = {
  fire: { name: L('화염', 'Fire'), color: '#ff8a4a' },
  ice: { name: L('냉기', 'Ice'), color: '#8fd3ff' },
  lightning: { name: L('번개', 'Lightning'), color: '#ffe066' },
};
export const WEAK_MULT = 1.5;
export const RESIST_MULT = 0.5;

/** Damage multiplier for an element hitting this kind of monster. */
export function elementFactor(kind: MonsterKind, el?: Element): number {
  if (!el) return 1;
  if (kind.weak === el) return WEAK_MULT;
  if (kind.resist === el) return RESIST_MULT;
  return 1;
}

/** "약점 화염 · 저항 냉기", or empty. */
export function elementNote(kind: MonsterKind): string {
  const parts: string[] = [];
  if (kind.weak) parts.push(L(`약점 ${ELEMENTS[kind.weak].name}`, `Weak to ${ELEMENTS[kind.weak].name}`));
  if (kind.resist) parts.push(L(`저항 ${ELEMENTS[kind.resist].name}`, `Resists ${ELEMENTS[kind.resist].name}`));
  return parts.join(' · ');
}

export type TraitId = 'pack' | 'kite' | 'swift' | 'rage' | 'regen' | 'stealth' | 'healer' | 'thorns' | 'bomb';

export const TRAITS: Record<TraitId, { name: string; text: string }> = {
  pack: { name: L('무리', 'Pack'), text: L('2~3마리가 몰려다니고, 하나가 깨면 주변 동료도 깬다', 'Roams in 2-3; when one wakes, the rest wake too') },
  kite: { name: L('거리두기', 'Kiting'), text: L('붙으면 뒤로 물러나 다시 활을 쏜다', 'Backs off when you close in, then shoots again') },
  swift: { name: L('질주', 'Swift'), text: L('한 턴에 두 칸씩 달려든다', 'Rushes 2 tiles a turn') },
  rage: { name: L('광폭', 'Rage'), text: L('체력이 절반 아래면 공격력 1.5배', 'Attack x1.5 below half health') },
  regen: { name: L('재생', 'Regen'), text: L('매 턴 체력을 조금씩 회복한다', 'Heals a little every turn') },
  stealth: { name: L('그림자', 'Shadow'), text: L('2칸 안으로 붙어야 모습이 보인다', 'Only visible within 2 tiles') },
  healer: { name: L('치유', 'Healer'), text: L('다친 동료를 회복시킨다', 'Heals wounded allies') },
  thorns: { name: L('가시', 'Thorns'), text: L('근접 공격하면 피해 일부가 되돌아온다', 'Melee hits reflect some damage back') },
  bomb: { name: L('자폭', 'Volatile'), text: L('가까이 오면 심지에 불을 붙이고 2턴 뒤 주변 3×3 칸을 날려버린다. 기절시키거나 먼저 잡으면 불발', 'Lights its fuse up close and blows up the 3×3 around it 2 turns later. Stun or kill it first to stop it'), },
};

/** Settings for the traits, shared by the rules and the tests. */
export const TRAIT_RULES = {
  regenPerTurn: 0.06,
  rageAt: 0.5,
  rageMult: 1.5,
  stealthRange: 2,
  healRange: 5,
  healAmount: 0.3,
  thornsShare: 0.2,
  kiteChance: 0.6,
  packWake: 5,
  /** Healing on a boss or mid-boss is held to this share of its health. */
  bigHealCap: 0.12,
};

// ---------- Special moves ----------

/**
 * Special moves. Most are wound up one turn ahead: the tiles they will hit turn red, and
 * the hunter can step out, stun the monster to break it off, or block. Some cost the
 * monster's own mana (bosses and shamans have a mana bar); all have a cooldown.
 */
export type AbilityId =
  | 'slam' | 'lunge' | 'aimshot' | 'shell' | 'ambush' | 'summon' | 'mend' | 'fuse'
  | 'quake' | 'cross' | 'breath' | 'recover';

export interface AbilityInfo {
  name: string;
  text: string;
  /** Turns before it can be used again. */
  cd: number;
  /** Monster mana it takes. */
  mp?: number;
  /** Damage times the monster's attack, for moves that hit tiles. */
  mult?: number;
  /** Turns of warning before it goes off (0: happens at once). */
  windup: number;
}

export const ABILITIES: Record<AbilityId, AbilityInfo> = {
  slam: { name: L('내려찍기', 'Overhead Slam'), text: L('붙어 있으면 1턴 예고 후 앞 3칸에 2.5배 피해', 'Up close: after a turn of warning, 2.5x damage on the 3 tiles in front'), cd: 4, mult: 2.5, windup: 1 },
  lunge: { name: L('도약', 'Pounce'), text: L('일직선 2~4칸에서 1턴 예고 후 그 줄로 덮쳐 1.8배 피해', 'From 2-4 tiles in a straight line: after a turn of warning, pounces down that line for 1.8x'), cd: 5, mult: 1.8, windup: 1 },
  aimshot: { name: L('조준 사격', 'Aimed Shot'), text: L('1턴 조준 후 그 줄에 2.2배 화살. 줄에서 벗어나면 피함', 'Aims for a turn, then a 2.2x arrow down that line. Step off the line to dodge'), cd: 4, mult: 2.2, windup: 1 },
  shell: { name: L('웅크리기', 'Curl Up'), text: L('2턴 동안 웅크려 받는 피해 70% 감소·가시 2배. 방어 무시 공격이면 깨진다', 'Curls up for 2 turns: takes 70% less, thorns doubled. Defense-piercing hits crack it'), cd: 6, windup: 0 },
  ambush: { name: L('기습', 'Ambush'), text: L('그림자에서 나와 첫 공격이 1.8배', 'Its first hit out of the shadows deals 1.8x'), cd: 99, mult: 1.8, windup: 0 },
  summon: { name: L('소환', 'Summon'), text: L('1턴 주문을 외운 뒤 졸개 2마리를 부른다. 기절시키면 끊긴다', 'Chants for a turn, then calls 2 minions. A stun breaks it'), cd: 9, mp: 12, windup: 1 },
  mend: { name: L('치유', 'Mend'), text: L('마나를 써서 다친 동료를 회복 (보스·중간보스는 12%까지만)', 'Spends mana to heal a hurt ally (bosses and mid-bosses only up to 12%)'), cd: 4, mp: 6, windup: 0 },
  fuse: { name: L('자폭', 'Self-destruct'), text: L('심지에 불을 붙이고 2턴 뒤 주변 3×3 칸에 3배 피해', 'Lights its fuse; 2 turns later, 3x damage on the 3×3 around it'), cd: 99, mult: 3, windup: 2 },
  quake: { name: L('대지 강타', 'Ground Slam'), text: L('1턴 예고 후 주변 3×3 칸에 2.2배 피해. 한 칸 물러나면 피한다', 'After a turn of warning, 2.2x on the 3×3 around it. One step back dodges it'), cd: 4, mult: 2.2, windup: 1 },
  cross: { name: L('십자 파동', 'Cross Wave'), text: L('1턴 예고 후 가로·세로 줄 전체에 1.8배 피해. 대각선으로 피한다', 'After a turn of warning, 1.8x along its whole row and column. Dodge diagonally'), cd: 5, mult: 1.8, windup: 1 },
  breath: { name: L('브레스', 'Breath'), text: L('1턴 예고 후 앞쪽 3줄 5칸에 2.2배 화염', 'After a turn of warning, 2.2x fire over 3 lanes, 5 tiles ahead'), cd: 4, mult: 2.2, windup: 1 },
  recover: { name: L('회복 주문', 'Restoration'), text: L('체력 절반 아래에서 마나 30으로 1턴 주문 후 체력 20% 회복. 기절시키면 끊긴다', 'Below half health, chants for a turn with 30 mana, then heals 20%. A stun breaks it'), cd: 15, mp: 30, windup: 1 },
};

/** Mana bars for monsters with mana moves. Bosses get more; all win back 1 a turn. */
export const MONSTER_MP = { normal: 20, big: 40, regen: 1 };

/**
 * The moves a monster uses. Bosses always have the ground slam; bosses and mid-bosses
 * with regeneration use a costly, breakable healing spell instead of healing every turn.
 */
export function abilitiesOf(kind: MonsterKind): AbilityId[] {
  if (kind.stalker || kind.ranker) return [];
  const out = [...(kind.abilities ?? [])];
  if (kind.boss && !out.includes('quake')) out.push('quake');
  if ((kind.boss || kind.elite) && kind.trait === 'regen' && !out.includes('recover')) out.push('recover');
  return out;
}

/** Regenerating every turn is for ordinary monsters; big ones cast a heal instead. */
export function regenEveryTurn(kind: MonsterKind): boolean {
  return kind.trait === 'regen' && !kind.boss && !kind.elite;
}

export const MONSTERS: Record<string, MonsterKind> = {
  goblin: { id: 'goblin', name: L('게이트 고블린', 'Gate Goblin'), glyph: 'g', hp: 9, atk: 5, def: 0, exp: 5, gold: 4, score: 5, trait: 'pack', weak: 'fire' },
  archer: { id: 'archer', name: L('고블린 궁수', 'Goblin Archer'), glyph: 'a', hp: 8, atk: 5, def: 0, exp: 8, gold: 5, score: 7, range: 4, trait: 'kite', weak: 'lightning', abilities: ['aimshot'] },
  wolf: { id: 'wolf', name: L('이계 늑대', 'Otherworld Wolf'), glyph: 'w', hp: 13, atk: 7, def: 1, exp: 8, gold: 5, score: 8, trait: 'swift', weak: 'fire', resist: 'ice', abilities: ['lunge'] },
  orc: { id: 'orc', name: L('오크 전사', 'Orc Warrior'), glyph: 'o', hp: 23, atk: 8, def: 2, exp: 14, gold: 9, score: 14, trait: 'rage', weak: 'ice', abilities: ['slam'] },
  bomber: { id: 'bomber', name: L('자폭 고블린', 'Bomb Goblin'), glyph: 'b', hp: 7, atk: 5, def: 0, exp: 7, gold: 5, score: 7, trait: 'bomb', weak: 'ice', abilities: ['fuse'] },
  lizard: { id: 'lizard', name: L('리자드맨', 'Lizardman'), glyph: 'L', hp: 28, atk: 10, def: 3, exp: 18, gold: 12, score: 20, trait: 'regen', weak: 'ice', resist: 'lightning' },
  knight: { id: 'knight', name: L('그림자 기사', 'Shadow Knight'), glyph: 'k', hp: 30, atk: 11, def: 4, exp: 24, gold: 16, score: 28, trait: 'stealth', weak: 'lightning', resist: 'ice', abilities: ['ambush', 'slam'] },
  shaman: { id: 'shaman', name: L('이계 주술사', 'Otherworld Shaman'), glyph: 's', hp: 22, atk: 10, def: 2, exp: 26, gold: 18, score: 30, range: 5, trait: 'healer', weak: 'fire', resist: 'lightning', abilities: ['mend', 'summon'] },
  beast: { id: 'beast', name: L('이계 마수', 'Otherworld Beast'), glyph: 'B', hp: 38, atk: 13, def: 5, exp: 30, gold: 20, score: 36, trait: 'thorns', weak: 'ice', resist: 'fire', abilities: ['shell'] },
  warden: { id: 'warden', name: L('게이트 수문장', 'Gate Warden'), glyph: 'W', hp: 70, atk: 10, def: 4, exp: 70, gold: 50, score: 100, boss: true, weak: 'lightning', abilities: ['quake', 'summon'] },
  overlord: { id: 'overlord', name: L('이계의 군주', 'Otherworld Overlord'), glyph: 'K', hp: 125, atk: 15, def: 6, exp: 180, gold: 120, score: 300, boss: true, weak: 'ice', resist: 'fire', abilities: ['cross', 'quake', 'recover'] },
  dragon: { id: 'dragon', name: L('균열의 용', 'Rift Dragon'), glyph: 'D', hp: 150, atk: 17, def: 7, exp: 320, gold: 220, score: 600, boss: true, weak: 'ice', resist: 'fire', abilities: ['breath', 'quake', 'recover'] },
  master: { id: 'master', name: L('탑의 주인', 'Master of the Tower'), glyph: 'M', hp: 180, atk: 19, def: 8, exp: 500, gold: 400, score: 1000, boss: true, resist: 'lightning', abilities: ['cross', 'breath', 'summon', 'recover'] },
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
  if (floor <= 3) return [MONSTERS.goblin, MONSTERS.wolf, MONSTERS.orc, MONSTERS.archer];
  if (floor <= 5) return [MONSTERS.goblin, MONSTERS.wolf, MONSTERS.orc, MONSTERS.archer, MONSTERS.bomber];
  if (floor <= 8) return [MONSTERS.wolf, MONSTERS.orc, MONSTERS.lizard, MONSTERS.archer, MONSTERS.bomber];
  if (floor <= 11) return [MONSTERS.orc, MONSTERS.lizard, MONSTERS.knight, MONSTERS.shaman, MONSTERS.bomber];
  if (floor <= 15) return [MONSTERS.lizard, MONSTERS.knight, MONSTERS.beast, MONSTERS.shaman, MONSTERS.bomber];
  return [MONSTERS.knight, MONSTERS.beast, MONSTERS.shaman, MONSTERS.bomber];
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
    name: L(`[중간보스] 정예 ${kind.name}`, `[Mid-boss] Elite ${kind.name}`),
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

/** Monsters get 13% stronger per floor above the first. Gold follows the same curve. */
export function floorScale(floor: number): number {
  return 1 + 0.13 * (floor - 1);
}

/** Experience grows faster than monster strength, so higher floors are worth the risk. */
export function floorExpScale(floor: number): number {
  return 1 + 0.15 * (floor - 1);
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
    name: nth > 1 ? L(`심연의 추적자 ${nth}`, `Abyss Stalker ${nth}`) : L('심연의 추적자', 'Abyss Stalker'),
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
