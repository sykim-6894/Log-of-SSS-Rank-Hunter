import { describe, expect, it } from 'vitest';
import { enterGate, newGame, refreshGates, settleReturn } from '../src/core/agency';
import { botAction } from '../src/core/bot';
import { createHunter } from '../src/core/hunter';
import { Gate, GATE_INFO, GATE_SLOTS, GATE_THEMES, gateClearGold, gateFloors, gateKind, gradeForLevel, rollGate } from '../src/core/gates';
import { MONSTERS, monsterPool } from '../src/core/monsters';
import { Rng } from '../src/core/rng';
import { TowerRun } from '../src/core/run';
import { loadGame, saveGame } from '../src/core/save';

const gate = (over: Partial<Gate> = {}): Gate => ({ id: 1, grade: 'C', theme: 'swamp', closesOn: 5, ...over });
const hunter = (seed = 1) => createHunter(new Rng(seed), 1, [], 'sword');

describe('gate board', () => {
  it('a new agency starts with three gates, easy ones for a new hunter', () => {
    const state = newGame(new Rng(3));
    expect(state.gates).toHaveLength(GATE_SLOTS);
    for (const g of state.gates!) expect(['E', 'D']).toContain(g.grade);
  });

  it('each return is a day: closed gates go and new ones open', () => {
    const rng = new Rng(4);
    const state = newGame(rng);
    const first = state.gates!.map((g) => g.id);
    for (let i = 0; i < 6; i++) settleReturn(state, rng, 0);
    expect(state.day).toBe(6);
    expect(state.gates).toHaveLength(GATE_SLOTS);
    for (const g of state.gates!) expect(g.closesOn).toBeGreaterThanOrEqual(6);
    expect(state.gates!.some((g) => first.includes(g.id))).toBe(false);
  });

  it('going in takes the gate off the board', () => {
    const state = newGame(new Rng(5));
    const id = state.gates![1].id;
    expect(enterGate(state, id)?.id).toBe(id);
    expect(state.gates).toHaveLength(GATE_SLOTS - 1);
    expect(enterGate(state, id)).toBeUndefined();
    refreshGates(state, new Rng(6));
    expect(state.gates).toHaveLength(GATE_SLOTS);
  });

  it('offers grades that fit the best hunter', () => {
    expect(gradeForLevel(1)).toBe('E');
    expect(gradeForLevel(8)).toBe('D');
    expect(gradeForLevel(30)).toBe('S');
  });

  it('E gates have no special rule', () => {
    for (let i = 0; i < 50; i++) expect(rollGate(new Rng(i), i, 'E', 0).rule).toBeUndefined();
  });

  it('old saves without gates load and get a board', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const state = newGame(new Rng(7));
    delete state.gates;
    saveGame(storage, state);
    const loaded = loadGame(storage)!;
    expect(loaded.gates).toBeUndefined();
    refreshGates(loaded, new Rng(8));
    expect(loaded.gates).toHaveLength(GATE_SLOTS);
  });
});

