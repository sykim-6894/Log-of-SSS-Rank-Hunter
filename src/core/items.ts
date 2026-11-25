import type { Hunter } from './hunter';
import { Rng } from './rng';
import { L } from './lang';

// ---------- Consumables: kept in the bag, used in the tower ----------

export type ConsumableKind = 'hp' | 'mp' | 'guard' | 'escape';
export const CONSUMABLE_KINDS: ConsumableKind[] = ['hp', 'mp', 'guard', 'escape'];

/** price: sold at the office. where: how to get the ones that are not. */
export const CONSUMABLES: Record<ConsumableKind, { name: string; describe: string; price?: number; where?: string }> = {
  hp: { name: L('체력 물약', 'HP Potion'), describe: L('체력 40% 회복', 'Restores 40% HP'), price: 15 },
  mp: { name: L('마나 물약', 'MP Potion'), describe: L('마나 60% 회복', 'Restores 60% MP'), price: 15 },
  guard: { name: L('무적 물약', 'Guard Potion'), describe: L('3턴 동안 피해 무시', 'Ignore damage for 3 turns'), where: L('보물상자·상인', 'Chests · merchants') },
  escape: { name: L('귀환 주문서', 'Return Scroll'), describe: L('바로 귀환, 돌파 보상 없음', 'Return at once, no clear reward'), where: L('탑 속 상인', 'Tower merchant') },
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

/** What a hunter carries out of the agency: one health potion. Anything else is bought before leaving. */
export function startingBag(): Bag {
  return { ...emptyBag(), hp: 1 };
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
  weapon: L('무기', 'Weapon'),
  shield: L('방패', 'Shield'),
  helmet: L('투구', 'Helmet'),
  armor: L('갑옷', 'Armor'),
  boots: L('신발', 'Boots'),
  ring: L('반지', 'Ring'),
  earring: L('귀걸이', 'Earring'),
};

export interface Gear {
  slot: GearSlot;
  name: string;
  tier: number;
  atk: number;
  def: number;
  hp: number;
  mp: number;
  /** Enhancement level, +0 to +MAX_PLUS. Each level adds PLUS_BONUS of the base stats. */
  plus?: number;
}

export type Equipment = Partial<Record<GearSlot, Gear>>;

const GEAR_NAMES: Record<GearSlot, string[]> = {
  weapon: [L('녹슨 단검', 'Rusty Dagger'), L('철검', 'Iron Sword'), L('강철 장검', 'Steel Longsword'), L('기사의 검', "Knight's Sword"), L('게이트 결정검', 'Gate Crystal Sword'), L('마력의 대검', 'Mana Greatsword'), L('균열의 검', 'Rift Sword'), L('용살의 성검', 'Dragonslayer'), L('천공의 신검', 'Celestial Blade')],
  shield: [L('나무 방패', 'Wooden Shield'), L('철 방패', 'Iron Shield'), L('강철 방패', 'Steel Shield'), L('기사의 방패', "Knight's Shield"), L('결정 방패', 'Crystal Shield'), L('마력의 방벽', 'Mana Barrier'), L('균열의 방패', 'Rift Shield'), L('용비늘 방패', 'Dragonscale Shield'), L('천공의 방패', 'Celestial Shield')],
  helmet: [L('가죽 두건', 'Leather Hood'), L('철 투구', 'Iron Helm'), L('강철 투구', 'Steel Helm'), L('기사의 투구', "Knight's Helm"), L('결정 투구', 'Crystal Helm'), L('마력의 관', 'Mana Circlet'), L('균열의 투구', 'Rift Helm'), L('용왕의 투구', 'Dragon King Helm'), L('천공의 왕관', 'Celestial Crown')],
  armor: [L('가죽 조끼', 'Leather Vest'), L('사슬 갑옷', 'Chainmail'), L('강철 흉갑', 'Steel Cuirass'), L('기사의 갑주', "Knight's Plate"), L('결정 갑주', 'Crystal Plate'), L('마력의 판금', 'Mana Plate'), L('균열의 갑주', 'Rift Plate'), L('용비늘 갑주', 'Dragonscale Plate'), L('천공의 갑주', 'Celestial Plate')],
  boots: [L('짚신', 'Straw Sandals'), L('가죽 장화', 'Leather Boots'), L('강철 장화', 'Steel Boots'), L('기사의 장화', "Knight's Boots"), L('결정 장화', 'Crystal Boots'), L('마력의 장화', 'Mana Boots'), L('균열의 장화', 'Rift Boots'), L('질풍의 장화', 'Gale Boots'), L('천공의 장화', 'Celestial Boots')],
  ring: [L('구리 반지', 'Copper Ring'), L('은 반지', 'Silver Ring'), L('금 반지', 'Gold Ring'), L('루비 반지', 'Ruby Ring'), L('결정 반지', 'Crystal Ring'), L('마력의 반지', 'Mana Ring'), L('균열의 반지', 'Rift Ring'), L('용안의 반지', 'Dragon Eye Ring'), L('천공의 반지', 'Celestial Ring')],
  earring: [L('나무 귀걸이', 'Wooden Earring'), L('구리 귀걸이', 'Copper Earring'), L('은 귀걸이', 'Silver Earring'), L('금 귀걸이', 'Gold Earring'), L('결정 귀걸이', 'Crystal Earring'), L('마력의 귀걸이', 'Mana Earring'), L('균열의 귀걸이', 'Rift Earring'), L('용안의 귀걸이', 'Dragon Eye Earring'), L('천공의 귀걸이', 'Celestial Earring')],
};
/** Highest tier found in the tower, gates and shops. */
export const MAX_TIER = 7;
/** Tiers 8 and 9 only come from the gear draw. */
export const TOP_TIER = 9;

export const MAX_PLUS = 10;
export const PLUS_BONUS = 0.1;

export type GearStats = Pick<Gear, 'atk' | 'def' | 'hp' | 'mp'>;

/** What the piece actually gives, enhancement included. Every +1 adds at least 1 to each stat it has. */
export function gearStats(g: Gear): GearStats {
  const p = g.plus ?? 0;
  const up = (v: number) => (v > 0 ? v + Math.ceil(v * PLUS_BONUS * p) : v);
  return { atk: up(g.atk), def: up(g.def), hp: up(g.hp), mp: up(g.mp) };
}

/** The name with its enhancement, like "+3 철검". */
export function gearLabel(g: Gear): string {
  return g.plus ? `+${g.plus} ${g.name}` : g.name;
}

/** Same weights as combat power, so "better" means it raises combat power more. */
export function gearScore(g: Gear): number {
  const s = gearStats(g);
  return s.hp + s.mp + (s.atk + s.def) * 5;
}

export function describeGear(g: Gear): string {
  const s = gearStats(g);
  const parts: string[] = [];
  if (s.atk) parts.push(L(`공격 +${s.atk}`, `ATK +${s.atk}`));
  if (s.def) parts.push(L(`방어 +${s.def}`, `DEF +${s.def}`));
  if (s.hp) parts.push(L(`체력 +${s.hp}`, `HP +${s.hp}`));
  if (s.mp) parts.push(L(`마나 +${s.mp}`, `MP +${s.mp}`));
  return parts.join(' ');
}

/** A random piece of gear. Higher floors give higher tiers. */
export function rollGear(rng: Rng, floor: number, slot: GearSlot = rng.pick(GEAR_SLOTS)): Gear {
  const tier = Math.max(1, Math.min(MAX_TIER, Math.ceil(floor / 2) + rng.int(-1, 1)));
  return makeGear(rng, tier, slot);
}

/** A piece of gear of a given tier. */
export function makeGear(rng: Rng, tier: number, slot: GearSlot = rng.pick(GEAR_SLOTS)): Gear {
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

function applyGear(h: Hunter, piece: Gear, sign: 1 | -1) {
  const g = gearStats(piece);
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

/** Changes the enhancement of a worn piece, moving the hunter's stats with it. */
export function setPlus(h: Hunter, slot: GearSlot, plus: number) {
  const g = h.gear[slot];
  if (!g) return;
  applyGear(h, g, -1);
  g.plus = Math.max(0, Math.min(MAX_PLUS, plus));
  applyGear(h, g, 1);
}

/** Takes a piece off for good (it broke). */
export function unequip(h: Hunter, slot: GearSlot) {
  const g = h.gear[slot];
  if (!g) return;
  applyGear(h, g, -1);
  delete h.gear[slot];
}

// ---------- Gear draw ----------

/** One draw at the agency costs about what an A to S gate clear pays the hunter. */
export const GACHA_PRICE = 1000;
/** A drawn piece that is no better than what is worn is sold back for this much. */
export const GACHA_REFUND = 300;
export const GACHA_ODDS: Array<{ tier: number; chance: number; label: string }> = [
  { tier: 5, chance: 0.35, label: L('희귀', 'Rare') },
  { tier: 6, chance: 0.3, label: L('희귀', 'Rare') },
  { tier: 7, chance: 0.22, label: L('영웅', 'Epic') },
  { tier: 8, chance: 0.1, label: L('전설', 'Legendary') },
  { tier: 9, chance: 0.03, label: L('신화', 'Mythic') },
];

export function gachaLabel(tier: number): string {
  return GACHA_ODDS.find((o) => o.tier === tier)?.label ?? L('일반', 'Common');
}

/** One random piece from the draw, any slot, tier by GACHA_ODDS. */
export function rollGacha(rng: Rng): Gear {
  let r = rng.next();
  for (const o of GACHA_ODDS) {
    if (r < o.chance) return makeGear(rng, o.tier);
    r -= o.chance;
  }
  return makeGear(rng, GACHA_ODDS[GACHA_ODDS.length - 1].tier);
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
  if (o.type === 'gear') return `${GEAR_SLOT_NAMES[o.gear.slot]} ${gearLabel(o.gear)} (${describeGear(o.gear)})`;
  if (o.type === 'item') return `${CONSUMABLES[o.item].name} (${CONSUMABLES[o.item].describe})`;
  return L('응급 치료 (체력·마나 모두 회복)', 'First aid (restore HP and MP)');
}

// ---------- Treasure chests ----------

/** Cursed chests start appearing from this floor. */
export const CURSE_FROM_FLOOR = 4;
export const CURSE_CHANCE = 0.25;

export type CurseKind = 'drain' | 'mana' | 'ambush' | 'greed';
export const CURSES: Record<CurseKind, string> = {
  drain: L('생명력이 빨려 나갔다. 체력 -25%', 'Your life is drained. HP -25%'),
  mana: L('마나가 흩어졌다. 마나 0', 'Your mana scatters. MP 0'),
  ambush: L('상자 속 몬스터들이 튀어나왔다!', 'Monsters burst out of the chest!'),
  greed: L('탐욕의 저주. 이번 수입 -30%', 'Curse of greed. This run’s income -30%'),
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
