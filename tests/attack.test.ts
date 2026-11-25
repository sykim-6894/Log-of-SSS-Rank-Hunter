import { describe, expect, it } from 'vitest';
import { Tile } from '../src/core/dungeon';
import { createHunter } from '../src/core/hunter';
import { MONSTERS } from '../src/core/monsters';
import { Rng } from '../src/core/rng';
import { Monster, TowerRun } from '../src/core/run';

function setup(cls: 'archer' | 'sword', foes: Array<[number, number]>) {
  const h = createHunter(new Rng(1), 1, [], cls);
  h.atk = 20;
  const run = new TowerRun(h, new Rng(1));
  for (let y = 0; y < run.map.tiles.length; y++) for (let x = 0; x < run.map.tiles[0].length; x++) run.map.tiles[y][x] = Tile.Floor;
  run.pos = { x: 10, y: 10 };
  run.facing = { x: 1, y: 0 };
  run.monsters = foes.map(([dx, dy], i): Monster => ({
    id: 100 + i, kind: { ...MONSTERS.goblin, hp: 999, trait: undefined }, x: 10 + dx, y: 10 + dy, hp: 999, maxHp: 999, atk: 0, def: 0, awake: true,
  }));
  (run as unknown as { updateSight(): void }).updateSight();
  return run;
}

describe('attack in place', () => {
  it('hits the enemy beside the hunter without moving, turning to face it', () => {
    const run = setup('sword', [[0, 1]]);
    expect(run.act({ type: 'attack' })).toBe(true);
    expect(run.pos).toEqual({ x: 10, y: 10 });
    expect(run.facing).toEqual({ x: 0, y: 1 });
    expect(run.monsters[0].hp).toBeLessThan(999);
  });

  it('prefers the enemy in front', () => {
    const run = setup('sword', [[0, -1], [1, 0]]);
    run.act({ type: 'attack' });
    expect(run.monsters[1].hp).toBeLessThan(999);
    expect(run.monsters[0].hp).toBe(999);
  });

  it('a sword with nobody beside them does nothing and loses no turn', () => {
    const run = setup('sword', [[3, 0]]);
    const turn = run.turn;
    expect(run.act({ type: 'attack' })).toBe(false);
    expect(run.turn).toBe(turn);
  });

  it('an archer shoots an enemy in line within 3 tiles, in any direction', () => {
    const run = setup('archer', [[0, -3]]);
    let hit = false;
    for (let i = 0; i < 5 && !hit; i++) {
      expect(run.act({ type: 'attack' })).toBe(true);
      hit = run.monsters[0].hp < 999;
    }
    expect(run.facing).toEqual({ x: 0, y: -1 });
    expect(run.pos).toEqual({ x: 10, y: 10 });
    expect(hit).toBe(true);
  });

  it('an archer does not shoot past 3 tiles', () => {
    const run = setup('archer', [[4, 0]]);
    expect(run.act({ type: 'attack' })).toBe(false);
  });
});
