import type { Hunter } from './hunter';
import { Rng } from './rng';

// ---------- Consumables: kept in the bag, used in the tower ----------

export type ConsumableKind = 'hp' | 'mp' | 'guard' | 'escape';
export const CONSUMABLE_KINDS: ConsumableKind[] = ['hp', 'mp', 'guard', 'escape'];

/** price: sold at the office. where: how to get the ones that are not. */
export const CONSUMABLES: Record<ConsumableKind, { name: string; describe: string; price?: number; where?: string }> = {
  hp: { name: '체력 물약', describe: '체력 40% 회복', price: 15 },
  mp: { name: '마나 물약', describe: '마나 60% 회복', price: 15 },
  guard: { name: '무적 물약', describe: '3턴 동안 피해 무시', where: '보물상자·상인' },
  escape: { name: '귀환 주문서', describe: '바로 귀환, 돌파 보상 없음', where: '탑 속 상인' },
};

export const HP_POTION_HEAL = 0.4;
export const MP_POTION_RESTORE = 0.6;
export const GUARD_TURNS = 3;
/** Most of one kind the bag holds. */
export const BAG_MAX = 5;

export type Bag = Record<ConsumableKind, number>;

export function emptyBag(): Bag {
  return { hp: 0, mp: 0, guard: 0, escape: 0 };
}

/** Puts items in the bag. Returns how many fit; the rest are left behind. */
export function addToBag(h: Hunter, kind: ConsumableKind, count = 1): number {
  const fit = Math.max(0, Math.min(count, BAG_MAX - h.bag[kind]));
  h.bag[kind] += fit;
  return fit;
}

// ---------- Equipment: one piece per slot, a better find replaces the old one ----------

export type GearSlot = 'weapon' | 'shield' | 'helmet' | 'armor' | 'boots' | 'ring' | 'earring';
export const GEAR_SLOTS: GearSlot[] = ['weapon', 'shield', 'helmet', 'armor', 'boots', 'ring', 'earring'];
export const GEAR_SLOT_NAMES: Record<GearSlot, string> = {
  weapon: '무기',
  shield: '방패',
  helmet: '투구',
  armor: '갑옷',
  boots: '신발',
  ring: '반지',
  earring: '귀걸이',
};

export interface Gear {
  slot: GearSlot;
  name: string;
  tier: number;
  atk: number;
  def: number;
  hp: number;
  mp: number;
}

export type Equipment = Partial<Record<GearSlot, Gear>>;

const GEAR_NAMES: Record<GearSlot, string[]> = {
  weapon: ['녹슨 단검', '철검', '강철 장검', '기사의 검', '게이트 결정검', '마력의 대검', '균열의 검'],
  shield: ['나무 방패', '철 방패', '강철 방패', '기사의 방패', '결정 방패', '마력의 방벽', '균열의 방패'],
  helmet: ['가죽 두건', '철 투구', '강철 투구', '기사의 투구', '결정 투구', '마력의 관', '균열의 투구'],
  armor: ['가죽 조끼', '사슬 갑옷', '강철 흉갑', '기사의 갑주', '결정 갑주', '마력의 판금', '균열의 갑주'],
  boots: ['짚신', '가죽 장화', '강철 장화', '기사의 장화', '결정 장화', '마력의 장화', '균열의 장화'],
  ring: ['구리 반지', '은 반지', '금 반지', '루비 반지', '결정 반지', '마력의 반지', '균열의 반지'],
  earring: ['나무 귀걸이', '구리 귀걸이', '은 귀걸이', '금 귀걸이', '결정 귀걸이', '마력의 귀걸이', '균열의 귀걸이'],
};
export const MAX_TIER = 7;

/** Same weights as combat power, so "better" means it raises combat power more. */
export function gearScore(g: Gear): number {
  return g.hp + g.mp + (g.atk + g.def) * 5;
}

export function describeGear(g: Gear): string {
  const parts: string[] = [];
  if (g.atk) parts.push(`공격 +${g.atk}`);
  if (g.def) parts.push(`방어 +${g.def}`);
  if (g.hp) parts.push(`체력 +${g.hp}`);
  if (g.mp) parts.push(`마나 +${g.mp}`);
  return parts.join(' ');
}

/** A random piece of gear. Higher floors give higher tiers. */
export function rollGear(rng: Rng, floor: number, slot: GearSlot = rng.pick(GEAR_SLOTS)): Gear {
  const tier = Math.max(1, Math.min(MAX_TIER, Math.ceil(floor / 2) + rng.int(-1, 1)));
  const g: Gear = { slot, name: GEAR_NAMES[slot][tier - 1], tier, atk: 0, def: 0, hp: 0, mp: 0 };
  const half = Math.ceil(tier / 2);
  switch (slot) {
    case 'weapon': // attack
      g.atk = tier * 2 + rng.int(0, 1);
      break;
    case 'shield': // defense
      g.def = tier + rng.int(0, 1);
      break;
    case 'helmet': // health, a little defense
      g.hp = tier * 4 + rng.int(0, 2);
      g.def = tier >= 3 ? 1 : 0;
      break;
    case 'armor': // defense and health
      g.def = half + rng.int(0, 1);
      g.hp = tier * 3;
      break;
    case 'boots': // health, a little defense
      g.hp = tier * 3 + rng.int(0, 2);
      g.def = half - 1;
      break;
    case 'ring': // attack and mana
      g.atk = half + rng.int(0, 1);
      g.mp = tier;
      break;
    case 'earring': // mana
      g.mp = tier * 3 + rng.int(0, 2);
      break;
  }
  return g;
}

