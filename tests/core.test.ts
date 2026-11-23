import { describe, expect, it } from 'vitest';
import { activeHunter, buyPotion, gradeIn, hire, newGame, ranking, release, settleDeath, settleReturn, train, trainingCost } from '../src/core/agency';
import { botAction, stepTowards } from '../src/core/bot';
import { generateFloor, isWalkable, MAP_W, Tile } from '../src/core/dungeon';
import { combatPower, createHunter as makeHunter, gainExp, gradeOf, Hunter, TRIBUTE_RATE } from '../src/core/hunter';
import { Rng } from '../src/core/rng';
import { TowerRun } from '../src/core/run';
import { loadGame, SAVE_KEY, saveGame } from '../src/core/save';

const createHunter = (rng: Rng) => makeHunter(rng, 1);

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
    const rng = new Rng(1);
    const state = newGame(rng);
    const before = state.agent.gold;
    const r = settleReturn(state, rng, 100);
    expect(r.tribute).toBe(50);
    expect(state.agent.gold).toBe(before + 50);
    expect(activeHunter(state)!.gold).toBe(20 + 50);
  });

  it('re-contracts on promotion with item support', () => {
    const rng = new Rng(1);
    const state = newGame(rng);
    state.hallOfFame = filler(10, 100000); // keep our hunter out of the S ranks
    activeHunter(state)!.atk += 3; // 95 -> 110 power: grade E
    const r = settleReturn(state, rng, 0);
    expect(r.promotedFrom).toBe('F');
    expect(r.promotedTo).toBe('E');
    expect(activeHunter(state)!.contractGrade).toBe('E');
    expect(r.signingSupport).toBe(20);
  });

  it('training costs agent gold and rises each time', () => {
    const state = newGame(new Rng(1));
    const h = activeHunter(state)!;
    expect(trainingCost(h, 'atk')).toBe(20);
    expect(train(state, 'atk')).toBe(true);
    expect(h.atk).toBe(6);
    expect(state.agent.gold).toBe(80);
    expect(trainingCost(h, 'atk')).toBe(35);
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

  it('saves and loads the game', () => {
    const storage = memStorage();
    const state = newGame(new Rng(9));
    saveGame(storage, state);
    expect(loadGame(storage)).toEqual(state);
  });

  it('carries a version 1 save over to slots', () => {
    const storage = memStorage();
    const v1h = makeHunter(new Rng(3), 0) as Partial<Hunter>;
    delete v1h.id;
    storage.setItem(SAVE_KEY, JSON.stringify({
      version: 1, agent: { name: '새벽 에이전시', gold: 77 }, hunter: v1h, contractGrade: 'E',
      hallOfFame: [{ name: '옛사람', grade: 'F', level: 2, kills: 3, bestFloor: 2, totalTribute: 5, score: 300, fate: '고블린에게 사망' }],
      hunterNumber: 2,
    }));
    const state = loadGame(storage)!;
    expect(state.version).toBe(2);
    expect(state.agent.gold).toBe(77);
    expect(activeHunter(state)!.contractGrade).toBe('E');
    expect(state.slots.filter(Boolean)).toHaveLength(1);
    expect(state.hallOfFame[0].id).not.toBe(activeHunter(state)!.id);
  });
});

function memStorage() {
  const mem = new Map<string, string>();
  return { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
}

function filler(n: number, score: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: 1000 + i, name: `기록${i}`, grade: 'A' as const, level: 1, kills: 0, bestFloor: 1, totalTribute: 0, score: score - i, fate: '사망',
  }));
}

describe('slots and release', () => {
  it('hires up to three hunters and releases one to the rival agency', () => {
    const rng = new Rng(4);
    const state = newGame(rng);
    expect(hire(state, rng, 1)).toBeDefined();
    expect(hire(state, rng, 2)).toBeDefined();
    expect(hire(state, rng, 0)).toBeUndefined(); // slot taken
    const names = state.slots.map((h) => h!.name);
    expect(new Set(names).size).toBe(3);
    const gone = release(state, 1)!;
    expect(state.slots[1]).toBeNull();
    expect(state.rival.roster).toContain(gone);
    expect(gone.origin).toBe('released');
  });
});

describe('ranking and grades', () => {
  it('ranks living, rival and fallen hunters together; top spots become S, SS, SSS', () => {
    const rng = new Rng(5);
    const state = newGame(rng);
    const h = activeHunter(state)!;
    expect(gradeIn(state, h)).toBe('F'); // association rankers fill the top 10 at the start
    state.world = [];
    expect(gradeIn(state, h)).toBe('SSS'); // alone in the ranking
    state.hallOfFame = filler(3, 100000);
    expect(gradeIn(state, h)).toBe('SS');
    state.hallOfFame = filler(9, 100000);
    expect(gradeIn(state, h)).toBe('S');
    state.hallOfFame = filler(10, 100000);
    expect(gradeIn(state, h)).toBe('F');
    expect(ranking(state)).toHaveLength(10);
  });

  it('tribute keeps falling through S, SS and SSS', () => {
    expect(TRIBUTE_RATE.S).toBeLessThan(TRIBUTE_RATE.A);
    expect(TRIBUTE_RATE.SS).toBeLessThan(TRIBUTE_RATE.S);
    expect(TRIBUTE_RATE.SSS).toBeLessThan(TRIBUTE_RATE.SS);
  });
});

