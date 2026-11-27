import { describe, expect, it } from 'vitest';
import { Tile } from '../src/core/dungeon';
import { createHunter } from '../src/core/hunter';
import { SKILLS } from '../src/core/classes';
import { ABILITIES, abilitiesOf, bossFor, eliteOf, MONSTER_MP, MONSTERS, MonsterKind } from '../src/core/monsters';
import { Rng } from '../src/core/rng';
import { Monster, TowerRun } from '../src/core/run';
import { dodgeStep } from '../src/core/bot';

/** An open floor with nothing in it, the hunter in the middle. */
function arena(seed = 1, cls: 'sword' | 'mage' | 'archer' | 'knight' = 'sword') {
  const h = createHunter(new Rng(seed), 1, [], cls);
  h.maxHp = h.hp = 500;
  const run = new TowerRun(h, new Rng(seed));
  for (let y = 1; y < 24; y++) for (let x = 1; x < 39; x++) run.map.tiles[y][x] = Tile.Floor;
  run.monsters = [];
  run.chests = [];
  run.merchant = undefined;
  run.pos = { x: 20, y: 12 };
  return run;
}

let nextId = 900;
function put(run: TowerRun, kind: MonsterKind, x: number, y: number, over: Partial<Monster> = {}): Monster {
  const m: Monster = { id: nextId++, kind, x, y, hp: kind.hp, maxHp: kind.hp, atk: kind.atk, def: kind.def, awake: true, ...over };
  run.monsters.push(m);
  return m;
}

describe('telegraphed monster moves', () => {
  it('an orc winds up its slam a turn ahead, and the red tiles cover the hunter', () => {
    let seen = false;
    for (let s = 1; s <= 20 && !seen; s++) {
      const run = arena(s);
      const o = put(run, MONSTERS.orc, 21, 12, { hp: 999, maxHp: 999 });
      run.act({ type: 'wait' });
      if (!o.windup) continue;
      seen = true;
      expect(o.windup.id).toBe('slam');
      const tiles = run.dangerTiles();
      expect(tiles.some((t) => t.x === 20 && t.y === 12)).toBe(true);
      expect(tiles.length).toBe(3);
    }
    expect(seen).toBe(true);
  });

  it('stepping off the red tiles dodges the hit; staying takes it hard', () => {
    const hits = (dodge: boolean) => {
      const run = arena(3);
      const o = put(run, MONSTERS.orc, 21, 12, { hp: 999, maxHp: 999, atk: 10, windup: { id: 'slam', turns: 1, tiles: [{ x: 20, y: 11 }, { x: 20, y: 12 }, { x: 20, y: 13 }] }, cd: { slam: 4 } });
      const hp = run.hunter.hp;
      run.act(dodge ? { type: 'move', dx: -1, dy: 0 } : { type: 'wait' });
      expect(o.windup).toBeUndefined();
      return hp - run.hunter.hp;
    };
    expect(hits(true)).toBe(0);
    expect(hits(false)).toBeGreaterThanOrEqual(Math.floor(10 * ABILITIES.slam.mult!) - 5);
  });

  it('the bot steps off tiles about to go off', () => {
    const run = arena(4);
    put(run, MONSTERS.orc, 21, 12, { windup: { id: 'slam', turns: 1, tiles: [{ x: 20, y: 11 }, { x: 20, y: 12 }, { x: 20, y: 13 }] } });
    const step = dodgeStep(run);
    expect(step).toEqual({ type: 'move', dx: -1, dy: 0 });
  });

  it('a stun breaks the wind-up, and a winding-up foe takes extra damage', () => {
    const run = arena(5);
    const h = run.hunter;
    h.skills = [{ id: 'smash', lv: 1 }];
    h.mp = 50;
    const o = put(run, MONSTERS.orc, 21, 12, { hp: 999, maxHp: 999, def: 0, windup: { id: 'slam', turns: 1, tiles: [{ x: 20, y: 12 }] }, cd: { slam: 4 } });
    run.facing = { x: 1, y: 0 };
    const before = h.hp;
    run.act({ type: 'skill', slot: 0 });
    expect(o.windup).toBeUndefined();
    expect(run.log.some((l) => l.includes('끊었다') || l.includes('Broke'))).toBe(true);
    // The slam never landed: at most the orc's ordinary hit, if it chose to swing.
    expect(before - h.hp).toBeLessThan(o.atk * 2);
  });

  it('bomb goblins blow up their 3×3 after two turns and hurt monsters too', () => {
    const run = arena(6);
    const b = put(run, MONSTERS.bomber, 22, 12, { atk: 10 });
    const other = put(run, MONSTERS.goblin, 23, 12, { hp: 999, maxHp: 999 });
    run.act({ type: 'wait' });
    expect(b.windup?.id).toBe('fuse');
    run.act({ type: 'wait' });
    expect(run.monsters.includes(b)).toBe(true);
    run.act({ type: 'wait' });
    expect(run.monsters.includes(b)).toBe(false);
    expect(other.hp).toBeLessThan(999);
  });

  it('beasts curl up: plain hits do little, a defense-piercing smash cracks the shell', () => {
    const run = arena(7);
    const h = run.hunter;
    h.atk = 30;
    const m = put(run, MONSTERS.beast, 21, 12, { hp: 9999, maxHp: 9999, def: 0, atk: 0, shell: 2 });
    run.facing = { x: 1, y: 0 };
    run.act({ type: 'move', dx: 1, dy: 0 });
    const plain = 9999 - m.hp;
    expect(plain).toBeLessThan(15);
    h.skills = [{ id: 'smash', lv: 1 }];
    h.mp = 50;
    run.act({ type: 'skill', slot: 0 });
    expect(m.shell).toBeUndefined();
  });
});

