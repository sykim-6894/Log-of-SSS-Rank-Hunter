import { describe, expect, it } from 'vitest';
import { activeHunter, drawGear, newGame } from '../src/core/agency';
import { gateClearGold } from '../src/core/gates';
import { GACHA_ODDS, GACHA_PRICE, GACHA_REFUND, gearScore, MAX_TIER, rollGacha, rollGear, TOP_TIER } from '../src/core/items';
import { Rng } from '../src/core/rng';

describe('gear draw', () => {
  it('odds add up to 100% and reach tiers only the draw gives', () => {
    expect(GACHA_ODDS.reduce((s, o) => s + o.chance, 0)).toBeCloseTo(1);
    expect(Math.max(...GACHA_ODDS.map((o) => o.tier))).toBe(TOP_TIER);
    const rng = new Rng(1);
    for (let i = 0; i < 200; i++) expect(rollGear(rng, 40).tier).toBeLessThanOrEqual(MAX_TIER);
  });

  it('tiers come out near the listed odds', () => {
    const rng = new Rng(2);
    const n = 20000;
    const count = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      const t = rollGacha(rng).tier;
      count.set(t, (count.get(t) ?? 0) + 1);
    }
    for (const o of GACHA_ODDS) expect((count.get(o.tier) ?? 0) / n).toBeCloseTo(o.chance, 1);
  });

  it('costs about one A to S gate clear', () => {
    const a = gateClearGold({ id: 1, grade: 'A', theme: 'orc', closesOn: 1 });
    const s = gateClearGold({ id: 2, grade: 'S', theme: 'orc', closesOn: 1, rule: 'dark' });
    expect(GACHA_PRICE).toBeGreaterThan(a);
    expect(GACHA_PRICE).toBeLessThan(s + 500);
  });

  it('needs the gold, then wears a better piece or sells it back', () => {
    const rng = new Rng(3);
    const state = newGame(rng);
    const h = activeHunter(state)!;
    h.gold = GACHA_PRICE - 1;
    expect(drawGear(state, rng)).toBeUndefined();
    expect(h.gold).toBe(GACHA_PRICE - 1);

    h.gold = GACHA_PRICE;
    const atk = h.atk;
    const r = drawGear(state, rng)!;
    expect(r.equipped).toBe(true); // a new hunter wears nothing, so anything is better
    expect(h.gear[r.gear.slot]).toEqual(r.gear);
    expect(h.gold).toBe(0);
    expect(h.atk).toBe(atk + r.gear.atk);

    // Wearing the best there is, the next draw is sold back.
    for (const slot of ['weapon', 'shield', 'helmet', 'armor', 'boots', 'ring', 'earring'] as const) {
      h.gear[slot] = { slot, name: 'x', tier: 99, atk: 99, def: 99, hp: 999, mp: 999 };
    }
    h.gold = GACHA_PRICE;
    const r2 = drawGear(state, rng)!;
    expect(r2.equipped).toBe(false);
    expect(r2.refund).toBe(GACHA_REFUND);
    expect(h.gold).toBe(GACHA_REFUND);
    expect(gearScore(r2.old!)).toBeGreaterThan(gearScore(r2.gear));
  });
});
