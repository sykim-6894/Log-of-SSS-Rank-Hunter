import { describe, expect, it } from 'vitest';
import { createHunter } from '../src/core/hunter';
import { Rng } from '../src/core/rng';
import { TowerRun } from '../src/core/run';

describe('first climb', () => {
  it('floor 1 has two monsters and one chest on the first climb', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const run = new TowerRun(createHunter(new Rng(seed), 1), new Rng(seed), { easyFirst: true });
      expect(run.monsters.length).toBeLessThanOrEqual(2);
      expect(run.chests.length).toBe(1);
    }
  });

  it('later floors and normal climbs are unchanged', () => {
    let normal = 0;
    for (let seed = 1; seed <= 20; seed++) {
      normal += new TowerRun(createHunter(new Rng(seed), 1), new Rng(seed)).monsters.length;
      const easy = new TowerRun(createHunter(new Rng(seed), 1), new Rng(seed), { easyFirst: true, startFloor: 2 });
      expect(easy.monsters.length).toBeGreaterThan(2);
    }
    expect(normal / 20).toBeGreaterThan(4);
  });
});
