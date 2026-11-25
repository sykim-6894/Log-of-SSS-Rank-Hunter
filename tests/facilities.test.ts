import { describe, expect, it } from 'vitest';
import {
  activeHunter, canDispatch, depositGear, dispatch, hire, hireScout, isAway, newGame, scoutCandidates, sellStashed,
  settleReturn, STASH_SIZE, stashFee, storeSpare, withdrawGear,
} from '../src/core/agency';
import { AGENCY_LEVEL_EXP } from '../src/core/agencyLevel';
import { combatPower } from '../src/core/hunter';
import { gearLevel, makeGear } from '../src/core/items';
import { Rng } from '../src/core/rng';
import { TowerRun } from '../src/core/run';

function at(level: number, seed = 1) {
  const state = newGame(new Rng(seed));
  state.agent.exp = AGENCY_LEVEL_EXP[level - 1];
  return state;
}

describe('gear storage', () => {
  it('gear has a level: tier 1 is Lv.1, tier 9 is Lv.16', () => {
    expect(gearLevel({ tier: 1 })).toBe(1);
    expect(gearLevel({ tier: 5 })).toBe(8);
    expect(gearLevel({ tier: 9 })).toBe(16);
  });

  it('runs keep swapped-out gear only when the agency has storage', () => {
    const rng = new Rng(2);
    const state = newGame(rng);
    const h = activeHunter(state)!;
    const run = new TowerRun(h, rng, { keepSpare: true });
    (run as unknown as { takeGear: (g: unknown) => void }).takeGear(makeGear(rng, 2, 'weapon'));
    (run as unknown as { takeGear: (g: unknown) => void }).takeGear(makeGear(rng, 4, 'weapon'));
    (run as unknown as { takeGear: (g: unknown) => void }).takeGear(makeGear(rng, 1, 'weapon'));
    expect(run.spare.map((g) => g.tier)).toEqual([2, 1]);
    const back = TowerRun.restore(JSON.parse(JSON.stringify(run.snapshot())), h, rng)!;
    expect(back.spare).toHaveLength(2);
    expect(storeSpare(state, run.spare)).toBe(2);
    expect(state.agent.stash).toHaveLength(2);
  });

  it('storage holds 12; taking out needs the level and the fee, and swaps', () => {
    const rng = new Rng(3);
    const state = at(4, 3);
    const h = activeHunter(state)!;
    const big = makeGear(rng, 6, 'weapon');
    const small = makeGear(rng, 1, 'weapon');
    storeSpare(state, [big, small]);
    state.agent.gold = 10000;
    expect(withdrawGear(state, 0)).toEqual({ ok: false, reason: 'level' });
    const r = withdrawGear(state, 1);
    expect(r.ok).toBe(true);
    expect(h.gear.weapon).toBe(small);
    expect(state.agent.gold).toBe(10000 - stashFee(small));
    h.level = 10;
    state.agent.gold = 0;
    expect(withdrawGear(state, 0)).toEqual({ ok: false, reason: 'gold' });
    state.agent.gold = 10000;
    const before = combatPower(h);
    expect(withdrawGear(state, 0).ok).toBe(true);
    expect(h.gear.weapon).toBe(big);
    expect(combatPower(h)).toBeGreaterThan(before);
    expect(state.agent.stash).toContain(small);
    expect(depositGear(state, 'weapon')).toBe(true);
    expect(h.gear.weapon).toBeUndefined();
    expect(sellStashed(state, 0)).toBeGreaterThan(0);
    storeSpare(state, Array.from({ length: 20 }, () => makeGear(rng, 1)));
    expect(state.agent.stash).toHaveLength(STASH_SIZE);
  });
});

describe('dispatch', () => {
  it('needs level 6 and someone left at home', () => {
    const rng = new Rng(4);
    const low = at(5, 4);
    hire(low, rng, 1);
    expect(canDispatch(low, 1)).toBe(false);
    const state = at(6, 4);
    expect(canDispatch(state, 0)).toBe(false);
    hire(state, rng, 1);
    expect(canDispatch(state, 1)).toBe(true);
    expect(dispatch(state, 1)).toBe(true);
    expect(canDispatch(state, 0)).toBe(false);
  });

  it('a dispatched hunter comes back at the next return with pay and experience', () => {
    const rng = new Rng(5);
    const state = at(6, 5);
    const away = hire(state, rng, 1)!;
    away.bestFloor = 10;
    expect(dispatch(state, 1)).toBe(true);
    expect(state.activeSlot).toBe(0);
    const exp = away.exp;
    const r = settleReturn(state, rng, 100);
    expect(isAway(away)).toBe(false);
    expect(r.dispatched).toHaveLength(1);
    expect(r.dispatched![0].tribute).toBeGreaterThan(0);
    expect(away.gold).toBeGreaterThan(0);
    expect(away.exp !== exp || away.level > 1).toBe(true);
  });
});

describe('scout center', () => {
  it('offers three candidates a day with a talent, and signs one', () => {
    const rng = new Rng(6);
    const state = at(7, 6);
    const list = scoutCandidates(state, rng);
    expect(list).toHaveLength(3);
    expect(list.every((h) => !!h.talent && h.level >= 1 && h.level <= 3)).toBe(true);
    expect(scoutCandidates(state, rng)).toBe(list);
    const pick = list[1];
    const h = hireScout(state, 1, 1)!;
    expect(h).toBe(pick);
    expect(h.id).toBeGreaterThan(0);
    expect(state.slots[1]).toBe(h);
    expect(state.scouts!.list).toHaveLength(2);
    state.day = (state.day ?? 0) + 1;
    expect(scoutCandidates(state, rng)).toHaveLength(3);
  });
});
