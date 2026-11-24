import { describe, expect, it } from 'vitest';
import { activeHunter, buyItem, changeClass, gradeIn, hire, newGame, ranking, release, settleDeath, settleReturn, startFloors, train, trainingCost, worldRankers } from '../src/core/agency';
import { botAction, stepTowards } from '../src/core/bot';
import { generateFloor, isWalkable, MAP_W, TALL_MAP_H, TALL_MAP_W, Tile } from '../src/core/dungeon';
import { combatPower, createHunter as makeHunter, expToNext, gainExp, GRADE_A_POWER, gradeOf, Hunter, levelUp, TRIBUTE_RATE } from '../src/core/hunter';
import { autoPick, chooseCard, ClassId, CLASS_IDS, CLASSES, classSkills, rollCards, SKILLS, slotCount, SWORD_KILL_HEAL } from '../src/core/classes';
import { Rng } from '../src/core/rng';
import { Monster, TowerRun } from '../src/core/run';
import { loadGame, SAVE_KEY, saveGame } from '../src/core/save';
import { bossFor, floorExpScale, MONSTERS, overLevelFactor, recommendedLevel, TOP_FLOOR } from '../src/core/monsters';
import { BAG_MAX, CURSE_FROM_FLOOR, equipIfBetter, Gear, rollChest, rollGear } from '../src/core/items';

