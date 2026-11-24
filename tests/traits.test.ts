import { describe, expect, it } from 'vitest';
import { Tile } from '../src/core/dungeon';
import { baseRegen, createHunter, levelUp } from '../src/core/hunter';
import { CLASSES } from '../src/core/classes';
import { MONSTERS, MonsterKind, RESPAWN_EVERY, STALKER_FIRST, STALKER_NEXT, TRAIT_RULES } from '../src/core/monsters';
import { Rng } from '../src/core/rng';
import { Monster, TowerRun } from '../src/core/run';
import { newGame } from '../src/core/agency';
import { loadGame, saveGame } from '../src/core/save';

/** An open 40×25 floor with nothing in it, the hunter in the middle. */
function arena(seed = 1) {
  const h = createHunter(new Rng(seed), 1, [], 'sword');
  const run = new TowerRun(h, new Rng(seed));
  for (let y = 1; y < 24; y++) for (let x = 1; x < 39; x++) run.map.tiles[y][x] = Tile.Floor;
  run.monsters = [];
  run.chests = [];
  run.merchant = undefined;
  run.pos = { x: 20, y: 12 };
  return run;
}

let nextId = 500;
function put(run: TowerRun, kind: MonsterKind, x: number, y: number, over: Partial<Monster> = {}): Monster {
  const m: Monster = { id: nextId++, kind, x, y, hp: kind.hp, maxHp: kind.hp, atk: kind.atk, def: kind.def, awake: true, ...over };
  run.monsters.push(m);
  return m;
}

describe('regeneration stats', () => {
  it('each class starts with its own regeneration, and levels add a little', () => {
    const h = createHunter(new Rng(1), 1, [], 'knight');
    expect(h.hpRegen).toBe(CLASSES.knight.regen.hp);
    expect(h.mpRegen).toBe(CLASSES.knight.regen.mp);
    levelUp(h);
    expect(h.hpRegen).toBeGreaterThan(CLASSES.knight.regen.hp);
    expect(baseRegen('knight', 2)).toEqual({ hp: h.hpRegen, mp: h.mpRegen });
  });

  it('health and mana come back a fraction per turn', () => {
    const run = arena();
    const h = run.hunter;
    h.hpRegen = 0.25;
    h.mpRegen = 0.5;
    h.hp = 10;
    h.mp = 0;
    for (let i = 0; i < 8; i++) run.act({ type: 'wait' });
    expect(h.hp).toBe(12);
    expect(h.mp).toBe(4);
  });

  it('old saves get the regeneration their class and level would have', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const state = newGame(new Rng(2));
    const h = state.slots[0]!;
    levelUp(h);
    levelUp(h);
    delete (h as Partial<typeof h>).hpRegen;
    delete (h as Partial<typeof h>).mpRegen;
    saveGame(storage, state);
    const back = loadGame(storage)!.slots[0]!;
    expect({ hp: back.hpRegen, mp: back.mpRegen }).toEqual(baseRegen(h.cls, 3));
  });
});