describe('death and scouting', () => {
  it('an unscouted death goes to the hall of fame and the empty agency hires again', () => {
    let sawRecord = false;
    let sawScout = false;
    for (let seed = 1; seed <= 40; seed++) {
      const rng = new Rng(seed);
      const state = newGame(rng);
      state.hallOfFame = filler(10, 100000);
      const r = settleDeath(state, rng, '오크 전사');
      expect(state.slots.filter(Boolean)).toHaveLength(1); // rehired
      if (r.scouted) {
        sawScout = true;
        expect(state.rival.roster.some((h) => h.id === r.hunter.id)).toBe(true);
      } else {
        sawRecord = true;
        expect(r.entry!.fate).toBe('오크 전사에게 사망');
      }
    }
    expect(sawRecord && sawScout).toBe(true);
  });

  it('a hunter who was ever SSS is always scouted', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = new Rng(seed);
      const state = newGame(rng);
      activeHunter(state)!.everSSS = true;
      state.hallOfFame = filler(10, 100000);
      expect(settleDeath(state, rng, '고블린').scouted).toBe(true);
    }
  });

  it('holding #1 at death counts as SSS', () => {
    const rng = new Rng(2);
    const state = newGame(rng);
    state.world = [];
    expect(settleDeath(state, rng, '고블린').scouted).toBe(true);
  });
});

describe('rival hunters', () => {
  it('reaching S creates a rival who keeps pace', () => {
    const rng = new Rng(6);
    const state = newGame(rng);
    state.world = [];
    state.hallOfFame = filler(5, 100000); // our hunter ranks 6th: S
    const mine = activeHunter(state)!;
    const r = settleReturn(state, rng, 0);
    expect(r.rivalCreated).toBeDefined();
    const rival = r.rivalCreated!;
    expect(rival.rivalOf).toBe(mine.id);
    for (let i = 0; i < 5; i++) gainExp(mine, 200);
    settleReturn(state, rng, 0);
    expect(combatPower(rival)).toBeGreaterThan(combatPower(mine) * 0.85);
    expect(settleReturn(state, rng, 0).rivalCreated).toBeUndefined(); // only one rival per hunter
  });

  it('a rival hunter can appear in the tower, and beating it offers a choice', () => {
    const foe = makeHunter(new Rng(1), 99);
    foe.origin = 'scouted';
    foe.atk = 1;
    foe.def = 0;
    foe.maxHp = foe.hp = 1;
    let met = false;
    for (let seed = 1; seed <= 30 && !met; seed++) {
      const run = new TowerRun(createHunter(new Rng(seed)), new Rng(seed), { rivals: [foe], encounterChance: 1 });
      run.enterFloor(2);
      const m = run.monsters.find((x) => x.hunter);
      if (!m) continue;
      met = true;
      // Put the foe next to us and strike.
      run.monsters = [m];
      m.x = run.pos.x + 1;
      m.y = run.pos.y;
      run.map.tiles[m.y][m.x] = Tile.Floor;
      run.act({ type: 'move', dx: 1, dy: 0 });
      expect(run.status).toBe('choosing');
      expect(run.pendingChoice!.rewards).toHaveLength(2);
      expect(run.act({ type: 'wait' })).toBe(false); // the world waits
      const level = run.hunter.level;
      run.resolveChoice(2);
      expect(run.encounters).toEqual([{ hunterId: 99, finished: true }]);
      expect(run.hunter.level).toBeGreaterThanOrEqual(level);
      expect(run.status).toBe('playing');
    }
    expect(met).toBe(true);
  });

  it('finishing a rival hunter removes them; sparing makes them stronger', () => {
    const rng = new Rng(8);
    const state = newGame(rng);
    const a = makeHunter(rng, 50);
    const b = makeHunter(rng, 51);
    a.origin = b.origin = 'scouted';
    state.rival.roster.push(a, b);
    const lvB = b.level;
    const r = settleReturn(state, rng, 0, [{ hunterId: 50, finished: true }, { hunterId: 51, finished: false }]);
    expect(state.rival.roster.find((h) => h.id === 50)).toBeUndefined();
    expect(state.hallOfFame.some((e) => e.id === 50)).toBe(true);
    expect(b.level).toBeGreaterThanOrEqual(lvB + 2);
    expect(r.finished).toEqual([a.name]);
  });

  it('a rescue token saves the hunter once', () => {
    const run = new TowerRun(createHunter(new Rng(4)), new Rng(4));
    run.hunter.hp = 1;
    run.hunter.def = 0;
    run.hunter.rescues = 1;
    run.monsters = [];
    const x = run.pos.x + 1;
    const y = run.pos.y;
    run.map.tiles[y][x] = Tile.Floor;
    run.monsters.push({ id: 1, kind: { id: 'brute', name: '거인', glyph: 'G', hp: 999, atk: 50, def: 99, exp: 0, gold: 0, score: 0 }, x, y, hp: 999, maxHp: 999, atk: 50, def: 99, awake: true });
    run.act({ type: 'wait' });
    expect(run.status).toBe('playing');
    expect(run.hunter.rescues).toBe(0);
    expect(run.hunter.hp).toBe(Math.ceil(run.hunter.maxHp * 0.3));
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
        if (run.status === 'choosing') {
          run.resolveChoice(0);
          continue;
        }
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
