import { describe, expect, it } from 'vitest';
import { abyssRuleCount, milestoneReward } from '../src/core/abyss';
import { activeHunter, canRetire, gradeIn, hire, newGame, ranking, retire, settleReturn, train, trainingCost } from '../src/core/agency';
import { createHunter } from '../src/core/hunter';
import { buyPerk } from '../src/core/legacy';
import { TOP_FLOOR } from '../src/core/monsters';
import { Rng } from '../src/core/rng';
import { TowerRun } from '../src/core/run';

describe('abyss', () => {
  it('a rule joins every 3 abyss floors and raises the gold', () => {
    expect(abyssRuleCount(2)).toBe(0);
    expect(abyssRuleCount(9)).toBe(3);
    const h = createHunter(new Rng(1), 1);
    const run = new TowerRun(h, new Rng(1), { startFloor: TOP_FLOOR + 6 });
    expect(run.abyssRules.length).toBe(2);
    const again = TowerRun.restore(run.snapshot(), h, new Rng(2))!;
    expect(again.abyssRules).toEqual(run.abyssRules);
  });

  it('first time at abyss 10: stones and strong gear, only once per hunter', () => {
    expect(milestoneReward(10)).toEqual({ stones: 5, tier: 7 });
    expect(milestoneReward(30).tier).toBe(9);
    const h = createHunter(new Rng(1), 1);
    const run = new TowerRun(h, new Rng(1), { startFloor: TOP_FLOOR + 10 });
    expect(run.stones).toBe(5);
    expect(h.abyssBest).toBe(10);
    const second = new TowerRun(h, new Rng(3), { startFloor: TOP_FLOOR + 10 });
    expect(second.stones).toBe(0);
  });

  it('the tower below floor 21 is untouched', () => {
    const run = new TowerRun(createHunter(new Rng(1), 1), new Rng(1), { startFloor: 15 });
    expect(run.abyssRules).toEqual([]);
  });
});

describe('retirement and legacy', () => {
  it('only S-rank or better may retire; an SSS retires as a legend worth 10 points', () => {
    const state = newGame(new Rng(4));
    const h = activeHunter(state)!;
    expect(canRetire(state, h)).toBe(false);
    expect(retire(state, 0)).toBeUndefined();
    h.beaten = state.world.map((w) => w.id);
    expect(gradeIn(state, h)).toBe('SSS');
    const r = retire(state, 0)!;
    expect(r.legend).toBe(true);
    expect(state.agent.legacy?.points).toBe(10);
    expect(state.slots[0]).toBeNull();
    const entry = state.hallOfFame.find((e) => e.id === h.id)!;
    expect(entry.retired && entry.legend).toBe(true);
    // Off the ranking: the next hunter can become #1 again.
    expect(ranking(state).some((row) => row.id === h.id)).toBe(false);
  });

  it('perks cost 1, 2, 3... points and change the agency for good', () => {
    const state = newGame(new Rng(5));
    state.agent.legacy = { points: 6, perks: {} };
    const legacy = state.agent.legacy;
    expect(buyPerk(legacy, 'train')).toBe(true);
    expect(buyPerk(legacy, 'train')).toBe(true);
    expect(legacy.points).toBe(3);
    const h = activeHunter(state)!;
    expect(trainingCost(h, 'atk', legacy)).toBe(16);
    state.agent.gold = 100;
    train(state, 'atk');
    expect(state.agent.gold).toBe(84);

    expect(buyPerk(legacy, 'rookie')).toBe(true);
    expect(buyPerk(legacy, 'potion')).toBe(true);
    expect(legacy.points).toBe(1);
    expect(buyPerk(legacy, 'stones')).toBe(true);
    expect(buyPerk(legacy, 'stones')).toBe(false);
    const rookie = hire(state, new Rng(9), 1)!;
    const plain = createHunter(new Rng(9), 99, [], rookie.cls);
    expect(rookie.atk).toBe(plain.atk + 1);
    expect(rookie.bag.hp).toBe(2);

    state.activeSlot = 0;
    const r = settleReturn(state, new Rng(1), 0, [], false, 10);
    expect(r.stones).toBe(12);
  });
});
