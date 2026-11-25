import { describe, expect, it } from 'vitest';
import { SKILLS } from '../src/core/classes';
import { Tile } from '../src/core/dungeon';
import { createHunter } from '../src/core/hunter';
import { elementFactor, elementNote, MONSTERS, RESIST_MULT, WEAK_MULT } from '../src/core/monsters';
import { Rng } from '../src/core/rng';
import { Monster, TowerRun } from '../src/core/run';

/** Mage with one skill facing a single big goblin-shaped monster of the given kind two tiles right. */
function hitWith(skill: 'fireball' | 'icebolt', kindId: string) {
  const h = createHunter(new Rng(1), 1, [], 'mage');
  h.skills = [{ id: skill, lv: 1 }];
  h.mp = h.maxMp = 50;
  h.atk = 40;
  const run = new TowerRun(h, new Rng(1));
  for (let y = 0; y < run.map.tiles.length; y++) for (let x = 0; x < run.map.tiles[0].length; x++) run.map.tiles[y][x] = Tile.Floor;
  run.pos = { x: 10, y: 10 };
  run.facing = { x: 1, y: 0 };
  const kind = { ...MONSTERS[kindId], hp: 9999, def: 0, trait: undefined };
  const m: Monster = { id: 1, kind, x: 12, y: 10, hp: 9999, maxHp: 9999, atk: 0, def: 0, awake: true };
  run.monsters = [m];
  (run as unknown as { updateSight(): void }).updateSight();
  run.events = [];
  run.act({ type: 'skill', slot: 0 });
  return { dealt: 9999 - m.hp, events: run.events };
}

describe('elements', () => {
  it('mage skills carry an element', () => {
    expect(SKILLS.fireball.element).toBe('fire');
    expect(SKILLS.icebolt.element).toBe('ice');
    expect(SKILLS.chain.element).toBe('lightning');
    expect(SKILLS.spin.element).toBeUndefined();
  });

  it('weakness takes 1.5x, resistance half', () => {
    expect(elementFactor(MONSTERS.wolf, 'fire')).toBe(WEAK_MULT);
    expect(elementFactor(MONSTERS.wolf, 'ice')).toBe(RESIST_MULT);
    expect(elementFactor(MONSTERS.wolf, 'lightning')).toBe(1);
    expect(elementFactor(MONSTERS.wolf)).toBe(1);
    expect(elementNote(MONSTERS.wolf)).toBe('약점 화염 · 저항 냉기');
  });

  it('fire burns a wolf far harder than ice does, and says so', () => {
    const fire = hitWith('fireball', 'wolf');
    const ice = hitWith('icebolt', 'wolf');
    expect(fire.events.some((e) => e.type === 'element' && e.weak)).toBe(true);
    expect(ice.events.some((e) => e.type === 'element' && !e.weak)).toBe(true);
    // Fireball is ×2.0 and ice bolt ×1.3; with the elements the gap grows to about 4.6x.
    expect(fire.dealt).toBeGreaterThan(ice.dealt * 3);
  });

  it('every ordinary monster has a weakness to aim for', () => {
    for (const id of ['goblin', 'archer', 'wolf', 'orc', 'lizard', 'knight', 'shaman', 'beast']) {
      expect(MONSTERS[id].weak).toBeDefined();
    }
  });
});
