import { describe, expect, it } from 'vitest';
import { activeHunter, ENHANCE_CHANCE, enhanceCost, enhanceGear, enhanceRisk, newGame, settleReturn } from '../src/core/agency';
import { createHunter } from '../src/core/hunter';
import { equipIfBetter, gearLabel, gearScore, gearStats, makeGear, MAX_PLUS, setPlus } from '../src/core/items';
import { Rng } from '../src/core/rng';
import { TowerRun } from '../src/core/run';

function setup(plus = 0) {
  const rng = new Rng(1);
  const state = newGame(rng);
  const h = activeHunter(state)!;
  equipIfBetter(h, makeGear(new Rng(2), 5, 'weapon'));
  setPlus(h, 'weapon', plus);
  state.agent.stones = 999;
  state.agent.gold = 999999;
  return { state, h, rng };
}

describe('gear enhancement', () => {
  it('each level adds stats and moves the hunter with it', () => {
    const g = makeGear(new Rng(3), 5, 'weapon');
    const base = gearStats(g).atk;
    g.plus = 3;
    expect(gearStats(g).atk).toBe(base + Math.ceil(base * 0.3));
    expect(gearLabel(g)).toBe(`+3 ${g.name}`);
    const h = createHunter(new Rng(4), 1, [], 'sword');
    const atk = h.atk;
    equipIfBetter(h, { ...g, plus: 0 });
    setPlus(h, 'weapon', 5);
    expect(h.atk).toBe(atk + gearStats(h.gear.weapon!).atk);
    setPlus(h, 'weapon', 0);
    expect(h.atk).toBe(atk + base);
  });

  it('a better found piece must beat the enhanced one to replace it', () => {
    const h = createHunter(new Rng(5), 1, [], 'sword');
    equipIfBetter(h, { ...makeGear(new Rng(6), 4, 'weapon'), plus: 8 });
    const plain = makeGear(new Rng(7), 5, 'weapon');
    expect(gearScore(plain)).toBeLessThan(gearScore(h.gear.weapon!));
    expect(equipIfBetter(h, plain).equipped).toBe(false);
  });

  it('pays stones and agency gold, and the first levels always work', () => {
    const { state, h, rng } = setup();
    const cost = enhanceCost(h.gear.weapon!);
    for (let i = 1; i <= 3; i++) {
      const r = enhanceGear(state, rng, 'weapon')!;
      expect(r.success).toBe(true);
      expect(h.gear.weapon!.plus).toBe(i);
    }
    expect(state.agent.stones).toBe(999 - 1 - 2 - 3);
    expect(cost.stones).toBe(1);
    state.agent.stones = 0;
    expect(enhanceGear(state, rng, 'weapon')).toBeUndefined();
    expect(enhanceGear(state, rng, 'shield')).toBeUndefined(); // nothing worn there
  });

  it('failing below +5 keeps the level, +5 and +6 drop one, +7 and up break the piece', () => {
    expect(ENHANCE_CHANCE).toHaveLength(MAX_PLUS);
    for (const [plus, risk] of [[4, 'none'], [5, 'drop'], [6, 'drop'], [7, 'break'], [9, 'break']] as const) {
      const { state, h } = setup(plus);
      expect(enhanceRisk(h.gear.weapon!)).toBe(risk);
      const fail = { chance: () => false } as unknown as Rng;
      const atkBefore = h.atk;
      const r = enhanceGear(state, fail, 'weapon')!;
      expect(r.success).toBe(false);
      if (risk === 'none') expect(h.gear.weapon!.plus).toBe(plus);
      if (risk === 'drop') expect(h.gear.weapon!.plus).toBe(plus - 1);
      if (risk === 'break') {
        expect(r.broken).toBe(true);
        expect(h.gear.weapon).toBeUndefined();
        expect(h.atk).toBe(atkBefore - gearStats({ ...r.gear }).atk);
      }
    }
  });

  it('stones found in a run go to the agency store on return', () => {
    const rng = new Rng(8);
    const state = newGame(rng);
    settleReturn(state, rng, 0, [], false, 4);
    expect(state.agent.stones).toBe(4);
  });

  it('monsters and bosses drop stones in a run', () => {
    const h = createHunter(new Rng(9), 1, [], 'sword');
    h.atk = 999;
    const run = new TowerRun(h, new Rng(9), { startFloor: 5 });
    const boss = run.monsters.find((m) => m.kind.boss)!;
    expect(boss).toBeDefined();
    (run as unknown as { hitMonster: (m: unknown, d: number) => void }).hitMonster(boss, 99999);
    expect(run.stones).toBeGreaterThanOrEqual(3);
    expect(run.snapshot().stones).toBe(run.stones);
  });
});
