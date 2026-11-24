import { describe, expect, it } from 'vitest';
import { activeHunter, canChallenge, gradeIn, newGame, nextChallenge, ranking, settleDuel, startDuel, startFloors } from '../src/core/agency';
import { botAction } from '../src/core/bot';
import { combatPower, Hunter } from '../src/core/hunter';
import { TOP_FLOOR } from '../src/core/monsters';
import { Rng } from '../src/core/rng';
import { TowerRun } from '../src/core/run';

function strong(h: Hunter, power: number) {
  while (combatPower(h) < power) {
    h.atk += 2;
    h.def += 1;
    h.maxHp += 10;
  }
  h.hp = h.maxHp;
}

function fight(h: Hunter, seed: number) {
  const state = newGame(new Rng(seed));
  state.slots[0] = h;
  const duel = startDuel(state)!;
  const run = new TowerRun(h, new Rng(seed), { duel });
  for (let i = 0; i < 400 && run.status === 'playing'; i++) run.act(botAction(run));
  return { state, duel, run };
}

describe('ranker challenge', () => {
  it('power alone cannot pass the rankers: the top 10 stays theirs', () => {
    const state = newGame(new Rng(1));
    const h = activeHunter(state)!;
    strong(h, 99999);
    expect(ranking(state).some((r) => r.id === h.id)).toBe(false);
    expect(gradeIn(state, h)).toBe('A');
    h.beaten = [nextChallenge(state, h)!.ranker.id];
    expect(ranking(state).findIndex((r) => r.id === h.id)).toBe(9);
    expect(gradeIn(state, h)).toBe('S');
  });

  it('challenges go up one ranker at a time, once a day', () => {
    const state = newGame(new Rng(2));
    const h = activeHunter(state)!;
    const first = nextChallenge(state, h)!;
    expect(first.ranker.score).toBe(Math.min(...state.world.map((w) => w.score)));
    expect(canChallenge(state, h)).toBe(true);
    const duel = startDuel(state)!;
    expect(duel.rankerId).toBe(first.ranker.id);
    expect(canChallenge(state, h)).toBe(false);
    expect(startDuel(state)).toBeUndefined();
    duel.won = true;
    expect(settleDuel(state, duel)).toBe(true);
    expect(nextChallenge(state, h)!.ranker.score).toBeGreaterThan(first.ranker.score);
    state.day = (state.day ?? 0) + 1;
    expect(canChallenge(state, h)).toBe(true);
  });

  it('a loss changes nothing', () => {
    const state = newGame(new Rng(3));
    const duel = startDuel(state)!;
    duel.won = false;
    expect(settleDuel(state, duel)).toBe(false);
    expect(activeHunter(state)!.beaten ?? []).toHaveLength(0);
  });

  it('beating every ranker makes the hunter #1', () => {
    const state = newGame(new Rng(4));
    const h = activeHunter(state)!;
    h.beaten = state.world.map((w) => w.id);
    expect(nextChallenge(state, h)).toBeUndefined();
    expect(ranking(state)[0].id).toBe(h.id);
    expect(gradeIn(state, h)).toBe('SSS');
  });

  it('a much stronger hunter wins the duel in the arena; a weak one comes home alive', () => {
    const state = newGame(new Rng(5));
    const big = activeHunter(state)!;
    strong(big, nextChallenge(state, big)!.ranker.score * 3);
    const win = fight(big, 5);
    expect(win.run.status).toBe('returned');
    expect(win.duel.won).toBe(true);
    expect(win.run.placeName).toBe('결투장');

    const small = activeHunter(newGame(new Rng(6)))!;
    const loss = fight(small, 6);
    expect(loss.run.status).toBe('returned');
    expect(loss.duel.won).toBe(false);
    expect(small.hp).toBeGreaterThan(0);
  });
});

describe('the abyss', () => {
  it('the tower goes on past floor 20 as the abyss', () => {
    const state = newGame(new Rng(7));
    const h = activeHunter(state)!;
    const run = new TowerRun(h, new Rng(7), { startFloor: TOP_FLOOR });
    expect(run.isTopFloor).toBe(false);
    run.enterFloor(TOP_FLOOR + 3);
    expect(run.inAbyss).toBe(true);
    expect(run.placeName).toBe('심연 3층');
    expect(h.bestFloor).toBe(TOP_FLOOR);
    expect(h.abyssBest).toBe(3);
  });

  it('runs may start in the abyss in steps of five', () => {
    const state = newGame(new Rng(8));
    const h = activeHunter(state)!;
    h.bestFloor = TOP_FLOOR;
    expect(startFloors(state, h)).not.toContain(TOP_FLOOR + 1);
    h.abyssBest = 1;
    expect(startFloors(state, h)).toContain(TOP_FLOOR + 1);
    h.abyssBest = 7;
    expect(startFloors(state, h).at(-1)).toBe(TOP_FLOOR + 6);
  });
});
