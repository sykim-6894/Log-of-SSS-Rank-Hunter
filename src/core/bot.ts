import { isWalkable, MAP_H, MAP_W, Point } from './dungeon';
import { Action, SKILL_COST, TowerRun } from './run';

/** First step of a shortest walkable path from the hunter to the goal (monsters treated as passable). */
export function stepTowards(run: TowerRun, goal: Point): Action | undefined {
  const start = run.pos;
  const prev = new Map<number, number>();
  const key = (x: number, y: number) => y * MAP_W + x;
  const queue: Point[] = [start];
  prev.set(key(start.x, start.y), -1);
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    if (p.x === goal.x && p.y === goal.y) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
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
  return { type: 'move', dx: (cur % MAP_W) - start.x, dy: Math.floor(cur / MAP_W) - start.y };
}

/** A simple autoplayer used to test balance: fight what it sees, then head for the stairs. */
export function botAction(run: TowerRun): Action {
  const h = run.hunter;
  if (h.hp < h.maxHp * 0.35 && h.bag.hp > 0) return { type: 'use', item: 'hp' };
  const adjacent = run.monsters.filter((m) => Math.abs(m.x - run.pos.x) <= 1 && Math.abs(m.y - run.pos.y) <= 1);
  if (adjacent.length >= 2 && h.mp >= SKILL_COST) return { type: 'skill' };
  const visible = run.monsters
    .filter((m) => run.isVisible(m.x, m.y))
    .sort((a, b) => Math.abs(a.x - run.pos.x) + Math.abs(a.y - run.pos.y) - (Math.abs(b.x - run.pos.x) + Math.abs(b.y - run.pos.y)));
  const goal = visible[0] ?? (run.bossAlive ? run.monsters.find((m) => m.kind.boss) : undefined) ?? run.map.stairs;
  return stepTowards(run, goal) ?? { type: 'wait' };
}
