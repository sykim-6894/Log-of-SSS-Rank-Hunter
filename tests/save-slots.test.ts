import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/agency';
import { createHunter } from '../src/core/hunter';
import { Rng } from '../src/core/rng';
import { loadFromSlot, loadGame, saveGame, saveToSlot, SAVE_SLOTS, slotSummary } from '../src/core/save';

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('save slots', () => {
  it('has three slots, empty at first', () => {
    const s = memory();
    expect(SAVE_SLOTS).toBe(3);
    for (let i = 0; i < SAVE_SLOTS; i++) expect(slotSummary(s, i)).toBeUndefined();
    expect(loadFromSlot(s, 0)).toBeUndefined();
  });

  it('keeps a copy apart from the autosave and loads it back', () => {
    const rng = new Rng(7);
    const state = newGame(rng);
    state.agent.name = '새벽';
    state.agent.gold = 1234;
    state.slots[0] = createHunter(rng, 999);
    state.slots[0].name = '한서';
    state.slots[0].level = 9;
    const s = memory();
    saveGame(s, state);
    saveToSlot(s, 1, state, new Date('2026-11-25T09:40:00Z'));

    const sum = slotSummary(s, 1)!;
    expect(sum).toMatchObject({ agency: '새벽', gold: 1234, hunters: 1, hunter: { name: '한서', level: 9 } });
    expect(slotSummary(s, 0)).toBeUndefined();

    // Playing on changes the autosave, not the slot.
    state.agent.gold = 5;
    saveGame(s, state);
    expect(loadGame(s)!.agent.gold).toBe(5);
    const back = loadFromSlot(s, 1)!;
    expect(back.agent.gold).toBe(1234);
    expect(back.slots[0]!.name).toBe('한서');
  });

  it('ignores a broken slot', () => {
    const s = memory();
    s.setItem('sss-hunter-slot-3', '{oops');
    expect(slotSummary(s, 2)).toBeUndefined();
    expect(loadFromSlot(s, 2)).toBeUndefined();
  });
});
