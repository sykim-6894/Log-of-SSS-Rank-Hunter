import { describe, expect, it } from 'vitest';
import { activeHunter, newGame, settleDeath, settleReturn, upgradeScoutGear } from '../src/core/agency';
import { createHunter } from '../src/core/hunter';
import { gearScore, GEAR_SLOTS, makeGear, MAX_TIER } from '../src/core/items';
import { Rng } from '../src/core/rng';

const totalGear = (h: { gear: Partial<Record<string, { tier: number }>> }) =>
  Object.values(h.gear).reduce((s, g) => s + (g?.tier ?? 0), 0);

describe('gear of scouted hunters', () => {
  it('a hunter scouted on death comes with better gear', () => {
    const rng = new Rng(1);
    const state = newGame(rng);
    const h = activeHunter(state)!;
    h.everSSS = true; // always scouted
    h.bestFloor = 6;
    h.gear.weapon = makeGear(new Rng(2), 3, 'weapon');
    const before = totalGear(h);
    const atk = h.atk;
    const d = settleDeath(state, rng, '오크');
    expect(d.scouted).toBe(true);
    expect(d.newGear?.length).toBe(2);
    expect(totalGear(h)).toBeGreaterThan(before);
    expect(h.atk).toBeGreaterThanOrEqual(atk);
    expect(state.rival.roster).toContain(h);
  });

  it('one upgrade makes one slot better, and stops at the top drop tier', () => {
    const h = createHunter(new Rng(3), 1, [], 'sword');
    h.bestFloor = 4;
    const g = upgradeScoutGear(h, new Rng(4))!;
    expect(h.gear[g.slot]).toEqual(g);
    for (const slot of GEAR_SLOTS) h.gear[slot] = makeGear(new Rng(5), MAX_TIER, slot);
    // Already at the top tier everywhere: nothing more to give, unless a reroll beats it.
    const scores = GEAR_SLOTS.map((s) => gearScore(h.gear[s]!));
    upgradeScoutGear(h, new Rng(6));
    GEAR_SLOTS.forEach((s, i) => expect(gearScore(h.gear[s]!)).toBe(scores[i]));
  });

  it('scouted hunters keep getting better gear at the rival agency over the days', () => {
    const rng = new Rng(7);
    const state = newGame(rng);
    const s = createHunter(new Rng(8), 90, [], 'archer');
    s.origin = 'scouted';
    s.bestFloor = 5;
    state.rival.roster.push(s);
    const before = totalGear(s);
    for (let i = 0; i < 20; i++) settleReturn(state, rng, 0);
    expect(totalGear(s)).toBeGreaterThan(before + 2);
  });
});
