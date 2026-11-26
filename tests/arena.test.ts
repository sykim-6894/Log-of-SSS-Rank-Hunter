import { describe, expect, it } from 'vitest';
import { activeHunter, arenaRecord, canEnterArena, newGame, startSurvival } from '../src/core/agency';
import { botAction } from '../src/core/bot';
import { Rng } from '../src/core/rng';
import { TowerRun, waveCount, waveHeal, waveReward } from '../src/core/run';

function arena(seed: number, beef = 0) {
  const state = newGame(new Rng(seed));
  const h = activeHunter(state)!;
  h.bestFloor = 5;
  h.atk += beef;
  h.def += Math.floor(beef / 3);
  h.maxHp += beef * 10;
  h.hp = h.maxHp;
  const survival = startSurvival(state)!;
  const run = new TowerRun(h, new Rng(seed), { survival });
  return { state, h, run, survival };
}

/** Fights waves with the bot, going on after each clear until `stopAt` waves are done. */
function play(run: TowerRun, stopAt: number) {
  for (let i = 0; i < 4000 && run.status !== 'returned'; i++) {
    if (run.status === 'onStairs') {
      if (run.survival!.wave >= stopAt) run.retreat();
      else run.climb();
      continue;
    }
    if (run.status !== 'playing') break;
    run.act(botAction(run));
  }
}

describe('survival arena', () => {
  it('opens after floor 5, once a day', () => {
    const state = newGame(new Rng(1));
    const h = activeHunter(state)!;
    expect(canEnterArena(state, h)).toBe(false);
    h.bestFloor = 5;
    expect(canEnterArena(state, h)).toBe(true);
    expect(startSurvival(state)).toBeDefined();
    expect(canEnterArena(state, h)).toBe(false);
    expect(startSurvival(state)).toBeUndefined();
    state.day = (state.day ?? 0) + 1;
    expect(canEnterArena(state, h)).toBe(true);
  });

  it('the first wave comes in awake, away from the hunter', () => {
    const { run } = arena(2);
    expect(run.survival!.wave).toBe(1);
    expect(run.placeName).toContain('1');
    expect(run.monsters.length).toBe(waveCount(1));
    expect(run.monsters.every((m) => m.awake)).toBe(true);
    expect(run.inAbyss).toBe(false);
  });

  it('waves get bigger; every 5th brings a boss and stones, every 10th gear', () => {
    expect(waveCount(10)).toBeGreaterThan(waveCount(1));
    expect(waveCount(100)).toBe(12);
    expect(waveReward(5).stones).toBeGreaterThan(0);
    expect(waveReward(4).stones).toBe(0);
    expect(waveReward(10).tier).toBe(6);
    expect(waveReward(9).tier).toBe(0);
  });

  it('only champion waves give health and mana back', () => {
    expect(waveHeal(1)).toBe(0);
    expect(waveHeal(4)).toBe(0);
    expect(waveHeal(5)).toBe(0.3);
    expect(waveHeal(10)).toBe(0.3);
    const { h, run } = arena(6, 60);
    h.hp = Math.floor(h.maxHp / 2);
    h.mp = 0;
    run.monsters.length = 0;
    run.act(botAction(run));
    expect(run.status).toBe('onStairs');
    expect(h.hp).toBeLessThanOrEqual(Math.floor(h.maxHp / 2));
    expect(h.mp).toBeLessThan(Math.ceil(h.maxMp * 0.3));
  });

  it('a strong hunter clears waves, banks the gold and keeps the record', () => {
    const { state, h, run } = arena(3, 60);
    play(run, 3);
    expect(run.status).toBe('returned');
    expect(run.survival!.fell).toBeFalsy();
    expect(run.survival!.wave).toBe(3);
    expect(h.arenaBest).toBe(3);
    expect(run.runGold).toBeGreaterThan(0);
    expect(arenaRecord(state)).toEqual({ wave: 3, name: h.name });
  });

  it('falling is not death: the hunter keeps what was banked', () => {
    const { h, run } = arena(4);
    play(run, 999);
    expect(run.status).toBe('returned');
    expect(run.survival!.fell).toBe(true);
    expect(h.hp).toBe(1);
    expect(run.runGold).toBe(run.survival!.banked);
  });

  it('survives a save and restore mid-wave', () => {
    const { h, run } = arena(5, 30);
    run.act(botAction(run));
    const back = TowerRun.restore(JSON.parse(JSON.stringify(run.snapshot())), h, new Rng(5))!;
    expect(back.survival!.wave).toBe(run.survival!.wave);
    expect(back.monsters.length).toBe(run.monsters.length);
  });
});
