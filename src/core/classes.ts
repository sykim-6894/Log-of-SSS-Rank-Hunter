import type { Hunter } from './hunter';
import type { Element } from './monsters';
import { Rng } from './rng';
import { L } from './lang';

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
    name: L('검사', 'Swordsman'), role: L('근접 광역', 'Melee AoE'), look: 0,
    base: { hp: 29, mp: 10, atk: 6, def: 2 }, growth: { hp: 5, mp: 2, atk: 1, def: 1 }, regen: { hp: 0.2, mp: 0.25 },
    passive: L('혈기', 'Bloodlust'), passiveText: L('적을 처치하면 체력 3 회복', 'Heal 3 HP per kill'),
  },
  mage: {
    name: L('마법사', 'Mage'), role: L('원거리 폭딜', 'Ranged burst'), look: 1,
    base: { hp: 27, mp: 20, atk: 5, def: 1 }, growth: { hp: 4, mp: 4, atk: 1, def: 0 }, regen: { hp: 0.1, mp: 0.5 },
    passive: L('마력 순환', 'Mana Flow'), passiveText: L('마나가 2배 빨리 차고 스킬 위력 +25%', 'Mana refills 2x faster, skill power +25%'),
  },
  archer: {
    name: L('궁수', 'Archer'), role: L('원거리 견제', 'Ranged harass'), look: 2,
    base: { hp: 26, mp: 12, atk: 6, def: 1 }, growth: { hp: 4, mp: 2, atk: 1, def: 1 }, regen: { hp: 0.15, mp: 0.3 },
    passive: L('날렵함', 'Nimble'), passiveText: L('15% 확률로 공격을 피한다 · 기본 공격이 3칸까지 닿는다', '15% dodge · basic attack reaches 3 tiles'),
  },
  knight: {
    name: L('기사', 'Knight'), role: L('탱커', 'Tank'), look: 3,
    base: { hp: 36, mp: 8, atk: 4, def: 3 }, growth: { hp: 7, mp: 1, atk: 1, def: 1 }, regen: { hp: 0.3, mp: 0.2 },
    passive: L('불굴', 'Unyielding'), passiveText: L('체력 30% 이하일 때 방어 +3', 'DEF +3 at 30% HP or less'),
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
  spin: { cls: 'sword', name: L('회전베기', 'Whirlwind'), mp: 5, text: L('주변 8칸 모든 적 ×1.5', 'All 8 tiles around ×1.5'), max: L('범위 2칸', 'Range 2') },
  charge: { cls: 'sword', name: L('돌진', 'Charge'), mp: 6, aimed: true, text: L('바라보는 방향 3칸 돌진, 첫 적 ×2.0 + 1턴 기절', 'Dash 3 tiles ahead, first enemy ×2.0 + stun 1 turn'), max: L('길 위의 적 모두 벰', 'Cuts every enemy on the path') },
  smash: { cls: 'sword', name: L('내려찍기', 'Smash'), mp: 5, text: L('붙어 있는 적 하나 ×2.5, 방어 무시', 'One adjacent enemy ×2.5, ignores DEF'), max: L('처치하면 마나 돌려받음', 'Refunds mana on kill') },
  stance: { cls: 'sword', name: L('반격 자세', 'Riposte'), mp: 4, text: L('3턴 동안 맞을 때마다 ×1.2 반격', 'For 3 turns, counter ×1.2 when hit'), max: L('받는 피해 절반', 'Damage taken halved') },
  warcry: { cls: 'sword', name: L('전투 함성', 'War Cry'), mp: 6, text: L('4턴 동안 공격 +30%', 'ATK +30% for 4 turns'), max: L('주변 적 1턴 기절', 'Stuns nearby enemies 1 turn') },
  storm: { cls: 'sword', name: L('검기 폭풍', 'Tempest'), mp: 15, mpMax: 10, ultimate: true, text: L('2칸 안 모든 적 ×2.5', 'All enemies within 2 tiles ×2.5'), max: L('마나 10', 'Mana 10') },
  fireball: { cls: 'mage', name: L('화염구', 'Fireball'), mp: 5, element: 'fire', text: L('[화염] 4칸 안 가장 가까운 적 ×2.0, 주변 ×1.0', '[Fire] Nearest enemy within 4 ×2.0, around it ×1.0'), max: L('3턴 화상', 'Burn 3 turns') },
  icebolt: { cls: 'mage', name: L('얼음 화살', 'Ice Bolt'), mp: 5, aimed: true, element: 'ice', text: L('[냉기] 직선 5칸 첫 적 ×1.3 + 2턴 빙결', '[Ice] First enemy in a 5-tile line ×1.3 + freeze 2 turns'), max: L('빙결 3턴, 관통', 'Freeze 3 turns, pierces') },
  chain: { cls: 'mage', name: L('번개 사슬', 'Lightning'), mp: 7, element: 'lightning', text: L('[번개] 가까운 적부터 3명 연쇄 ×1.2', '[Lightning] Chains 3 nearest enemies ×1.2'), max: L('5명까지', 'Up to 5') },
  manashield: { cls: 'mage', name: L('마나 보호막', 'Mana Wall'), mp: 6, text: L('5턴 동안 피해를 마나로 대신 받음', 'For 5 turns, mana absorbs damage'), max: L('마나 1로 피해 2 막음', '1 mana blocks 2 damage') },
  blink: { cls: 'mage', name: L('점멸', 'Blink'), mp: 4, aimed: true, text: L('바라보는 방향 최대 4칸 순간이동', 'Teleport up to 4 tiles ahead'), max: L('떠난 자리 ×1.5 폭발', 'Explodes ×1.5 where you left') },
  meteor: { cls: 'mage', name: L('유성 낙하', 'Meteor'), mp: 20, mpMax: 15, ultimate: true, element: 'fire', text: L('[화염] 보이는 모든 적 ×1.8', '[Fire] Every visible enemy ×1.8'), max: L('마나 15', 'Mana 15') },
  pierce: { cls: 'archer', name: L('관통 화살', 'Pierce'), mp: 5, aimed: true, text: L('직선 6칸 모든 적 ×1.4', 'Every enemy in a 6-tile line ×1.4'), max: L('방어 무시', 'Ignores DEF') },
  backshot: { cls: 'archer', name: L('물러서며 쏘기', 'Backshot'), mp: 5, text: L('붙은 적 ×1.2 후 2칸 물러남', 'Adjacent enemy ×1.2, then step back 2'), max: L('맞은 적 1턴 기절', 'Stuns the target 1 turn') },
  poison: { cls: 'archer', name: L('독화살', 'Poison'), mp: 4, text: L('가까운 적 ×1.0 + 4턴 독', 'Nearest enemy ×1.0 + poison 4 turns'), max: L('독이 주변 적에게 퍼짐', 'Poison spreads to nearby enemies') },
  volley: { cls: 'archer', name: L('연사', 'Volley'), mp: 6, text: L('가까운 적에게 3발 ×0.7', '3 shots ×0.7 at the nearest enemy'), max: L('4발', '4 shots') },
  trap: { cls: 'archer', name: L('덫 설치', 'Trap'), mp: 4, text: L('발밑에 덫: 밟은 적 ×2.0 + 2턴 속박', 'Trap underfoot: ×2.0 + root 2 turns'), max: L('덫 2개까지', 'Up to 2 traps') },
  rain: { cls: 'archer', name: L('화살비', 'Barrage'), mp: 14, ultimate: true, text: L('가까운 적 중심 3×3 칸 ×2.0', '3×3 around the nearest enemy ×2.0'), max: L('5×5 칸', '5×5 area') },
  block: { cls: 'knight', name: L('방패 막기', 'Block'), mp: 4, text: L('다음 2번의 피격을 막고 ×1.0 반격', 'Block the next 2 hits and counter ×1.0'), max: L('3번 막음', 'Blocks 3') },
  taunt: { cls: 'knight', name: L('도발', 'Taunt'), mp: 5, text: L('3칸 안 적을 끌어오고 3턴 방어 +3', 'Pull enemies within 3, DEF +3 for 3 turns'), max: L('끌려온 적 1턴 기절', 'Pulled enemies stunned 1 turn') },
  bash: { cls: 'knight', name: L('방패 강타', 'Bash'), mp: 5, text: L('붙은 적 ×1.3 + 2칸 밀침, 벽에 부딪히면 기절', 'Adjacent ×1.3 + push 2, stun on wall hit'), max: L('항상 기절', 'Always stuns') },
  heal: { cls: 'knight', name: L('치유의 빛', 'Heal'), mp: 8, text: L('체력 30% 회복', 'Heal 30% HP'), max: L('3턴 방어 +3', 'DEF +3 for 3 turns') },
  bulwark: { cls: 'knight', name: L('철벽', 'Bulwark'), mp: 6, text: L('4턴 방어 +5, 움직이면 풀림', 'DEF +5 for 4 turns, ends if you move'), max: L('움직여도 유지', 'Stays when moving') },
  sanctuary: { cls: 'knight', name: L('성역', 'Sanctuary'), mp: 15, ultimate: true, text: L('5턴 피해 절반, 매 턴 체력 5% 회복', 'Half damage 5 turns, heal 5% HP each turn'), max: L('7턴', '7 turns') },
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
  atk: { name: L('공격 +2', 'ATK +2'), apply: (h) => (h.atk += 2) },
  def: { name: L('방어 +2', 'DEF +2'), apply: (h) => (h.def += 2) },
  hp: { name: L('최대 체력 +15', 'Max HP +15'), apply: (h) => { h.maxHp += 15; h.hp += 15; } },
};