describe('monster traits', () => {
  it('every ordinary kind has a trait', () => {
    for (const id of ['goblin', 'archer', 'wolf', 'orc', 'lizard', 'knight', 'shaman', 'beast']) expect(MONSTERS[id].trait).toBeDefined();
  });

  it('goblins come in packs', () => {
    let packed = 0;
    for (let s = 1; s <= 20; s++) {
      const run = new TowerRun(createHunter(new Rng(s), 1, [], 'sword'), new Rng(s));
      const gob = run.monsters.filter((m) => m.kind.id === 'goblin');
      if (gob.some((a) => gob.some((b) => a !== b && Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1))) packed++;
    }
    expect(packed).toBeGreaterThan(10);
  });

  it('a waking goblin wakes its pack', () => {
    const run = arena();
    const a = put(run, MONSTERS.goblin, 26, 12, { awake: false });
    const b = put(run, MONSTERS.goblin, 30, 12, { awake: false });
    run.act({ type: 'move', dx: 1, dy: 0 }); // a is now in sight (5 tiles), b (9) is not
    expect(a.awake).toBe(true);
    expect(b.awake).toBe(true);
  });

  it('wolves close two tiles a turn', () => {
    const run = arena();
    const w = put(run, MONSTERS.wolf, 26, 12);
    run.act({ type: 'wait' });
    expect(w.x).toBe(24);
  });

  it('orcs hit harder below half health', () => {
    const run = arena();
    const h = run.hunter;
    h.def = 0;
    h.maxHp = h.hp = 999;
    const o = put(run, MONSTERS.orc, 21, 12, { atk: 20 });
    run.act({ type: 'wait' });
    const calm = 999 - h.hp;
    h.hp = 999;
    o.hp = Math.floor(o.maxHp * TRAIT_RULES.rageAt);
    run.act({ type: 'wait' });
    expect(999 - h.hp).toBeGreaterThanOrEqual(Math.floor(calm * 1.4));
  });

  it('lizardmen heal every turn', () => {
    const run = arena();
    const l = put(run, MONSTERS.lizard, 30, 20, { awake: false, hp: 10 });
    run.act({ type: 'wait' });
    expect(l.hp).toBeGreaterThan(10);
  });

  it('shadow knights only show within two tiles', () => {
    const run = arena();
    const k = put(run, MONSTERS.knight, 24, 12);
    expect(run.canSee(k)).toBe(false);
    k.x = 22;
    expect(run.canSee(k)).toBe(true);
  });

  it('shamans mend hurt allies', () => {
    const run = arena();
    put(run, MONSTERS.shaman, 30, 12);
    const o = put(run, MONSTERS.orc, 31, 14, { hp: 5, maxHp: 40 });
    while (run.turn % TRAIT_RULES.healEvery !== 0) run.turn++;
    run.act({ type: 'wait' });
    expect(o.hp).toBeGreaterThan(5);
  });

  it('beasts prick whoever hits them up close, but never kill', () => {
    const run = arena();
    const h = run.hunter;
    put(run, MONSTERS.beast, 21, 12, { hp: 500, maxHp: 500, atk: 0 });
    h.atk = 40;
    const before = h.hp;
    run.act({ type: 'move', dx: 1, dy: 0 });
    expect(h.hp).toBeLessThan(before);
    // At 1 health the spikes have nothing left to take.
    h.hp = 1;
    run.log.length = 0;
    run.act({ type: 'move', dx: 1, dy: 0 });
    expect(run.log.some((l) => l.includes('가시'))).toBe(false);
  });

  it('archers step back when the hunter gets close', () => {
    let backed = 0;
    for (let s = 1; s <= 20; s++) {
      const run = arena(s);
      const a = put(run, MONSTERS.archer, 21, 12);
      run.act({ type: 'wait' });
      if (a.x > 21) backed++;
    }
    expect(backed).toBeGreaterThan(5);
  });
});

describe('lingering on a floor', () => {
  it('new monsters wander in out of sight', () => {
    const run = arena();
    run.hunter.maxHp = run.hunter.hp = 9999;
    for (let i = 0; i < RESPAWN_EVERY; i++) run.act({ type: 'wait' });
    expect(run.monsters.length).toBe(1);
    expect(run.isVisible(run.monsters[0].x, run.monsters[0].y)).toBe(false);
  });

  it('the abyss stalker comes when time runs out, cannot be hurt, and more follow', () => {
    const run = arena();
    const h = run.hunter;
    h.maxHp = h.hp = 99999;
    h.def = 0;
    expect(run.stalkerIn).toBe(STALKER_FIRST);
    run.floorTurn = STALKER_FIRST - 1;
    run.act({ type: 'wait' });
    const st = run.monsters.find((m) => m.kind.stalker)!;
    expect(st).toBeDefined();
    expect(st.awake).toBe(true);
    expect(run.drainEvents().some((e) => e.type === 'stalker')).toBe(true);
    expect(run.stalkerIn).toBe(STALKER_NEXT);
    // It finds the hunter.
    run.monsters = [st];
    for (let i = 0; i < 80 && Math.abs(st.x - run.pos.x) + Math.abs(st.y - run.pos.y) > 1; i++) run.act({ type: 'wait' });
    expect(Math.abs(st.x - run.pos.x) + Math.abs(st.y - run.pos.y)).toBe(1);
    // It cannot be hurt.
    const hp = st.hp;
    h.atk = 9999;
    run.act({ type: 'move', dx: st.x - run.pos.x, dy: st.y - run.pos.y });
    expect(st.hp).toBe(hp);
    expect(run.monsters).toContain(st);
    // The next one is stronger.
    run.floorTurn = STALKER_FIRST + STALKER_NEXT - 1;
    run.act({ type: 'wait' });
    const all = run.monsters.filter((m) => m.kind.stalker);
    expect(all).toHaveLength(2);
    expect(all[1].atk).toBeGreaterThan(all[0].atk);
  });

  it('a new floor resets the clock', () => {
    const run = arena();
    run.floorTurn = 200;
    run.enterFloor(2);
    expect(run.floorTurn).toBe(0);
    expect(run.stalkerIn).toBe(STALKER_FIRST);
  });
});
