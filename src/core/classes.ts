import type { Hunter } from './hunter';
import type { Element } from './monsters';
import { Rng } from './rng';

// ---------- Classes ----------

export type ClassId = 'sword' | 'mage' | 'archer' | 'knight';
export const CLASS_IDS: ClassId[] = ['sword', 'mage', 'archer', 'knight'];

export interface ClassInfo {
  name: string;
  role: string;
  /** Index of the pixel look drawn for this class. */
  look: number;
  base: { hp: number; mp: number; atk: number; def: number };
  /** Gains per level. Mages gain defense only on odd levels. */
  growth: { hp: number; mp: number; atk: number; def: number };
  /** Health and mana won back each turn at level 1 (fractions add up over turns). */
  regen: { hp: number; mp: number };
  passive: string;
  passiveText: string;
}

export const CLASSES: Record<ClassId, ClassInfo> = {
  sword: {
    name: '검사', role: '근접 광역', look: 0,
    base: { hp: 29, mp: 10, atk: 6, def: 2 }, growth: { hp: 5, mp: 2, atk: 1, def: 1 }, regen: { hp: 0.2, mp: 0.25 },
    passive: '혈기', passiveText: '적을 처치하면 체력 3 회복',
  },
  mage: {
    name: '마법사', role: '원거리 폭딜', look: 1,
    base: { hp: 27, mp: 20, atk: 5, def: 1 }, growth: { hp: 4, mp: 4, atk: 1, def: 0 }, regen: { hp: 0.1, mp: 0.5 },
    passive: '마력 순환', passiveText: '마나가 2배 빨리 차고 스킬 위력 +25%',
  },
  archer: {
    name: '궁수', role: '원거리 견제', look: 2,
    base: { hp: 26, mp: 12, atk: 6, def: 1 }, growth: { hp: 4, mp: 2, atk: 1, def: 1 }, regen: { hp: 0.15, mp: 0.3 },
    passive: '날렵함', passiveText: '15% 확률로 공격을 피한다 · 기본 공격이 3칸까지 닿는다',
  },
  knight: {
    name: '기사', role: '탱커', look: 3,
    base: { hp: 36, mp: 8, atk: 4, def: 3 }, growth: { hp: 7, mp: 1, atk: 1, def: 1 }, regen: { hp: 0.3, mp: 0.2 },
    passive: '불굴', passiveText: '체력 30% 이하일 때 방어 +3',
  },
};

/** Rivals are made in the class that troubles ours most. */
export const COUNTER_CLASS: Record<ClassId, ClassId> = { knight: 'mage', mage: 'archer', archer: 'sword', sword: 'knight' };

export const ARCHER_RANGE = 3;
export const ARCHER_FAR_DAMAGE = 0.7;
/** Hit chance by distance for the archer's basic shot. */
export function archerHitChance(dist: number): number {
  return dist <= 1 ? 1 : dist === 2 ? 0.85 : 0.7;
}
export const ARCHER_DODGE = 0.15;
export const SWORD_KILL_HEAL = 3;
/** The mage's passive also makes every skill hit this much harder. */
export const MAGE_SKILL_POWER = 1.25;
export const KNIGHT_LOW_HP = 0.3;
export const KNIGHT_LOW_DEF = 3;

// ---------- Skills ----------

export type SkillId =
  | 'spin' | 'charge' | 'smash' | 'stance' | 'warcry' | 'storm'
  | 'fireball' | 'icebolt' | 'chain' | 'manashield' | 'blink' | 'meteor'
  | 'pierce' | 'backshot' | 'poison' | 'volley' | 'trap' | 'rain'
  | 'block' | 'taunt' | 'bash' | 'heal' | 'bulwark' | 'sanctuary';

export interface SkillInfo {
  cls: ClassId;
  name: string;
  mp: number;
  /** Mana cost at upgrade 5, if it drops. */
  mpMax?: number;
  /** Big skills: offered on level-up cards only from ULTIMATE_LEVEL. */
  ultimate?: boolean;
  /** Needs a direction: uses the way the hunter last moved. */
  aimed?: boolean;
  /** Fire, ice or lightning: monsters may be weak to it or resist it. */
  element?: Element;
  text: string;
  max: string;
}