export type LevelCard =
  | { type: 'learn'; skill: SkillId }
  | { type: 'upgrade'; skill: SkillId }
  | { type: 'stat'; stat: StatCard };

export function cardTitle(c: LevelCard, h: Hunter): string {
  if (c.type === 'stat') return L(`능력치: ${STAT_CARDS[c.stat].name}`, `Stat: ${STAT_CARDS[c.stat].name}`);
  const info = SKILLS[c.skill];
  if (c.type === 'learn') return L(`새 스킬: ${info.name} (마나 ${info.mp})`, `New skill: ${info.name} (mana ${info.mp})`);
  const lv = h.skills.find((s) => s.id === c.skill)?.lv ?? 1;
  return L(`강화: ${info.name} ${lv}→${lv + 1}`, `Upgrade: ${info.name} ${lv}→${lv + 1}`);
}

export function cardText(c: LevelCard, h: Hunter): string {
  if (c.type === 'stat') return L('스킬 칸이 다 찼고 모든 스킬이 5단계일 때 나오는 카드', 'Shown when all skill slots are full and every skill is level 5');
  const info = SKILLS[c.skill];
  if (c.type === 'learn') return info.text + (h.skills.length >= slotCount(h.level) ? L(' · 칸이 차서 하나와 바꿈', ' · slots full, replaces one') : '');
  const lv = h.skills.find((s) => s.id === c.skill)?.lv ?? 1;
  return lv + 1 >= MAX_SKILL_LV ? L(`위력 +20%, 5단계: ${info.max}`, `Power +20%, level 5: ${info.max}`) : L('위력 +20%', 'Power +20%');
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
    msg = L(`${SKILLS[s.id].name} ${s.lv}단계로 강화`, `${SKILLS[s.id].name} upgraded to level ${s.lv}`);
  } else if (h.skills.length < slotCount(h.level)) {
    h.skills.push({ id: card.skill, lv: 1 });
    msg = L(`새 스킬 ${SKILLS[card.skill].name}을(를) 배웠다`, `Learned ${SKILLS[card.skill].name}`);
  } else {
    if (replace === undefined || !h.skills[replace]) return undefined;
    const old = h.skills[replace];
    h.skills[replace] = { id: card.skill, lv: 1 };
    msg = L(`${SKILLS[old.id].name} 대신 ${SKILLS[card.skill].name}을(를) 배웠다`, `Learned ${SKILLS[card.skill].name} in place of ${SKILLS[old.id].name}`);
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
