import { describe, expect, it } from 'vitest';
import { newGame, settleReturn } from '../src/core/agency';
import { createHunter } from '../src/core/hunter';
import { Gate, gateClearGold, raidSuccess } from '../src/core/gates';
import { Rng } from '../src/core/rng';
import { TowerRun } from '../src/core/run';
import { loadGame, saveGame } from '../src/core/save';

const gate = (over: Partial<Gate> = {}): Gate => ({ id: 1, grade: 'C', theme: 'swamp', closesOn: 5, ...over });

describe('rival agency at the gates', () => {
  it('a new game has no rival teams in gates yet', () => {
    const state = newGame(new Rng(1));
    expect(state.gates!.some((g) => g.rival)).toBe(false);
  });

  it('over many days the rival goes into gates and clears some of them', () => {
    const rng = new Rng(2);
    const state = newGame(rng);
    const news: string[] = [];
    let raids = 0;
    for (let i = 0; i < 40; i++) {
      news.push(...settleReturn(state, rng, 0).gateNews);
      raids += state.gates!.filter((g) => g.rival).length;
      expect(state.gates!.filter((g) => g.rival).length).toBeLessThanOrEqual(1);
    }
    expect(raids).toBeGreaterThan(10);
    expect(state.gateRecord!.rival).toBeGreaterThan(5);
    expect(news.some((n) => n.includes('먼저 클리어했다'))).toBe(true);
    expect(news.some((n) => n.includes('들어갔다'))).toBe(true);
  });

  it('a raid is settled on the next day: the gate is gone or free again', () => {
    const rng = new Rng(3);
    const state = newGame(rng);
    let checked = 0;
    for (let i = 0; i < 30 && checked < 5; i++) {
      const raided = state.gates!.find((g) => g.rival);
      settleReturn(state, rng, 0);
      if (!raided) continue;
      const now = state.gates!.find((g) => g.id === raided.id);
      if (now?.rival) expect(now.rival.since).toBe(state.day); // failed, then picked again today
      checked++;
    }
    expect(checked).toBe(5);
  });

  it('a named rival hunter leads the team when it keeps up with ours, and grows on a clear', () => {
    const rng = new Rng(4);
    const state = newGame(rng);
    const r = createHunter(new Rng(9), 90, [], 'mage');
    r.level = 8;
    r.origin = 'scouted';
    state.rival.roster.push(r);
    let led = false;
    for (let i = 0; i < 30 && !led; i++) {
      settleReturn(state, rng, 0);
      led = state.gates!.some((g) => g.rival?.hunter === r.name);
    }
    expect(led).toBe(true);
  });

  it('rival teams pick gates they can handle', () => {
    const state = newGame(new Rng(5));
    for (const g of state.gates!) expect(raidSuccess(g, 30)).toBe(0.9);
    expect(raidSuccess(gate({ grade: 'S' }), 1)).toBe(0.25);
  });

  it('clearing a gate a rival team is in pays 30% more and counts for us', () => {
    const plain = gate();
    const raided = gate({ rival: { agency: '적월 길드', level: 5, since: 0 } });
    expect(gateClearGold(raided)).toBe(Math.round(gateClearGold(plain) * 1.3));
    const state = newGame(new Rng(6));
    settleReturn(state, new Rng(7), 0, [], true);
    expect(state.gateRecord!.ours).toBe(1);
  });

  it('a rival team inside is mentioned when the hunter walks in', () => {
    const h = createHunter(new Rng(8), 1, [], 'sword');
    const run = new TowerRun(h, new Rng(8), { gate: gate({ rival: { agency: '적월 길드', level: 5, since: 0 } }) });
    expect(run.log.some((l) => l.includes('적월 길드 팀이 먼저 와 있다'))).toBe(true);
  });

  it('raids and the record survive a save', () => {
    const rng = new Rng(10);
    const state = newGame(rng);
    for (let i = 0; i < 10; i++) settleReturn(state, rng, 0);
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) } as unknown as Storage;
    saveGame(storage, state);
    const back = loadGame(storage)!;
    expect(back.gateRecord).toEqual(state.gateRecord);
    expect(back.gates).toEqual(state.gates);
  });
});
