import { Grade, Hunter } from './hunter';
import { L } from './lang';

/**
 * Retirement and legacy: an S-rank or better hunter may retire. They leave the ranking
 * and give the agency legacy points, spent on permanent bonuses for every hunter after.
 */
export type PerkId = 'train' | 'rookie' | 'tribute' | 'stones' | 'potion';

export interface Legacy {
  points: number;
  perks: Partial<Record<PerkId, number>>;
}

export interface PerkInfo {
  name: string;
  /** What one level does. */
  text: string;
  max: number;
}

export const PERKS: Record<PerkId, PerkInfo> = {
  train: { name: L('훈련 지원', 'Training Grant'), text: L('훈련비 -10%', 'Training cost -10% per level'), max: 5 },
  rookie: { name: L('신입 육성', 'Rookie Program'), text: L('새 헌터 체력 +5 · 공격 +1 · 방어 +1', 'New hunters: Max HP +5, ATK +1, DEF +1 per level'), max: 5 },
  tribute: { name: L('협회 후원', 'Association Backing'), text: L('상납받을 때 협회가 10% 더 줌', 'The Association adds 10% to each cut per level'), max: 5 },
  stones: { name: L('마력석 감정', 'Stone Appraisal'), text: L('가져온 마력석 +20%', 'Mana stones brought home +20% per level'), max: 5 },
  potion: { name: L('보급 물약', 'Potion Supply'), text: L('출발할 때 체력 물약 +1', 'Start each run with +1 HP potion per level'), max: 2 },
};

export const PERK_IDS = Object.keys(PERKS) as PerkId[];

/** Points a retiring hunter leaves behind. Only an SSS retires as a legend. */
export const RETIRE_POINTS: Partial<Record<Grade, number>> = { S: 1, SS: 3, SSS: 10 };

export function canRetireGrade(grade: Grade): boolean {
  return RETIRE_POINTS[grade] !== undefined;
}

export function perkLevel(legacy: Legacy | undefined, id: PerkId): number {
  return legacy?.perks[id] ?? 0;
}

/** Next level of a perk costs its level number in points: 1, 2, 3... */
export function perkCost(legacy: Legacy | undefined, id: PerkId): number {
  return perkLevel(legacy, id) + 1;
}

/** A top-level agency lifts every perk's cap by one. */
export function perkMax(id: PerkId, extra = 0): number {
  return PERKS[id].max + extra;
}

export function buyPerk(legacy: Legacy, id: PerkId, extra = 0): boolean {
  const lv = perkLevel(legacy, id);
  const cost = lv + 1;
  if (lv >= perkMax(id, extra) || legacy.points < cost) return false;
  legacy.points -= cost;
  legacy.perks[id] = lv + 1;
  return true;
}

/** The rookie program's head start for a newly signed hunter. */
export function applyRookie(legacy: Legacy | undefined, h: Hunter) {
  const lv = perkLevel(legacy, 'rookie');
  if (!lv) return;
  h.maxHp += 5 * lv;
  h.hp = h.maxHp;
  h.atk += lv;
  h.def += lv;
}