export const SKILLS: Record<SkillId, SkillInfo> = {
  spin: { cls: 'sword', name: '회전베기', mp: 5, text: '주변 8칸 모든 적 ×1.5', max: '범위 2칸' },
  charge: { cls: 'sword', name: '돌진', mp: 6, aimed: true, text: '바라보는 방향 3칸 돌진, 첫 적 ×2.0 + 1턴 기절', max: '길 위의 적 모두 벰' },
  smash: { cls: 'sword', name: '내려찍기', mp: 5, text: '붙어 있는 적 하나 ×2.5, 방어 무시', max: '처치하면 마나 돌려받음' },
  stance: { cls: 'sword', name: '반격 자세', mp: 4, text: '3턴 동안 맞을 때마다 ×1.2 반격', max: '받는 피해 절반' },
  warcry: { cls: 'sword', name: '전투 함성', mp: 6, text: '4턴 동안 공격 +30%', max: '주변 적 1턴 기절' },
  storm: { cls: 'sword', name: '검기 폭풍', mp: 15, mpMax: 10, ultimate: true, text: '2칸 안 모든 적 ×2.5', max: '마나 10' },
  fireball: { cls: 'mage', name: '화염구', mp: 5, element: 'fire', text: '[화염] 4칸 안 가장 가까운 적 ×2.0, 주변 ×1.0', max: '3턴 화상' },
  icebolt: { cls: 'mage', name: '얼음 화살', mp: 5, aimed: true, element: 'ice', text: '[냉기] 직선 5칸 첫 적 ×1.3 + 2턴 빙결', max: '빙결 3턴, 관통' },
  chain: { cls: 'mage', name: '번개 사슬', mp: 7, element: 'lightning', text: '[번개] 가까운 적부터 3명 연쇄 ×1.2', max: '5명까지' },
  manashield: { cls: 'mage', name: '마나 보호막', mp: 6, text: '5턴 동안 피해를 마나로 대신 받음', max: '마나 1로 피해 2 막음' },
  blink: { cls: 'mage', name: '점멸', mp: 4, aimed: true, text: '바라보는 방향 최대 4칸 순간이동', max: '떠난 자리 ×1.5 폭발' },
  meteor: { cls: 'mage', name: '유성 낙하', mp: 20, mpMax: 15, ultimate: true, element: 'fire', text: '[화염] 보이는 모든 적 ×1.8', max: '마나 15' },
  pierce: { cls: 'archer', name: '관통 화살', mp: 5, aimed: true, text: '직선 6칸 모든 적 ×1.4', max: '방어 무시' },
  backshot: { cls: 'archer', name: '물러서며 쏘기', mp: 5, text: '붙은 적 ×1.2 후 2칸 물러남', max: '맞은 적 1턴 기절' },
  poison: { cls: 'archer', name: '독화살', mp: 4, text: '가까운 적 ×1.0 + 4턴 독', max: '독이 주변 적에게 퍼짐' },
  volley: { cls: 'archer', name: '연사', mp: 6, text: '가까운 적에게 3발 ×0.7', max: '4발' },
  trap: { cls: 'archer', name: '덫 설치', mp: 4, text: '발밑에 덫: 밟은 적 ×2.0 + 2턴 속박', max: '덫 2개까지' },
  rain: { cls: 'archer', name: '화살비', mp: 14, ultimate: true, text: '가까운 적 중심 3×3 칸 ×2.0', max: '5×5 칸' },
  block: { cls: 'knight', name: '방패 막기', mp: 4, text: '다음 2번의 피격을 막고 ×1.0 반격', max: '3번 막음' },
  taunt: { cls: 'knight', name: '도발', mp: 5, text: '3칸 안 적을 끌어오고 3턴 방어 +3', max: '끌려온 적 1턴 기절' },
  bash: { cls: 'knight', name: '방패 강타', mp: 5, text: '붙은 적 ×1.3 + 2칸 밀침, 벽에 부딪히면 기절', max: '항상 기절' },
  heal: { cls: 'knight', name: '치유의 빛', mp: 8, text: '체력 30% 회복', max: '3턴 방어 +3' },
  bulwark: { cls: 'knight', name: '철벽', mp: 6, text: '4턴 방어 +5, 움직이면 풀림', max: '움직여도 유지' },
  sanctuary: { cls: 'knight', name: '성역', mp: 15, ultimate: true, text: '5턴 피해 절반, 매 턴 체력 5% 회복', max: '7턴' },
};

/** Skills of a class in table order. The first is the class's signature skill. */
export function classSkills(cls: ClassId): SkillId[] {
  return (Object.keys(SKILLS) as SkillId[]).filter((id) => SKILLS[id].cls === cls);
}

export const MAX_SKILL_LV = 5;
export const ULTIMATE_LEVEL = 8;
/** Each upgrade adds 20% power. */
export const SKILL_LV_POWER = 0.2;

export interface OwnedSkill {
  id: SkillId;
  lv: number;
}

/** Skill slots open at levels 1, 5 and 10. */
export function slotCount(level: number): number {
  return level >= 10 ? 3 : level >= 5 ? 2 : 1;
}

export function skillCost(s: OwnedSkill): number {
  const info = SKILLS[s.id];
  return s.lv >= MAX_SKILL_LV && info.mpMax ? info.mpMax : info.mp;
}

export function skillLabel(s: OwnedSkill): string {
  return `${SKILLS[s.id].name} ${s.lv}`;
}

// ---------- Level-up cards ----------

export type StatCard = 'atk' | 'def' | 'hp';
export const STAT_CARDS: Record<StatCard, { name: string; apply: (h: Hunter) => void }> = {
  atk: { name: '공격 +2', apply: (h) => (h.atk += 2) },
  def: { name: '방어 +2', apply: (h) => (h.def += 2) },
  hp: { name: '최대 체력 +15', apply: (h) => { h.maxHp += 15; h.hp += 15; } },
};

export type LevelCard =
  | { type: 'learn'; skill: SkillId }
  | { type: 'upgrade'; skill: SkillId }
  | { type: 'stat'; stat: StatCard };

