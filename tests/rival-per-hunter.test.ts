import { describe, expect, it } from 'vitest';
import { newGame, ranking, rivalTag, settleReturn, SPARE_BOOST } from '../src/core/agency';
import { combatPower, createHunter, Hunter } from '../src/core/hunter';
import { Rng } from '../src/core/rng';
import { TowerRun } from '../src/core/run';

function rivalOf(target: Hunter, id: number): Hunter {
  const r = createHunter(new Rng(id), id, [], 'mage');
  r.origin = 'rival';
  r.rivalOf = target.id;
  return r;
}

describe('one rival per hunter', () => {
  it("another hunter's rival never turns up in this hunter's run", () => {
    const me = createHunter(new Rng(1), 1, [], 'sword');
    const other = createHunter(new Rng(2), 2, [], 'sword');
    const theirs = rivalOf(other, 90);
    for (let seed = 1; seed <= 40; seed++) {
      const run = new TowerRun(me, new Rng(seed), { rivals: [theirs], encounterChance: 1 });
      for (let f = 2; f <= 6; f++) run.enterFloor(f);
      expect(run.monsters.some((m) => m.hunter)).toBe(false);
    }
  });

  it('my own rival does turn up, named as mine', () => {
    const me = createHunter(new Rng(1), 1, [], 'sword');
    const mine = rivalOf(me, 91);
    let met = false;
    for (let seed = 1; seed <= 40 && !met; seed++) {
      const run = new TowerRun(me, new Rng(seed), { rivals: [mine], encounterChance: 1 });
      run.enterFloor(2);
      if (run.monsters.some((m) => m.hunter === mine)) {
        met = true;
        expect(run.log.some((l) => l.includes(`${me.name}의 라이벌`))).toBe(true);
      }
    }
    expect(met).toBe(true);
  });

  it('the ranking says whose rival they are', () => {
    const state = newGame(new Rng(3));
    const me = state.slots[0]!;
    const r = rivalOf(me, 92);
    r.maxHp = 99999;
    state.rival.roster.push(r);
    expect(rivalTag(state, r)).toBe(`${me.name}의 라이벌`);
    expect(ranking(state).find((row) => row.id === r.id)?.note).toContain(`${me.name}의 라이벌`);
  });

  it('a rival let go with a reward comes back much stronger, and stays ahead', () => {
    const rng = new Rng(4);
    const state = newGame(rng);
    const me = state.slots[0]!;
    const r = rivalOf(me, 93);
    state.rival.roster.push(r);
    const atk = r.atk;
    const before = combatPower(r);
    settleReturn(state, rng, 0, [{ hunterId: r.id, finished: false }]);
    expect(r.spared).toBe(1);
    expect(r.atk).toBeGreaterThanOrEqual(Math.round((atk + 2) * (1 + SPARE_BOOST.rival)) - 2);
    expect(combatPower(r)).toBeGreaterThan(before * 1.3);
  });
});

describe('old colleagues at the rival agency', () => {
  const former = (power: 'strong' | 'weak') => {
    const h = createHunter(new Rng(5), 95, [], 'sword');
    h.origin = 'scouted';
    if (power === 'strong') { h.level = 30; h.maxHp = h.hp = 900; h.atk = 150; h.def = 80; }
    return h;
  };

  it('a much stronger one never meets a new, weak hunter', () => {
    const me = createHunter(new Rng(1), 1, [], 'sword');
    const big = former('strong');
    for (let seed = 1; seed <= 40; seed++) {
      const run = new TowerRun(me, new Rng(seed), { rivals: [big], encounterChance: 1 });
      for (let f = 2; f <= 6; f++) run.enterFloor(f);
      expect(run.monsters.some((m) => m.hunter)).toBe(false);
    }
  });

  it('one of about the same strength still turns up', () => {
    const me = createHunter(new Rng(1), 1, [], 'sword');
    const peer = former('weak');
    let met = false;
    for (let seed = 1; seed <= 40 && !met; seed++) {
      const run = new TowerRun(me, new Rng(seed), { rivals: [peer], encounterChance: 1 });
      run.enterFloor(2);
      met = run.monsters.some((m) => m.hunter === peer);
    }
    expect(met).toBe(true);
  });
});
