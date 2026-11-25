import { describe, expect, it } from 'vitest';
import { activeHunter, invest, newGame, settleReturn, slotOpen, trainingCost } from '../src/core/agency';
import { AGENCY_LEVEL_EXP, agencyLevel, cutRate, levelProgress, MAX_AGENCY_LEVEL, openSlots, unlocked } from '../src/core/agencyLevel';
import { buyPerk } from '../src/core/legacy';
import { Rng } from '../src/core/rng';
import { parseSave } from '../src/core/save';

describe('agency level', () => {
  it('a new agency starts at level 1 with only the basics open', () => {
    const state = newGame(new Rng(1));
    expect(agencyLevel(state.agent)).toBe(1);
    expect(unlocked(state.agent, 'gates')).toBe(false);
    expect(unlocked(state.agent, 'gacha')).toBe(false);
    expect(openSlots(state.agent)).toBe(1);
    expect(slotOpen(state, 0)).toBe(true);
    expect(slotOpen(state, 1)).toBe(false);
  });

  it('levels open features in order', () => {
    const a = { exp: 0 };
    const at = (lv: number) => { a.exp = AGENCY_LEVEL_EXP[lv - 1]; };
    at(2);
    expect(unlocked(a, 'gates')).toBe(true);
    expect(unlocked(a, 'gacha')).toBe(false);
    expect(openSlots(a)).toBe(2);
    at(3);
    expect(unlocked(a, 'gacha')).toBe(true);
    expect(unlocked(a, 'enhance')).toBe(false);
    at(4);
    expect(unlocked(a, 'enhance')).toBe(true);
    expect(unlocked(a, 'arena')).toBe(false);
    at(5);
    expect(unlocked(a, 'arena') && unlocked(a, 'duel')).toBe(true);
    expect(openSlots(a)).toBe(3);
    at(6);
    expect(unlocked(a, 'dispatch')).toBe(true);
    expect(unlocked(a, 'scout')).toBe(false);
    at(7);
    expect(unlocked(a, 'scout')).toBe(true);
    at(8);
    expect(agencyLevel(a)).toBe(MAX_AGENCY_LEVEL);
    expect(levelProgress(a)).toBeUndefined();
  });

  it('the cut paid on return is agency experience', () => {
    const state = newGame(new Rng(2));
    const r = settleReturn(state, new Rng(2), 400);
    expect(state.agent.exp).toBe(r.tribute);
    expect(r.agencyUp).toBe(2);
  });

  it('investing moves the hunter\'s gold, counts 1.5x and lowers the cut', () => {
    const state = newGame(new Rng(3));
    const h = activeHunter(state)!;
    const base = cutRate(h);
    h.gold = 1200;
    const funds = state.agent.gold;
    const r = invest(state, 1000)!;
    expect(r.amount).toBe(1000);
    expect(h.gold).toBe(200);
    expect(state.agent.gold).toBe(funds + 1000);
    expect(state.agent.exp).toBe(1500);
    expect(r.levelUp).toBe(3);
    expect(cutRate(h)).toBeCloseTo(base - 0.04);
    h.gold = 10000;
    invest(state, 10000);
    expect(cutRate(h)).toBeCloseTo(base - 0.1);
    expect(invest(state, 50)).toBeUndefined();
  });

  it('the top level makes training cheaper and lifts legacy caps', () => {
    const state = newGame(new Rng(4));
    const h = activeHunter(state)!;
    expect(trainingCost(h, 'atk', undefined, MAX_AGENCY_LEVEL)).toBe(18);
    const legacy = { points: 100, perks: { potion: 2 } };
    expect(buyPerk(legacy, 'potion')).toBe(false);
    expect(buyPerk(legacy, 'potion', 1)).toBe(true);
  });

  it('older saves count the cut so far and keep everything open', () => {
    const state = newGame(new Rng(5));
    state.day = 12;
    activeHunter(state)!.totalTribute = 700;
    delete (state.agent as { exp?: number }).exp;
    const back = parseSave(JSON.stringify(state))!;
    expect(back.agent.exp).toBe(700);
    expect(back.agent.allOpen).toBe(true);
    expect(unlocked(back.agent, 'arena')).toBe(true);
    expect(openSlots(back.agent)).toBe(3);
  });
});