describe('gate runs', () => {
  it('uses the theme monsters at the grade danger, and leaves the tower record alone', () => {
    const h = hunter();
    const run = new TowerRun(h, new Rng(2), { gate: gate() });
    expect(run.floor).toBe(1);
    expect(run.danger).toBe(GATE_INFO.C.danger);
    expect(run.placeName).toBe('C급 독안개 늪 1/4층');
    expect(h.bestFloor).toBe(0);
    const allowed = GATE_THEMES.swamp.pool;
    for (const m of run.monsters) expect(allowed).toContain(m.kind.id.replace('elite-', ''));
    expect(run.merchant).toBeUndefined();
  });

  it('theme monsters are as tough as the tower at the same danger', () => {
    const strength = (k: { hp: number; atk: number }) => k.hp * k.atk;
    for (const danger of [2, 9, 17]) {
      const tower = monsterPool(danger).reduce((s, k) => s + strength(k), 0) / monsterPool(danger).length;
      for (const theme of Object.keys(GATE_THEMES) as Array<keyof typeof GATE_THEMES>) {
        const kinds = GATE_THEMES[theme].pool.map((id) => gateKind(MONSTERS[id], danger, theme));
        const avg = kinds.reduce((s, k) => s + strength(k), 0) / kinds.length;
        expect(avg).toBeGreaterThan(tower * 0.75);
      }
    }
    // Goblins in a late gate hit much harder than tower goblins.
    expect(gateKind(MONSTERS.goblin, 17, 'goblin').atk).toBeGreaterThan(MONSTERS.goblin.atk);
  });

  it('the master waits on the last floor, and clearing pays out and ends the run', () => {
    const g = gate();
    const run = new TowerRun(hunter(), new Rng(3), { gate: g });
    expect(run.monsters.some((m) => m.kind.boss)).toBe(false);
    run.enterFloor(gateFloors(g));
    expect(run.isTopFloor).toBe(true);
    expect(run.monsters.filter((m) => m.kind.boss)).toHaveLength(1);
    run.monsters = [];
    run.pos = { ...run.map.stairs };
    run.status = 'onStairs';
    expect(run.climb()).toBe(false);
    const before = run.runGold;
    expect(run.clearGate()).toBe(true);
    expect(run.runGold).toBe(before + gateClearGold(g));
    expect(run.status).toBe('returned');
  });

  it('a rule makes the clear reward bigger', () => {
    expect(gateClearGold(gate({ rule: 'dark' }))).toBeGreaterThan(gateClearGold(gate()));
  });

  it('dark gates shorten sight; sealed gates refuse health potions', () => {
    const dark = new TowerRun(hunter(), new Rng(4), { gate: gate({ rule: 'dark' }) });
    expect(dark.sight).toBe(4);
    const h = hunter();
    h.bag.hp = 2;
    h.hp = 5;
    const sealed = new TowerRun(h, new Rng(4), { gate: gate({ rule: 'sealed' }) });
    sealed.act({ type: 'use', item: 'hp' });
    expect(h.bag.hp).toBe(2);
    expect(h.hp).toBe(5);
  });

  it('swarm gates have more monsters; elite gates always have a mid-boss before the last floor', () => {
    let plain = 0;
    let swarm = 0;
    for (let s = 1; s <= 20; s++) {
      plain += new TowerRun(hunter(), new Rng(s), { gate: gate() }).monsters.length;
      swarm += new TowerRun(hunter(), new Rng(s), { gate: gate({ rule: 'swarm' }) }).monsters.length;
      const elite = new TowerRun(hunter(), new Rng(s), { gate: gate({ rule: 'elite' }) });
      expect(elite.monsters.some((m) => m.kind.elite)).toBe(true);
    }
    expect(swarm).toBeGreaterThan(plain * 1.3);
  });

  it('a saved gate run comes back as the same gate', () => {
    const h = hunter();
    const run = new TowerRun(h, new Rng(5), { gate: gate({ rule: 'dark' }) });
    run.enterFloor(2);
    const back = TowerRun.restore(JSON.parse(JSON.stringify(run.snapshot())), h, new Rng(6))!;
    expect(back.gate).toEqual(run.gate);
    expect(back.placeName).toBe('C급 독안개 늪 2/4층');
    expect(back.sight).toBe(4);
  });

  it('the autoplayer can play a gate to the end', () => {
    const h = hunter();
    const run = new TowerRun(h, new Rng(5), { gate: gate({ grade: 'E', theme: 'goblin' }) });
    for (let i = 0; i < 3000 && run.status !== 'dead' && run.status !== 'returned'; i++) {
      if (run.status === 'onStairs') {
        if (run.isTopFloor) run.clearGate();
        else run.climb();
      } else if (run.status === 'choosing') run.resolveChoice(2);
      else if (run.status === 'trading') run.leaveMerchant();
      else run.act(botAction(run));
    }
    expect(['dead', 'returned']).toContain(run.status);
  });
});