export function cardTitle(c: LevelCard, h: Hunter): string {
  if (c.type === 'stat') return `능력치: ${STAT_CARDS[c.stat].name}`;
  const info = SKILLS[c.skill];
  if (c.type === 'learn') return `새 스킬: ${info.name} (마나 ${info.mp})`;
  const lv = h.skills.find((s) => s.id === c.skill)?.lv ?? 1;
  return `강화: ${info.name} ${lv}→${lv + 1}`;
}

export function cardText(c: LevelCard, h: Hunter): string {
  if (c.type === 'stat') return '스킬 칸이 다 찼고 모든 스킬이 5단계일 때 나오는 카드';
  const info = SKILLS[c.skill];
  if (c.type === 'learn') return info.text + (h.skills.length >= slotCount(h.level) ? ' · 칸이 차서 하나와 바꿈' : '');
  const lv = h.skills.find((s) => s.id === c.skill)?.lv ?? 1;
  return lv + 1 >= MAX_SKILL_LV ? `위력 +20%, 5단계: ${info.max}` : '위력 +20%';
}

/**
 * Three cards for one level-up: new skills and upgrades at random, stat cards when those run out.
 * Once every open slot holds a skill, only upgrades (then stat cards) come up.
 */
export function rollCards(h: Hunter, rng: Rng): LevelCard[] {
  const owned = new Set(h.skills.map((s) => s.id));
  const pool: LevelCard[] = [];
  const full = h.skills.length >= slotCount(h.level);
  for (const id of full ? [] : classSkills(h.cls)) {
    if (owned.has(id)) continue;
    if (SKILLS[id].ultimate && h.level < ULTIMATE_LEVEL) continue;
    pool.push({ type: 'learn', skill: id });
  }
  for (const s of h.skills) if (s.lv < MAX_SKILL_LV) pool.push({ type: 'upgrade', skill: s.id });
  const cards: LevelCard[] = [];
  while (cards.length < 3 && pool.length) cards.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  const stats: StatCard[] = ['atk', 'def', 'hp'];
  while (cards.length < 3) cards.push({ type: 'stat', stat: stats.splice(rng.int(0, stats.length - 1), 1)[0] });
  return cards;
}

/** Cards waiting for this hunter's next pick, rolled once and kept so reopening the game doesn't reroll. */
export function pendingCards(h: Hunter, rng: Rng): LevelCard[] | undefined {
  if (!h.picks) return undefined;
  if (!h.cards?.length) h.cards = rollCards(h, rng);
  return h.cards;
}

/**
 * Takes one of the offered cards. A new skill with every slot full replaces the skill at `replace`.
 * Returns a line for the log, or undefined if the pick can't be made that way.
 */
export function chooseCard(h: Hunter, index: number, replace?: number): string | undefined {
  const card = h.cards?.[index];
  if (!card || !h.picks) return undefined;
  let msg: string;
  if (card.type === 'stat') {
    STAT_CARDS[card.stat].apply(h);
    msg = `${STAT_CARDS[card.stat].name}`;
  } else if (card.type === 'upgrade') {
    const s = h.skills.find((x) => x.id === card.skill);
    if (!s) return undefined;
    s.lv = Math.min(MAX_SKILL_LV, s.lv + 1);
    msg = `${SKILLS[s.id].name} ${s.lv}단계로 강화`;
  } else if (h.skills.length < slotCount(h.level)) {
    h.skills.push({ id: card.skill, lv: 1 });
    msg = `새 스킬 ${SKILLS[card.skill].name}을(를) 배웠다`;
  } else {
    if (replace === undefined || !h.skills[replace]) return undefined;
    const old = h.skills[replace];
    h.skills[replace] = { id: card.skill, lv: 1 };
    msg = `${SKILLS[old.id].name} 대신 ${SKILLS[card.skill].name}을(를) 배웠다`;
  }
  h.picks -= 1;
  h.cards = undefined;
  return msg;
}

/** Hunters nobody plays (rivals, scouted hunters) spend their picks on their own. */
export function autoPick(h: Hunter, rng: Rng) {
  for (let guard = 0; h.picks > 0 && guard < 100; guard++) {
    const cards = pendingCards(h, rng)!;
    const learnable = cards.findIndex((c) => c.type === 'learn' && h.skills.length < slotCount(h.level));
    const upgrade = cards.findIndex((c) => c.type === 'upgrade');
    const stat = cards.findIndex((c) => c.type === 'stat');
    const i = learnable >= 0 ? learnable : upgrade >= 0 ? upgrade : stat >= 0 ? stat : 0;
    if (!chooseCard(h, i, 0)) {
      h.picks -= 1;
      h.cards = undefined;
    }
  }
}

/** Two random first skills of a class for the hiring screen (no big skills). */
export function firstSkillChoices(cls: ClassId, rng: Rng): SkillId[] {
  const pool = classSkills(cls).filter((id) => !SKILLS[id].ultimate);
  const a = pool.splice(rng.int(0, pool.length - 1), 1)[0];
  const b = pool.splice(rng.int(0, pool.length - 1), 1)[0];
  return [a, b];
}
