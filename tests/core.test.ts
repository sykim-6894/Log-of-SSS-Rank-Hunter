import { describe, expect, it } from 'vitest';
import { buyPotion, newGame, recordDeath, settleReturn, train, trainingCost } from '../src/core/agency';
import { botAction, stepTowards } from '../src/core/bot';
import { generateFloor, isWalkable, MAP_W, Tile } from '../src/core/dungeon';
import { combatPower, createHunter, gainExp, gradeOf, TRIBUTE_RATE } from '../src/core/hunter';
import { Rng } from '../src/core/rng';
import { TowerRun } from '../src/core/run';
import { loadGame, saveGame } from '../src/core/save';

function reachable(seed: number): boolean {
  const map = generateFloor(new Rng(seed));
  const seen = new Set<number>([map.start.y * MAP_W + map.start.x]);
  const queue = [map.start];
  while (queue.length) {
    const p = queue.shift()!;
    if (p.x === map.stairs.x && p.y === map.stairs.y) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = p.x + dx;
      const ny = p.y + dy;
      const k = ny * MAP_W + nx;
      if (!isWalkable(map, nx, ny) || seen.has(k)) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return false;
}

describe('floor generation', () => {
  it('always connects the start to the stairs', () => {
    for (let seed = 1; seed <= 200; seed++) expect(reachable(seed)).toBe(true);
  });

  it('places exactly one stairs tile', () => {
    const map = generateFloor(new Rng(7));
    expect(map.tiles.flat().filter((t) => t === Tile.Stairs)).toHaveLength(1);
  });
});

describe('hunter grades', () => {
  it('a new hunter starts at grade F', () => {
    const h = createHunter(new Rng(1));
    expect(combatPower(h)).toBeLessThan(100);
    expect(gradeOf(combatPower(h))).toBe('F');
  });

  it('maps power bands to grades', () => {
    expect(gradeOf(99)).toBe('F');
    expect(gradeOf(100)).toBe('E');
    expect(gradeOf(250)).toBe('D');
    expect(gradeOf(500)).toBe('C');
    expect(gradeOf(1000)).toBe('B');
    expect(gradeOf(2000)).toBe('A');
  });

  it('tribute rate falls as grade rises', () => {
    const order = ['F', 'E', 'D', 'C', 'B', 'A'] as const;
    for (let i = 1; i < order.length; i++) expect(TRIBUTE_RATE[order[i]]).toBeLessThan(TRIBUTE_RATE[order[i - 1]]);
  });

  it('levels up and refills hp and mp', () => {
    const h = createHunter(new Rng(1));
    h.hp = 3;
    expect(gainExp(h, 20)).toBe(1);
    expect(h.level).toBe(2);
    expect(h.hp).toBe(h.maxHp);
    expect(h.maxMp).toBe(12);
  });
});

describe('tower run', () => {
  it('attacks a monster by moving into it and earns gold on a kill', () => {
    const run = new TowerRun(createHunter(new Rng(3)), new Rng(3));
    run.monsters = [];
    const m = { id: 99, kind: { id: 'dummy', name: '허수아비', glyph: 'd', hp: 1, atk: 0, def: 0, exp: 5, gold: 10, score: 5 }, x: run.pos.x + 1, y: run.pos.y, hp: 1, maxHp: 1, atk: 0, def: 0, awake: false };
    if (!isWalkable(run.map, m.x, m.y)) run.map.tiles[m.y][m.x] = Tile.Floor;
    run.monsters.push(m);
    expect(run.act({ type: 'move', dx: 1, dy: 0 })).toBe(true);
    expect(run.monsters).toHaveLength(0);
    expect(run.runGold).toBe(10);
    expect(run.hunter.kills).toBe(1);
  });

  it('loses the run gold when the hunter dies', () => {
    const run = new TowerRun(createHunter(new Rng(4)), new Rng(4));
    run.runGold = 50;
    run.hunter.hp = 1;
    run.hunter.def = 0;
    run.monsters = [];
    const x = run.pos.x + 1;
    const y = run.pos.y;
    run.map.tiles[y][x] = Tile.Floor;
    run.monsters.push({ id: 1, kind: { id: 'brute', name: '거인', glyph: 'G', hp: 999, atk: 50, def: 99, exp: 0, gold: 0, score: 0 }, x, y, hp: 999, maxHp: 999, atk: 50, def: 99, awake: true });
    run.act({ type: 'wait' });
    expect(run.status).toBe('dead');
    expect(run.runGold).toBe(0);
    expect(run.killer).toBe('거인');
  });

  it('skill costs mana and is refused with no enemy nearby', () => {
    const run = new TowerRun(createHunter(new Rng(5)), new Rng(5));
    run.monsters = [];
    expect(run.act({ type: 'skill' })).toBe(false);
    expect(run.hunter.mp).toBe(10);
  });

  it('keeps the stairs closed while a boss lives', () => {
    const run = new TowerRun(createHunter(new Rng(6)), new Rng(6));
    run.enterFloor(5);
    expect(run.bossAlive).toBe(true);
    run.monsters = run.monsters.filter((m) => m.kind.boss);
    const boss = run.monsters[0];
    boss.awake = false;
    boss.x = 0; // park the boss out of the way so it cannot interfere
    boss.y = 0;
    run.pos = { ...run.map.stairs, x: run.map.stairs.x - 1 };
    if (!isWalkable(run.map, run.pos.x, run.pos.y)) run.map.tiles[run.pos.y][run.pos.x] = Tile.Floor;
    run.act({ type: 'move', dx: 1, dy: 0 });
    expect(run.status).toBe('playing');
  });

  it('bot can find a path to the stairs', () => {
    const run = new TowerRun(createHunter(new Rng(8)), new Rng(8));
    expect(stepTowards(run, run.map.stairs)).toBeDefined();
  });
});

describe('agency economy', () => {
  it('pays tribute under the contract grade and keeps the rest', () => {
    const state = newGame(new Rng(1));
    const before = state.agent.gold;
    const r = settleReturn(state, 100);
    expect(r.tribute).toBe(50);
    expect(state.agent.gold).toBe(before + 50);
    expect(state.hunter.gold).toBe(20 + 50);
  });

  it('re-contracts on promotion with item support', () => {
    const state = newGame(new Rng(1));
    state.hunter.atk += 3; // 95 -> 110 power: grade E
    const r = settleReturn(state, 0);
    expect(r.promotedFrom).toBe('F');
    expect(r.promotedTo).toBe('E');
    expect(state.contractGrade).toBe('E');
    expect(r.signingSupport).toBe(20);
  });

  it('training costs agent gold and rises each time', () => {
    const state = newGame(new Rng(1));
    expect(trainingCost(state.hunter, 'atk')).toBe(20);
    expect(train(state, 'atk')).toBe(true);
    expect(state.hunter.atk).toBe(6);
    expect(state.agent.gold).toBe(80);
    expect(trainingCost(state.hunter, 'atk')).toBe(35);
  });

  it('agent sometimes helps pay for potions', () => {
    let helped = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const state = newGame(new Rng(seed));
      state.agent.gold = 500;
      const r = buyPotion(state, new Rng(seed * 31));
      expect(r.ok).toBe(true);
      if (r.agentPaid > 0) helped++;
    }
    expect(helped).toBeGreaterThan(10);
    expect(helped).toBeLessThan(60);
  });

  it('keeps the hall of fame to the top 10 by score', () => {
    const rng = new Rng(2);
    const state = newGame(rng);
    for (let i = 0; i < 15; i++) {
      state.hunter.killScore = i * 10;
      recordDeath(state, rng, '고블린');
    }
    expect(state.hallOfFame).toHaveLength(10);
    expect(state.hallOfFame[0].score).toBeGreaterThanOrEqual(state.hallOfFame[9].score);
    expect(state.hunterNumber).toBe(16);
  });

  it('saves and loads the game', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const state = newGame(new Rng(9));
    saveGame(storage, state);
    expect(loadGame(storage)).toEqual(state);
  });
});

describe('balance (autoplayer)', () => {
  it('a fresh hunter usually clears floor 1 but rarely reaches floor 10', () => {
    let clearedFirst = 0;
    let reachedTop = 0;
    const runs = 200;
    for (let seed = 1; seed <= runs; seed++) {
      const run = new TowerRun(createHunter(new Rng(seed)), new Rng(seed));
      for (let steps = 0; steps < 5000 && run.status !== 'dead'; steps++) {
        if (run.status === 'onStairs') {
          if (run.floor === 1) clearedFirst++;
          if (!run.climb()) break;
          continue;
        }
        if (!run.act(botAction(run))) run.act({ type: 'wait' });
      }
      if (run.floor >= 10) reachedTop++;
    }
    expect(clearedFirst / runs).toBeGreaterThan(0.5);
    expect(reachedTop / runs).toBeLessThan(0.2);
  }, 30_000); // 200 full autoplayed runs; slower CI machines need more than the 5s default
});