describe('boss moves and mana', () => {
  it('every boss has the ground slam and moves of its own', () => {
    for (const f of [5, 10, 15, 20]) {
      const boss = bossFor(f)!;
      const moves = abilitiesOf(boss);
      expect(moves).toContain('quake');
      expect(moves.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('bosses spawn with a mana bar', () => {
    const run = arena(8);
    run.enterFloor(10);
    const boss = run.monsters.find((m) => m.kind.boss)!;
    expect(boss.maxMp).toBe(MONSTER_MP.big);
    expect(boss.mp).toBe(MONSTER_MP.big);
  });

  it('a boss heal costs mana, has a cooldown, and a stun breaks it', () => {
    const run = arena(9);
    const boss = put(run, MONSTERS.overlord, 30, 12, { hp: 100, maxHp: 300, mp: 40, maxMp: 40 });
    run.act({ type: 'wait' });
    expect(boss.windup?.id).toBe('recover');
    expect(boss.mp).toBeLessThan(40 - ABILITIES.recover.mp! + 2);
    expect(boss.cd?.recover).toBeGreaterThan(0);
    run.act({ type: 'wait' });
    expect(boss.hp).toBe(100 + Math.ceil(300 * 0.2));
    // Out of mana and on cooldown: no second heal soon after.
    boss.hp = 100;
    for (let i = 0; i < 5; i++) run.act({ type: 'wait' });
    expect(boss.hp).toBe(100);
  });

  it('regenerating mid-bosses cast a heal instead of healing every turn', () => {
    const elite = eliteOf(MONSTERS.lizard);
    expect(abilitiesOf(elite)).toContain('recover');
    const run = arena(10);
    const m = put(run, elite, 30, 12, { hp: 10, maxHp: 100, mp: 0, maxMp: 20, awake: false });
    run.act({ type: 'wait' });
    expect(m.hp).toBe(10);
  });

  it('shamans heal bosses only a little', () => {
    const run = arena(11);
    put(run, MONSTERS.shaman, 30, 12, { mp: 20, maxMp: 20 });
    const boss = put(run, MONSTERS.warden, 31, 13, { hp: 100, maxHp: 1000, awake: false, cd: { quake: 9, summon: 9 } });
    run.act({ type: 'wait' });
    expect(boss.hp).toBe(100 + 120);
  });
});

describe('skill cooldowns and combos', () => {
  it('a skill must wait its cooldown before it can be used again', () => {
    const run = arena(12);
    const h = run.hunter;
    h.skills = [{ id: 'spin', lv: 1 }];
    h.mp = 99;
    put(run, MONSTERS.goblin, 21, 12, { hp: 9999, maxHp: 9999, atk: 0 });
    expect(run.act({ type: 'skill', slot: 0 })).toBe(true);
    expect(run.cooldowns.spin).toBe(SKILLS.spin.cd);
    expect(run.act({ type: 'skill', slot: 0 })).toBe(false);
    for (let i = 0; i < SKILLS.spin.cd; i++) run.act({ type: 'wait' });
    expect(run.act({ type: 'skill', slot: 0 })).toBe(true);
  });

  it('meteor cannot be cast turn after turn', () => {
    expect(SKILLS.meteor.cd).toBeGreaterThanOrEqual(10);
  });

  it('fire on a frozen enemy shatters the ice for more damage', () => {
    const dealt = (frozen: boolean) => {
      const run = arena(13, 'mage');
      const h = run.hunter;
      h.atk = 20;
      h.skills = [{ id: 'fireball', lv: 1 }];
      h.mp = 99;
      const m = put(run, { ...MONSTERS.goblin, weak: undefined }, 22, 12, { hp: 9999, maxHp: 9999, atk: 0, def: 0 });
      if (frozen) {
        m.stun = 2;
        m.frozen = true;
      }
      run.act({ type: 'skill', slot: 0 });
      return 9999 - m.hp;
    };
    expect(dealt(true)).toBeGreaterThanOrEqual(dealt(false) * 1.4);
  });

  it('cooldowns survive a save and reload', () => {
    const run = arena(14);
    run.cooldowns.spin = 3;
    const back = TowerRun.restore(JSON.parse(JSON.stringify(run.snapshot())), run.hunter, new Rng(1))!;
    expect(back.cooldowns.spin).toBe(3);
  });
});