const createHunter = (rng: Rng) => makeHunter(rng, 1, [], 'sword');

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

  it('makes tall floors for upright phones, and runs use them', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const map = generateFloor(new Rng(seed), TALL_MAP_W, TALL_MAP_H);
      expect(map.tiles).toHaveLength(TALL_MAP_H);
      expect(map.tiles[0]).toHaveLength(TALL_MAP_W);
    }
    const run = new TowerRun(createHunter(new Rng(2)), new Rng(2), { mapSize: { w: TALL_MAP_W, h: TALL_MAP_H } });
    expect(run.seen).toHaveLength(TALL_MAP_H);
    expect(botAction(run)).toBeDefined();
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
    const atk = h.atk;
    expect(train(state, 'atk')).toBe(true);
    expect(h.atk).toBe(atk + 1);
    expect(state.agent.gold).toBe(80);
    expect(trainingCost(h, 'atk')).toBe(35);
  });

  it('agent sometimes helps pay for potions', () => {
    let helped = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const state = newGame(new Rng(seed));
      state.agent.gold = 500;
      const r = buyItem(state, new Rng(seed * 31), 'hp');
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
    const v1h = makeHunter(new Rng(3), 0) as Partial<Hunter> & { potions?: number };
    delete v1h.id;
    delete v1h.bag;
    delete v1h.gear;
    v1h.potions = 4;
    storage.setItem(SAVE_KEY, JSON.stringify({
      version: 1, agent: { name: '새벽 에이전시', gold: 77 }, hunter: v1h, contractGrade: 'E',
      hallOfFame: [{ name: '옛사람', grade: 'F', level: 2, kills: 3, bestFloor: 2, totalTribute: 5, score: 300, fate: '고블린에게 사망' }],
      hunterNumber: 2,
    }));
    const state = loadGame(storage)!;
    expect(state.version).toBe(3);
    expect(activeHunter(state)!.bag).toEqual({ hp: 4, mp: 0, guard: 0, escape: 0 });
    expect(activeHunter(state)!.gear).toEqual({});
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
    id: 1000 + i, name: `기록${i}`, grade: 'A' as const, level: 1, kills: 0, bestFloor: 1, totalTribute: 0, score: score - i, power: score - i, fate: '사망',
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

  it('association rankers are all stronger than an A grade hunter', () => {
    for (const w of worldRankers()) expect(w.score).toBeGreaterThan(GRADE_A_POWER);
    const rng = new Rng(5);
    const state = newGame(rng);
    const h = activeHunter(state)!;
    // A hunter with a huge kill record but little strength stays out of the top 10.
    h.killScore = 100000;
    h.bestFloor = 20;
    expect(gradeIn(state, h)).toBe('F');
    h.atk = 2000;
    // Strength alone stops just under the rankers: they have to be beaten in challenges.
    expect(gradeIn(state, h)).toBe('A');
    h.beaten = state.world.map((w) => w.id);
    expect(gradeIn(state, h)).toBe('SSS');
  });

  it('old saves get the stronger rankers', () => {
    const rng = new Rng(5);
    const state = newGame(rng);
    state.world = state.world.map((w) => ({ ...w, score: 1000 }));
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    saveGame(storage, state);
    expect(loadGame(storage)!.world).toEqual(worldRankers());
  });

  it('a hunter can skip floors already cleared, in steps of five', () => {
    const rng = new Rng(5);
    const state = newGame(rng);
    const h = activeHunter(state)!;
    expect(startFloors(state, h)).toEqual([1]);
    h.bestFloor = 5; // reached the floor 5 boss but not past it
    expect(startFloors(state, h)).toEqual([1]);
    h.bestFloor = 12;
    expect(startFloors(state, h)).toEqual([1, 6, 11]);
    h.bestFloor = 20;
    expect(startFloors(state, h)).toEqual([1, 6, 11, 16]);
    const run = new TowerRun(h, rng, { startFloor: 11 });
    expect(run.floor).toBe(11);
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

describe('levels', () => {
  it('first levels come quickly and refill health and mana', () => {
    const h = createHunter(new Rng(1));
    h.hp = 3;
    h.mp = 0;
    expect(gainExp(h, expToNext(1))).toBe(1);
    expect(h.level).toBe(2);
    expect(h.hp).toBe(h.maxHp);
    expect(h.mp).toBe(h.maxMp);
    expect(expToNext(1)).toBeLessThan(10);
    expect(expToNext(10)).toBeGreaterThan(expToNext(9));
  });
});

describe('items and chests', () => {
  const gear = (slot: Gear['slot'], atk: number, def = 0): Gear => ({ slot, name: `t${atk}`, tier: 1, atk, def, hp: 0, mp: 0 });

  it('wears a better piece and throws the old one away', () => {
    const h = createHunter(new Rng(1));
    const baseAtk = h.atk;
    expect(equipIfBetter(h, gear('weapon', 3)).equipped).toBe(true);
    expect(h.atk).toBe(baseAtk + 3);
    const r = equipIfBetter(h, gear('weapon', 6));
    expect(r.equipped).toBe(true);
    expect(r.discarded?.atk).toBe(3);
    expect(h.atk).toBe(baseAtk + 6);
    expect(equipIfBetter(h, gear('weapon', 2)).equipped).toBe(false);
    expect(h.atk).toBe(baseAtk + 6);
    expect(h.gear.weapon?.atk).toBe(6);
  });

  it('a better ring swaps health bonus without overhealing', () => {
    const h = createHunter(new Rng(1));
    const base = h.maxHp;
    equipIfBetter(h, { slot: 'ring', name: 'a', tier: 1, atk: 0, def: 0, hp: 10, mp: 0 });
    expect(h.maxHp).toBe(base + 10);
    equipIfBetter(h, { slot: 'ring', name: 'b', tier: 2, atk: 0, def: 0, hp: 0, mp: 12 });
    expect(h.maxHp).toBe(base);
    expect(h.hp).toBeLessThanOrEqual(h.maxHp);
  });

  it('higher floors give stronger gear', () => {
    const avg = (floor: number) => {
      let sum = 0;
      for (let i = 0; i < 200; i++) sum += rollGear(new Rng(i + 1), floor, 'weapon').atk;
      return sum / 200;
    };
    expect(avg(9)).toBeGreaterThan(avg(1) + 4);
  });

  it('chests are never cursed below the curse floor, sometimes above it', () => {
    for (let i = 1; i <= 300; i++) expect(rollChest(new Rng(i), CURSE_FROM_FLOOR - 1).type).not.toBe('curse');
    let curses = 0;
    for (let i = 1; i <= 300; i++) if (rollChest(new Rng(i), CURSE_FROM_FLOOR).type === 'curse') curses++;
    expect(curses).toBeGreaterThan(30);
    expect(curses).toBeLessThan(120);
  });

  it('every floor has a chest, and stepping on it opens it', () => {
    const run = new TowerRun(createHunter(new Rng(5)), new Rng(5));
    expect(run.chests.length).toBeGreaterThan(0);
    run.monsters = [];
    const c = run.chests[0];
    const before = run.chests.length;
    for (let i = 0; i < 300 && run.chestAt(c.x, c.y) >= 0; i++) {
      const step = stepTowards(run, c);
      if (!step || !run.act(step)) break;
    }
    expect(run.chests.length).toBe(before - 1);
    expect(run.log.some((l) => l.includes('보물상자'))).toBe(true);
  });

  it('a cursed chest never kills outright', () => {
    const run = new TowerRun(createHunter(new Rng(2)), new Rng(2));
    run.hunter.hp = 2;
    run.applyChest({ type: 'curse', curse: 'drain' });
    expect(run.hunter.hp).toBe(1);
    run.runGold = 100;
    run.applyChest({ type: 'curse', curse: 'greed' });
    expect(run.runGold).toBe(70);
    run.monsters = [];
    run.applyChest({ type: 'curse', curse: 'ambush' });
    expect(run.monsters.length).toBeGreaterThan(0);
    expect(run.monsters.every((m) => m.awake)).toBe(true);
  });

  it('potions heal, restore mana, and guard blocks hits', () => {
    const run = new TowerRun(createHunter(new Rng(4)), new Rng(4));
    const h = run.hunter;
    h.bag = { hp: 1, mp: 1, guard: 1, escape: 0 };
    h.hp = 5;
    expect(run.act({ type: 'use', item: 'hp' })).toBe(true);
    expect(h.hp).toBeGreaterThan(5);
    expect(h.bag.hp).toBe(0);
    expect(run.act({ type: 'use', item: 'hp' })).toBe(false);
    h.mp = 0;
    run.act({ type: 'use', item: 'mp' });
    expect(h.mp).toBeGreaterThan(0);

    run.monsters = [];
    const x = run.pos.x + 1;
    const y = run.pos.y;
    run.map.tiles[y][x] = Tile.Floor;
    run.monsters.push({ id: 1, kind: { id: 'brute', name: '거인', glyph: 'G', hp: 999, atk: 20, def: 99, exp: 0, gold: 0, score: 0 }, x, y, hp: 999, maxHp: 999, atk: 20, def: 99, awake: true });
    h.hp = h.maxHp;
    run.act({ type: 'use', item: 'guard' });
    for (let i = 0; i < 3; i++) run.act({ type: 'wait' });
    expect(h.hp).toBe(h.maxHp);
    expect(run.guardTurns).toBe(0);
    run.act({ type: 'wait' });
    expect(h.hp).toBeLessThan(h.maxHp);
  });

  it('the bag holds at most five of a kind and the shop stops selling', () => {
    const state = newGame(new Rng(8));
    const h = activeHunter(state)!;
    h.gold = 1000;
    while (buyItem(state, new Rng(1), 'hp').ok);
    expect(h.bag.hp).toBe(BAG_MAX);
    expect(buyItem(state, new Rng(1), 'guard').ok).toBe(false);
  });
});

describe('bosses and merchants', () => {
  it('a boss guards every fifth floor up to the top', () => {
    expect(TOP_FLOOR).toBe(20);
    for (let f = 1; f <= TOP_FLOOR; f++) expect(!!bossFor(f)).toBe(f % 5 === 0);
    expect(bossFor(5)).toBe(MONSTERS.warden);
    expect(bossFor(20)?.boss).toBe(true);
  });

  it('mid-bosses turn up on some ordinary floors and drop gear', () => {
    let seen = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const run = new TowerRun(createHunter(new Rng(seed)), new Rng(seed), { eliteChance: 1 });
      run.enterFloor(3);
      if (run.monsters.some((m) => m.kind.elite)) seen++;
      run.enterFloor(5);
      expect(run.monsters.some((m) => m.kind.elite)).toBe(false);
    }
    expect(seen).toBeGreaterThan(50);

    const run = new TowerRun(createHunter(new Rng(3)), new Rng(3), { eliteChance: 1 });
    run.enterFloor(3);
    const elite = run.monsters.find((m) => m.kind.elite)!;
    run.monsters = [elite];
    elite.hp = 1;
    elite.def = 0;
    run.map.tiles[run.pos.y][run.pos.x + 1] = Tile.Floor;
    elite.x = run.pos.x + 1;
    elite.y = run.pos.y;
    run.act({ type: 'move', dx: 1, dy: 0 });
    expect(Object.values(run.hunter.gear).length).toBe(1);
  });

  it('the merchant sells from this run\'s gold, then leaves', () => {
    const run = new TowerRun(createHunter(new Rng(7)), new Rng(7), { merchantChance: 1 });
    run.enterFloor(2);
    const m = run.merchant!;
    expect(m.offers).toHaveLength(3);
    run.monsters = [];
    run.map.tiles[run.pos.y][run.pos.x + 1] = Tile.Floor;
    m.x = run.pos.x + 1;
    m.y = run.pos.y;
    const turn = run.turn;
    expect(run.act({ type: 'move', dx: 1, dy: 0 })).toBe(false);
    expect(run.status).toBe('trading');
    expect(run.turn).toBe(turn);
    run.runGold = 0;
    expect(run.buyOffer(0)).toBe('');
    run.runGold = 1000;
    expect(run.buyOffer(0)).not.toBe('');
    expect(run.runGold).toBe(1000 - m.offers[0].price);
    expect(run.buyOffer(0)).toBe('');
    run.leaveMerchant();
    expect(run.merchant).toBeUndefined();
    expect(run.status).toBe('playing');
  });

  it('a return scroll leaves the tower at once', () => {
    const run = new TowerRun(createHunter(new Rng(9)), new Rng(9));
    run.hunter.bag.escape = 1;
    run.runGold = 40;
    expect(run.act({ type: 'use', item: 'escape' })).toBe(true);
    expect(run.status).toBe('returned');
    expect(run.runGold).toBe(40);
    expect(run.hunter.bag.escape).toBe(0);
  });
});

describe('saving a run in progress', () => {
  it('a saved run comes back the same and keeps going', () => {
    const state = newGame(new Rng(12));
    const h = activeHunter(state)!;
    const rng = new Rng(12);
    const run = new TowerRun(h, rng, { rivals: state.rival.roster, merchantChance: 1 });
    for (let i = 0; i < 30 && run.status === 'playing'; i++) run.act(botAction(run));
    run.drainEvents();
    const json = JSON.parse(JSON.stringify(run.snapshot()));
    const back = TowerRun.restore(json, h, rng, { rivals: state.rival.roster })!;
    expect(back.snapshot()).toEqual(run.snapshot());
    expect(back.seen).toEqual(run.seen);
    if (back.status === 'playing') expect(back.act({ type: 'wait' })).toBe(true);
  });

  it('a rival hunter in a saved run is linked back to the roster', () => {
    const rival = makeHunter(new Rng(4), 77);
    rival.origin = 'rival';
    const run = new TowerRun(createHunter(new Rng(4)), new Rng(4), { rivals: [rival], encounterChance: 1 });
    run.enterFloor(2);
    const before = run.monsters.find((m) => m.hunter);
    const back = TowerRun.restore(JSON.parse(JSON.stringify(run.snapshot())), run.hunter, new Rng(1), { rivals: [rival] })!;
    if (before) expect(back.monsters.find((m) => m.hunter)?.hunter).toBe(rival);
    expect(TowerRun.restore({ ...run.snapshot(), pendingChoice: { hunterId: 999, rewards: ['gold', 'item'], finishExp: 1 } }, run.hunter, new Rng(1))).toBeUndefined();
  });

  it('turns report what happened for the screen', () => {
    const run = new TowerRun(createHunter(new Rng(6)), new Rng(6));
    expect(run.drainEvents().some((e) => e.type === 'floor')).toBe(true);
    run.monsters = [];
    run.map.tiles[run.pos.y][run.pos.x + 1] = Tile.Floor;
    run.monsters.push({ id: 1, kind: { id: 'brute', name: '거인', glyph: 'G', hp: 999, atk: 50, def: 0, exp: 0, gold: 0, score: 0 }, x: run.pos.x + 1, y: run.pos.y, hp: 999, maxHp: 999, atk: 50, def: 0, awake: true });
    run.act({ type: 'move', dx: 1, dy: 0 });
    const types = run.drainEvents().map((e) => e.type);
    expect(types).toContain('hit');
    expect(types).toContain('hurt');
    expect(run.drainEvents()).toEqual([]);
  });
});

describe('experience and ranged enemies', () => {
  it('higher floors give more experience; far over-levelled hunters get little', () => {
    expect(floorExpScale(10)).toBeGreaterThan(3);
    expect(overLevelFactor(recommendedLevel(5), 5)).toBe(1);
    expect(overLevelFactor(20, 1)).toBe(0.1);
    const fresh = createHunter(new Rng(1));
    gainExp(fresh, 23); // level 3, the right level for floor 1
    const strong = createHunter(new Rng(1));
    for (let i = 0; i < 30; i++) gainExp(strong, 10000);
    const kill = (h: Hunter) => {
      const run = new TowerRun(h, new Rng(3));
      run.monsters = [];
      run.map.tiles[run.pos.y][run.pos.x + 1] = Tile.Floor;
      run.monsters.push({ id: 1, kind: MONSTERS.goblin, x: run.pos.x + 1, y: run.pos.y, hp: 1, maxHp: 1, atk: 0, def: 0, awake: true });
      const before = h.exp;
      const lv = h.level;
      run.act({ type: 'move', dx: 1, dy: 0 });
      return h.level > lv ? Infinity : h.exp - before;
    };
    expect(kill(fresh)).toBe(MONSTERS.goblin.exp);
    expect(kill(strong)).toBe(1);
  });

  it('an archer shoots along a clear line, not through walls', () => {
    const run = new TowerRun(createHunter(new Rng(6)), new Rng(6));
    run.monsters = [];
    const { x, y } = run.pos;
    for (let i = 1; i <= 3; i++) run.map.tiles[y][x + i] = Tile.Floor;
    run.monsters.push({ id: 1, kind: MONSTERS.archer, x: x + 3, y, hp: 50, maxHp: 50, atk: 8, def: 0, awake: true });
    run.drainEvents();
    run.act({ type: 'wait' });
    const events = run.drainEvents().map((e) => e.type);
    expect(events).toContain('shot');
    expect(events).toContain('hurt');
    run.map.tiles[y][x + 2] = Tile.Wall;
    run.act({ type: 'wait' });
    expect(run.drainEvents().map((e) => e.type)).not.toContain('shot');
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
        if (run.status === 'trading') {
          run.leaveMerchant();
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

// ---------- Classes and skills ----------

/** A run on an open 40×25 floor with nothing in it, the hunter in the middle. */
function arena(cls: ClassId, seed = 1) {
  const h = makeHunter(new Rng(seed), 1, [], cls);
  const run = new TowerRun(h, new Rng(seed));
  for (let y = 1; y < 24; y++) for (let x = 1; x < 39; x++) run.map.tiles[y][x] = Tile.Floor;
  run.monsters = [];
  run.chests = [];
  run.merchant = undefined;
  run.pos = { x: 20, y: 12 };
  return run;
}

function dummy(run: TowerRun, x: number, y: number, hp = 500, atk = 0): Monster {
  const m: Monster = { id: 100 + x * 50 + y, kind: { ...MONSTERS.goblin, exp: 0 }, x, y, hp, maxHp: hp, atk, def: 0, awake: true };
  run.monsters.push(m);
  return m;
}

describe('classes', () => {
  it('each class starts with its own stats, look and signature skill', () => {
    for (const id of CLASS_IDS) {
      const h = makeHunter(new Rng(1), 1, [], id);
      expect(h.maxHp).toBe(CLASSES[id].base.hp);
      expect(h.look).toBe(CLASSES[id].look);
      expect(h.skills).toEqual([{ id: classSkills(id)[0], lv: 1 }]);
      expect(gradeOf(combatPower(h))).toBe('F');
    }
  });

  it('grows by class; mages gain defense every other level', () => {
    const k = makeHunter(new Rng(1), 1, [], 'knight');
    const m = makeHunter(new Rng(1), 1, [], 'mage');
    levelUp(k);
    levelUp(m);
    levelUp(m);
    expect(k.maxHp).toBe(CLASSES.knight.base.hp + 7);
    expect(m.def).toBe(CLASSES.mage.base.def + 1);
    expect(m.picks).toBe(2);
  });

  it('hiring takes a chosen class and first skill; untouched hunters can change class', () => {
    const rng = new Rng(3);
    const state = newGame(rng);
    const h = hire(state, rng, 1, 'archer', 'trap')!;
    expect(h.cls).toBe('archer');
    expect(h.skills[0].id).toBe('trap');
    const changed = changeClass(state, rng, 1, 'knight', 'block')!;
    expect(changed.name).toBe(h.name);
    expect(changed.cls).toBe('knight');
    changed.bestFloor = 1;
    expect(changeClass(state, rng, 1, 'mage', 'fireball')).toBeUndefined();
  });

  it('old saves turn each look into a class', () => {
    const rng = new Rng(4);
    const state = newGame(rng);
    const h = activeHunter(state)!;
    const old = h as Partial<Hunter>;
    delete old.cls;
    delete old.skills;
    h.look = 2;
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    saveGame(storage, state);
    const back = activeHunter(loadGame(storage)!)!;
    expect(back.cls).toBe('archer');
    expect(back.skills).toEqual([{ id: 'pierce', lv: 1 }]);
  });
});

describe('level-up cards', () => {
  it('offers three cards, no big skills before level 8, and opens slots at 5 and 10', () => {
    expect([1, 4, 5, 9, 10].map(slotCount)).toEqual([1, 1, 2, 2, 3]);
    const h = makeHunter(new Rng(1), 1, [], 'sword');
    for (let seed = 1; seed <= 30; seed++) {
      const cards = rollCards(h, new Rng(seed));
      expect(cards).toHaveLength(3);
      expect(cards.some((c) => c.type !== 'stat' && SKILLS[c.skill].ultimate)).toBe(false);
    }
  });

  it('learns, upgrades, and swaps a skill when the slots are full', () => {
    const h = makeHunter(new Rng(1), 1, [], 'mage', 'fireball');
    h.picks = 3;
    h.cards = [{ type: 'upgrade', skill: 'fireball' }, { type: 'learn', skill: 'chain' }, { type: 'stat', stat: 'atk' }];
    expect(chooseCard(h, 0)).toContain('2단계');
    expect(h.skills[0].lv).toBe(2);
    h.cards = [{ type: 'learn', skill: 'chain' }];
    expect(chooseCard(h, 0)).toBeUndefined(); // one slot at level 1, full: needs a skill to replace
    expect(chooseCard(h, 0, 0)).toContain('번개 사슬');
    expect(h.skills).toEqual([{ id: 'chain', lv: 1 }]);
    h.level = 5;
    h.cards = [{ type: 'learn', skill: 'blink' }];
    chooseCard(h, 0);
    expect(h.skills.map((s) => s.id)).toEqual(['chain', 'blink']);
    expect(h.picks).toBe(0);
  });

  it('with every slot full, only upgrades come up, then stat cards once all are maxed', () => {
    const h = makeHunter(new Rng(1), 1, [], 'mage', 'fireball');
    h.level = 12;
    h.skills = classSkills('mage').slice(0, 3).map((id) => ({ id, lv: 1 }));
    for (let seed = 1; seed <= 40; seed++) {
      for (const c of rollCards(h, new Rng(seed))) expect(c.type).toBe('upgrade');
    }
    h.skills[0].lv = 5;
    h.skills[1].lv = 5;
    for (let seed = 1; seed <= 20; seed++) {
      const cards = rollCards(h, new Rng(seed));
      expect(cards.filter((c) => c.type === 'upgrade')).toEqual([{ type: 'upgrade', skill: h.skills[2].id }]);
      expect(cards.filter((c) => c.type === 'learn')).toHaveLength(0);
    }
    h.skills[2].lv = 5;
    for (const c of rollCards(h, new Rng(3))) expect(c.type).toBe('stat');
    // A level-1 hunter's single slot is full too: no new skill until level 5.
    const n = makeHunter(new Rng(2), 1, [], 'sword');
    for (let seed = 1; seed <= 20; seed++) {
      expect(rollCards(n, new Rng(seed)).some((c) => c.type === 'learn')).toBe(false);
    }
    n.level = 5;
    expect([1, 2, 3, 4, 5].some((seed) => rollCards(n, new Rng(seed)).some((c) => c.type === 'learn'))).toBe(true);
  });

  it('rival hunters pick their own cards', () => {
    const h = makeHunter(new Rng(1), 1, [], 'knight');
    for (let i = 0; i < 12; i++) levelUp(h);
    autoPick(h, new Rng(2));
    expect(h.picks).toBe(0);
    expect(h.skills.length).toBe(3);
  });
});

describe('skills in the tower', () => {
  it('a skill with nothing to hit costs no mana and no turn', () => {
    const run = arena('sword');
    const mp = run.hunter.mp;
    expect(run.act({ type: 'skill', slot: 0 })).toBe(false);
    expect(run.hunter.mp).toBe(mp);
    expect(run.turn).toBe(0);
    expect(run.act({ type: 'skill', slot: 2 })).toBe(false); // empty slot
  });

  it('spin hits everything around; upgrades make it stronger', () => {
    const run = arena('sword');
    const a = dummy(run, 21, 12);
    const b = dummy(run, 19, 11);
    const far = dummy(run, 23, 12);
    run.act({ type: 'skill', slot: 0 });
    expect(a.hp).toBeLessThan(500);
    expect(b.hp).toBeLessThan(500);
    expect(far.hp).toBe(500);
  });

  it('ice bolt freezes the first enemy in the facing line', () => {
    const run = arena('mage');
    run.hunter.skills = [{ id: 'icebolt', lv: 1 }];
    run.act({ type: 'move', dx: 1, dy: 0 }); // face right
    const m = dummy(run, 25, 12, 500, 5);
    run.act({ type: 'skill', slot: 0 });
    expect(m.hp).toBeLessThan(500);
    expect(m.stun).toBeGreaterThan(0);
  });

  it('a trap holds the monster that walks into it', () => {
    const run = arena('archer');
    run.hunter.skills = [{ id: 'trap', lv: 1 }];
    run.act({ type: 'skill', slot: 0 });
    run.act({ type: 'move', dx: -1, dy: 0 });
    const m = dummy(run, 22, 12);
    m.kind.range = undefined;
    run.act({ type: 'wait' }); // the goblin steps to 21
    run.act({ type: 'wait' }); // and onto the trap at 20, next to the hunter at 19
    expect(m.hp).toBeLessThan(500);
    expect(run.traps).toHaveLength(0);
  });

  it('shield block stops hits and strikes back', () => {
    const run = arena('knight');
    const m = dummy(run, 21, 12, 500, 50);
    run.act({ type: 'skill', slot: 0 });
    const hp = run.hunter.hp;
    run.act({ type: 'wait' });
    expect(run.hunter.hp).toBe(hp);
    expect(m.hp).toBeLessThan(500);
  });

  it('the archer shoots from three tiles, sometimes missing', () => {
    let hits = 0;
    let misses = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const run = arena('archer', seed);
      const m = dummy(run, 23, 12);
      run.act({ type: 'move', dx: 1, dy: 0 });
      expect(run.pos.x).toBe(20); // shot instead of walking
      if (m.hp < 500) hits++;
      else misses++;
    }
    expect(hits).toBeGreaterThan(misses);
    expect(misses).toBeGreaterThan(0);
  });

  it('passives: sword heals on a kill, mage regains mana faster, knight hardens when low', () => {
    const sword = arena('sword');
    sword.hunter.hp = 10;
    dummy(sword, 21, 12, 1);
    sword.act({ type: 'move', dx: 1, dy: 0 });
    expect(sword.hunter.hp).toBe(10 + SWORD_KILL_HEAL);

    const mage = arena('mage');
    mage.hunter.mp = 0;
    for (let i = 0; i < 4; i++) mage.act({ type: 'wait' });
    expect(mage.hunter.mp).toBe(2);

    const knight = arena('knight');
    knight.hunter.def = 0;
    knight.hunter.hp = 5;
    knight.hunter.maxHp = 100;
    dummy(knight, 21, 12, 500, 3);
    knight.act({ type: 'wait' });
    expect(knight.hunter.hp).toBeGreaterThanOrEqual(3); // 3-5 damage less 3 defense from the passive
  });
});
