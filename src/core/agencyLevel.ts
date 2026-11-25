import type { Hunter } from './hunter';
import { TRIBUTE_RATE } from './hunter';
import { L } from './lang';

/**
 * The agency grows with what its hunters bring in: every gold of the cut is a point of
 * agency experience, and gold a hunter invests counts half again. Levels open features.
 */
export interface AgencyProgress {
  exp?: number;
  /** Saves from before agency levels keep every feature they already had. */
  allOpen?: boolean;
}

export type Feature = 'gates' | 'quests' | 'gacha' | 'shop' | 'enhance' | 'duel' | 'arena' | 'bag' | 'stash' | 'dispatch' | 'prep' | 'scout' | 'rival2';

/** Experience needed to reach each level (index 0 is level 1). */
export const AGENCY_LEVEL_EXP = [0, 150, 1500, 5000, 10000, 20000, 35000, 60000];
export const MAX_AGENCY_LEVEL = AGENCY_LEVEL_EXP.length;

export const FEATURE_LEVEL: Record<Feature, number> = {
  gates: 2, quests: 2, gacha: 3, shop: 3, enhance: 4, stash: 4, duel: 5, arena: 5, bag: 5, dispatch: 6, prep: 6, scout: 7, rival2: 8,
};

export function featureName(f: Feature): string {
  return {
    gates: L('게이트', 'Gates'),
    quests: L('협회 의뢰판', 'Association quest board'),
    shop: L('상점 확장', 'Bigger shop'),
    bag: L('가방 확장', 'Bigger bag'),
    prep: L('출정 준비', 'Departure prep'),
    rival2: L('두 번째 경쟁사', 'Second rival agency'),
    gacha: L('장비 뽑기', 'Gear draws'),
    enhance: L('장비 강화', 'Gear enhancing'),
    duel: L('랭커 도전', 'Ranker challenges'),
    arena: L('생존 아레나', 'Survival Arena'),
    stash: L('장비 창고', 'Gear storage'),
    dispatch: L('파견', 'Dispatch'),
    scout: L('스카웃 센터', 'Scout center'),
  }[f];
}

/** Invested gold counts this much more than the cut. */
export const INVEST_EXP = 1.5;
/** Every this much a hunter invests lowers their cut a little, up to a limit. */
export const INVEST_STEP = 500;
export const INVEST_CUT = 0.02;
export const INVEST_CUT_MAX = 0.1;
/** At the top level: training is cheaper and legacy bonuses go one level higher. */
export const TOP_TRAINING_DISCOUNT = 0.1;

export function agencyLevel(a: AgencyProgress): number {
  const exp = a.exp ?? 0;
  let lv = 1;
  while (lv < MAX_AGENCY_LEVEL && exp >= AGENCY_LEVEL_EXP[lv]) lv++;
  return lv;
}

/** Experience into this level and needed for the next, or undefined at the top. */
export function levelProgress(a: AgencyProgress): { have: number; need: number } | undefined {
  const lv = agencyLevel(a);
  if (lv >= MAX_AGENCY_LEVEL) return undefined;
  const base = AGENCY_LEVEL_EXP[lv - 1];
  return { have: (a.exp ?? 0) - base, need: AGENCY_LEVEL_EXP[lv] - base };
}

export function unlocked(a: AgencyProgress, f: Feature): boolean {
  return !!a.allOpen || agencyLevel(a) >= FEATURE_LEVEL[f];
}

/** Hunter slots open: one at first, two from level 2, three from level 5. */
export function openSlots(a: AgencyProgress): number {
  if (a.allOpen) return 3;
  const lv = agencyLevel(a);
  return lv >= 5 ? 3 : lv >= 2 ? 2 : 1;
}

/** What a level opens, for the level-up message. */
export function opensAt(level: number): string[] {
  const out = (Object.keys(FEATURE_LEVEL) as Feature[]).filter((f) => FEATURE_LEVEL[f] === level).map(featureName);
  if (level === 2) out.push(L('헌터 2번 슬롯', 'Hunter slot 2'));
  if (level === 5) out.push(L('헌터 3번 슬롯', 'Hunter slot 3'));
  if (level === MAX_AGENCY_LEVEL) out.push(L('훈련비 할인', 'Cheaper training'), L('전승 보너스 한도 +1', 'Legacy bonus cap +1'));
  return out;
}

/** Adds experience. Returns the new level if it went up. */
export function gainAgencyExp(a: AgencyProgress, n: number): number | undefined {
  const before = agencyLevel(a);
  a.exp = (a.exp ?? 0) + Math.max(0, Math.round(n));
  const after = agencyLevel(a);
  return after > before ? after : undefined;
}

/** The hunter's cut: the contract rate, lowered by what they have invested. */
export function cutRate(h: Hunter): number {
  const off = Math.min(INVEST_CUT_MAX, Math.floor((h.invested ?? 0) / INVEST_STEP) * INVEST_CUT);
  return Math.max(0, Math.round((TRIBUTE_RATE[h.contractGrade] - off) * 100) / 100);
}

/** Percentage points the hunter's investments take off their cut. */
export function cutDiscount(h: Hunter): number {
  return Math.round((TRIBUTE_RATE[h.contractGrade] - cutRate(h)) * 100);
}

/** Level-up message: "에이전시 Lv.3! 장비 뽑기이(가) 열렸다." */
export function levelUpMessage(level: number): string {
  const opened = opensAt(level);
  return opened.length
    ? L(`에이전시 Lv.${level}! 새로 열림: ${opened.join(', ')}.`, `Agency Lv.${level}! Now open: ${opened.join(', ')}.`)
    : L(`에이전시 Lv.${level}!`, `Agency Lv.${level}!`);
}
