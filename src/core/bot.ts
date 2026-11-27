import { isWalkable, mapWidth, Point } from './dungeon';
import { skillCost, SkillId } from './classes';
import { Action, TowerRun } from './run';

/** First step of a shortest walkable path from the hunter to the goal (monsters treated as passable). */
export function stepTowards(run: TowerRun, goal: Point): Action | undefined {
  const start = run.pos;
  const prev = new Map<number, number>();
  const W = mapWidth(run.map);
  const key = (x: number, y: number) => y * W + x;
  const queue: Point[] = [start];
  prev.set(key(start.x, start.y), -1);
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    if (p.x === goal.x && p.y === goal.y) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (!isWalkable(run.map, nx, ny) || prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), key(p.x, p.y));
      queue.push({ x: nx, y: ny });
    }
  }
  let cur = key(goal.x, goal.y);
  if (!prev.has(cur)) return undefined;
  const startKey = key(start.x, start.y);
  while (prev.get(cur) !== startKey) {
    const p = prev.get(cur);
    if (p === undefined || p === -1) return undefined;
    cur = p;
  }
  return { type: 'move', dx: (cur % W) - start.x, dy: Math.floor(cur / W) - start.y };
}

/** Skills that always find something to do with an enemy next to the hunter. */
const SURE_IN_MELEE: SkillId[] = [
  'spin', 'smash', 'stance', 'warcry', 'storm', 'fireball', 'chain', 'manashield', 'meteor',
  'backshot', 'poison', 'volley', 'rain', 'block', 'taunt', 'bash', 'bulwark', 'sanctuary',
];

/** The first skill slot that is off cooldown, affordable and sure to work in melee. */
export function readySlot(run: TowerRun): number | undefined {
  const h = run.hunter;
  const i = h.skills.findIndex((s) => SURE_IN_MELEE.includes(s.id) && !run.cooldowns[s.id] && h.mp >= skillCost(s));
  return i >= 0 ? i : undefined;
}

/** Skills that break a wind-up on an enemy right next to the hunter. */
const BREAK_ADJACENT: SkillId[] = ['smash', 'bash', 'backshot', 'chain', 'taunt'];

/** Breaks the wind-up of an adjacent enemy when a skill for it is ready. */
export function breakSkill(run: TowerRun): Action | undefined {
  const h = run.hunter;
  const winding = run.monsters.some((m) => m.windup && Math.abs(m.x - run.pos.x) + Math.abs(m.y - run.pos.y) === 1);
  if (!winding) return undefined;
  const i = h.skills.findIndex((s) => BREAK_ADJACENT.includes(s.id) && !run.cooldowns[s.id] && h.mp >= skillCost(s));
  return i >= 0 ? { type: 'skill', slot: i } : undefined;
}

/** A step off red tiles that go off next enemy turn, if the hunter stands on one. */
export function dodgeStep(run: TowerRun): Action | undefined {
  const danger = run.dangerTiles().filter((t) => t.turns <= 1);
  const bad = (x: number, y: number) => danger.some((t) => t.x === x && t.y === y);
  if (!bad(run.pos.x, run.pos.y)) return undefined;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = run.pos.x + dx;
    const y = run.pos.y + dy;
    if (isWalkable(run.map, x, y) && !run.monsterAt(x, y) && !run.merchantAt(x, y) && !bad(x, y)) return { type: 'move', dx, dy };
  }
  return undefined;
}

/** A simple autoplayer used to test balance: fight what it sees, then head for the stairs. */
export function botAction(run: TowerRun, dodge = true): Action {
  const h = run.hunter;
  if (h.hp < h.maxHp * 0.35 && h.bag.hp > 0 && run.gate?.rule !== 'sealed') return { type: 'use', item: 'hp' };
  const answer = dodge ? breakSkill(run) ?? dodgeStep(run) : undefined;
  if (answer) return answer;
  const adjacent = run.monsters.filter((m) => Math.abs(m.x - run.pos.x) <= 1 && Math.abs(m.y - run.pos.y) <= 1);
  const slot = readySlot(run);
  if (adjacent.length >= 2 && slot !== undefined) return { type: 'skill', slot };
  const visible = run.monsters
    .filter((m) => run.canSee(m) && !m.kind.stalker)
    .sort((a, b) => Math.abs(a.x - run.pos.x) + Math.abs(a.y - run.pos.y) - (Math.abs(b.x - run.pos.x) + Math.abs(b.y - run.pos.y)));
  const goal = visible[0] ?? (run.bossAlive ? run.monsters.find((m) => m.kind.boss) : undefined) ?? run.map.stairs;
  return stepTowards(run, goal) ?? { type: 'wait' };
}