function applyGear(h: Hunter, g: Gear, sign: 1 | -1) {
  h.atk += g.atk * sign;
  h.def += g.def * sign;
  h.maxHp += g.hp * sign;
  h.maxMp += g.mp * sign;
  if (sign > 0) {
    h.hp += g.hp;
    h.mp += g.mp;
  }
  h.hp = Math.max(1, Math.min(h.hp, h.maxHp));
  h.mp = Math.max(0, Math.min(h.mp, h.maxMp));
}

export interface EquipResult {
  equipped: boolean;
  /** The piece that was thrown away: the old one if replaced, otherwise the new find. */
  discarded?: Gear;
}

/** Wears the find if it beats what is in that slot; the loser is thrown away. */
export function equipIfBetter(h: Hunter, g: Gear): EquipResult {
  const current = h.gear[g.slot];
  if (current && gearScore(current) >= gearScore(g)) return { equipped: false, discarded: g };
  if (current) applyGear(h, current, -1);
  h.gear[g.slot] = g;
  applyGear(h, g, 1);
  return { equipped: true, discarded: current };
}

// ---------- Wandering merchant ----------

export type Offer =
  | { type: 'gear'; gear: Gear; price: number }
  | { type: 'item'; item: ConsumableKind; price: number }
  | { type: 'heal'; price: number };

export type OfferCategory = 'gear' | 'supply' | 'recovery' | 'escape';

/** Three of the four categories at random: gear, supplies, recovery, a way home. */
export function rollOffers(rng: Rng, floor: number): Offer[] {
  const cats: OfferCategory[] = ['gear', 'supply', 'recovery', 'escape'];
  const skip = rng.int(0, cats.length - 1);
  return cats.filter((_, i) => i !== skip).map((cat): Offer => {
    switch (cat) {
      case 'gear': {
        const gear = rollGear(rng, floor + 1);
        return { type: 'gear', gear, price: 20 + gear.tier * 15 };
      }
      case 'supply':
        return rng.chance(0.5) ? { type: 'item', item: 'guard', price: 35 } : { type: 'item', item: 'mp', price: 12 };
      case 'recovery':
        return rng.chance(0.5) ? { type: 'item', item: 'hp', price: 12 } : { type: 'heal', price: 20 + floor * 3 };
      case 'escape':
        return { type: 'item', item: 'escape', price: 25 + floor * 2 };
    }
  });
}

export function offerLabel(o: Offer): string {
  if (o.type === 'gear') return `${GEAR_SLOT_NAMES[o.gear.slot]} ${o.gear.name} (${describeGear(o.gear)})`;
  if (o.type === 'item') return `${CONSUMABLES[o.item].name} (${CONSUMABLES[o.item].describe})`;
  return '응급 치료 (체력·마나 모두 회복)';
}

// ---------- Treasure chests ----------

/** Cursed chests start appearing from this floor. */
export const CURSE_FROM_FLOOR = 4;
export const CURSE_CHANCE = 0.25;

export type CurseKind = 'drain' | 'mana' | 'ambush' | 'greed';
export const CURSES: Record<CurseKind, string> = {
  drain: '생명력이 빨려 나갔다. 체력 -25%',
  mana: '마나가 흩어졌다. 마나 0',
  ambush: '상자 속 몬스터들이 튀어나왔다!',
  greed: '탐욕의 저주. 이번 수입 -30%',
};

export type ChestContent =
  | { type: 'gold'; amount: number }
  | { type: 'consumable'; kind: ConsumableKind }
  | { type: 'gear'; gear: Gear }
  | { type: 'curse'; curse: CurseKind };

export function rollChest(rng: Rng, floor: number): ChestContent {
  if (floor >= CURSE_FROM_FLOOR && rng.chance(CURSE_CHANCE)) {
    return { type: 'curse', curse: rng.pick<CurseKind>(['drain', 'mana', 'ambush', 'greed']) };
  }
  const r = rng.next();
  if (r < 0.45) return { type: 'gold', amount: floor * 8 + rng.int(0, floor * 6) };
  if (r < 0.75) {
    const k = rng.next();
    return { type: 'consumable', kind: k < 0.5 ? 'hp' : k < 0.85 ? 'mp' : 'guard' };
  }
  return { type: 'gear', gear: rollGear(rng, floor) };
}
