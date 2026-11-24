import { describe, expect, it } from 'vitest';
import { createHunter } from '../src/core/hunter';
import { MONSTERS } from '../src/core/monsters';
import { Rng } from '../src/core/rng';
import { Monster, TowerRun } from '../src/core/run';
import { Tile } from '../src/core/dungeon';

/** An open room with the hunter in the middle and given monsters around. */
function setup(cls: 'mage' | 'archer' | 'sword', skill: 'icebolt' | 'pierce' | 'charge', foes: Array<[number, number]>) {
  const h = createHunter(new Rng(1), 1, [], cls);
  h.skills = [{ id: skill, lv: 1 }];
  h.mp = h.maxMp = 50;
  const run = new TowerRun(h, new Rng(1));
  for (let y = 0; y < run.map.tiles.length; y++) for (let x = 0; x < run.map.tiles[0].length; x++) run.map.tiles[y][x] = Tile.Floor;
  run.pos = { x: 10, y: 10 };
  run.facing = { x: 1, y: 0 };
  run.monsters = foes.map(([dx, dy], i): Monster => ({
    id: 100 + i, kind: { ...MONSTERS.goblin, hp: 999 }, x: 10 + dx, y: 10 + dy, hp: 999, maxHp: 999, atk: 0, def: 0, awake: true,
  }));
  (run as unknown as { updateSight(): void }).updateSight();
  return run;
}

describe('straight-line skills aim themselves', () => {
  it('turns toward an enemy in line when none is ahead', () => {
    const run = setup('mage', 'icebolt', [[0, -3]]);
    expect(run.act({ type: 'skill', slot: 0 })).toBe(true);
    expect(run.facing).toEqual({ x: 0, y: -1 });
    expect(run.monsters[0].hp).toBeLessThan(999);
  });

  it('keeps the enemy it already faces, even if another one is closer', () => {
    const run = setup('archer', 'pierce', [[4, 0], [0, 1]]);
    run.act({ type: 'skill', slot: 0 });
    expect(run.facing).toEqual({ x: 1, y: 0 });
    expect(run.monsters[0].hp).toBeLessThan(999);
    expect(run.monsters[1].hp).toBe(999);
  });

  it('picks the nearest of several lines, and ignores enemies out of reach', () => {
    const run = setup('sword', 'charge', [[0, 2], [-1, 0], [0, -6]]);
    run.act({ type: 'skill', slot: 0 });
    expect(run.facing).toEqual({ x: -1, y: 0 });
  });

  it('with nobody in line, nothing happens and no mana is spent', () => {
    const run = setup('mage', 'icebolt', [[2, 3]]);
    const mp = run.hunter.mp;
    expect(run.act({ type: 'skill', slot: 0 })).toBe(false);
    expect(run.hunter.mp).toBe(mp);
  });
});
