import { L } from './lang';

/**
 * The abyss above floor 20 goes on forever. Every few floors a new abyss rule joins the
 * ones already in force, and each rule in force raises the gold earned there.
 */
export type AbyssRule = 'fury' | 'iron' | 'dim' | 'horde' | 'drain';

export const ABYSS_RULES: Record<AbyssRule, { name: string; text: string }> = {
  fury: { name: L('광기', 'Fury'), text: L('적 공격 +15%', 'Enemy ATK +15%') },
  iron: { name: L('강철', 'Iron'), text: L('적 체력 +20%', 'Enemy HP +20%') },
  dim: { name: L('암흑', 'Gloom'), text: L('시야 -1', 'Sight -1') },
  horde: { name: L('군세', 'Horde'), text: L('적 수 +25%', 'Enemies +25%') },
  drain: { name: L('고갈', 'Drain'), text: L('체력·마나 회복 절반', 'HP and MP regen halved') },
};

export const ABYSS_RULE_IDS = Object.keys(ABYSS_RULES) as AbyssRule[];

/** A new rule every this many abyss floors. */
export const ABYSS_RULE_EVERY = 3;
/** Extra gold per rule in force. */
export const ABYSS_GOLD_PER_RULE = 0.1;
/** A milestone reward every this many abyss floors. */
export const ABYSS_MILESTONE = 10;

/** Rules in force at this abyss depth. */
export function abyssRuleCount(depth: number): number {
  return Math.floor(depth / ABYSS_RULE_EVERY);
}

export function stacks(rules: AbyssRule[], rule: AbyssRule): number {
  return rules.filter((r) => r === rule).length;
}

/** "광기×2 · 강철" */
export function rulesLine(rules: AbyssRule[]): string {
  return ABYSS_RULE_IDS.filter((r) => rules.includes(r))
    .map((r) => {
      const n = stacks(rules, r);
      return n > 1 ? `${ABYSS_RULES[r].name}×${n}` : ABYSS_RULES[r].name;
    })
    .join(' · ');
}

/** First time a hunter reaches abyss 10, 20, 30...: mana stones and a high-tier piece of gear. */
export function milestoneReward(depth: number): { stones: number; tier: number } {
  const k = Math.floor(depth / ABYSS_MILESTONE);
  return { stones: 5 * k, tier: Math.min(9, 6 + k) };
}
