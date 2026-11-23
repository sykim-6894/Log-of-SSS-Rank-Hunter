import { FloorMap, generateFloor, isWalkable, MAP_H, MAP_W, Point, Tile, center } from './dungeon';
import { gainExp, Hunter } from './hunter';
import { bossFor, floorScale, MonsterKind, monsterPool, TOP_FLOOR } from './monsters';
import { Rng } from './rng';

export interface Monster {
  id: number;
  kind: MonsterKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  awake: boolean;
}

export type Action =
  | { type: 'move'; dx: number; dy: number }
  | { type: 'wait' }
  | { type: 'skill' }
  | { type: 'potion' };

export type RunStatus = 'playing' | 'onStairs' | 'dead' | 'returned';

export const SIGHT = 7;
export const SKILL_NAME = '회전베기';
export const SKILL_COST = 5;
export const POTION_HEAL = 0.4;
const MP_REGEN_EVERY = 4;

/** One trip into the Tower of Growth. Pure game rules, no drawing. */
export class TowerRun {
  floor = 0;
  map!: FloorMap;
  monsters: Monster[] = [];
  pos: Point = { x: 0, y: 0 };
  /** Gold earned this run. Lost if the hunter dies. */
  runGold = 0;
  turn = 0;
  status: RunStatus = 'playing';
  seen: boolean[][] = [];
  log: string[] = [];
  killer?: string;
  private nextId = 1;

  constructor(
    public hunter: Hunter,
    private rng: Rng,
  ) {
    this.enterFloor(1);
  }

  get bossAlive(): boolean {
    return this.monsters.some((m) => m.kind.boss);
  }

  get isTopFloor(): boolean {
    return this.floor >= TOP_FLOOR;
  }

  private say(msg: string) {
    this.log.push(msg);
    if (this.log.length > 50) this.log.shift();
  }

  enterFloor(n: number) {
    this.floor = n;
    this.map = generateFloor(this.rng);
    this.pos = { ...this.map.start };
    this.monsters = [];
    this.seen = Array.from({ length: MAP_H }, () => Array<boolean>(MAP_W).fill(false));
    this.status = 'playing';
    this.hunter.bestFloor = Math.max(this.hunter.bestFloor, n);

    const pool = monsterPool(n);
    const count = 3 + n;
    const rooms = this.map.rooms.slice(1);
    for (let i = 0; i < count; i++) {
      const room = this.rng.pick(rooms);
      const x = this.rng.int(room.x, room.x + room.w - 1);
      const y = this.rng.int(room.y, room.y + room.h - 1);
      if (this.blocked(x, y) || this.map.tiles[y][x] === Tile.Stairs) continue;
      this.spawn(this.rng.pick(pool), x, y, n);
    }

    const boss = bossFor(n);
    if (boss) {
      const c = center(this.map.rooms[this.map.rooms.length - 1]);
      const spot = [
        { x: c.x - 1, y: c.y },
        { x: c.x + 1, y: c.y },
        { x: c.x, y: c.y - 1 },
        { x: c.x, y: c.y + 1 },
      ].find((p) => isWalkable(this.map, p.x, p.y) && !this.blocked(p.x, p.y));
      if (spot) {
        this.spawn(boss, spot.x, spot.y, n);
        this.say(`${n}층에 ${boss.name}의 기척이 느껴진다.`);
      }
    }
    this.say(`성장의 탑 ${n}층에 들어섰다.`);
    this.updateSight();
  }

  private spawn(kind: MonsterKind, x: number, y: number, floor: number) {
    const s = floorScale(floor);
    const hp = Math.round(kind.hp * s);
    this.monsters.push({
      id: this.nextId++,
      kind,
      x,
      y,
      hp,
      maxHp: hp,
      atk: Math.round(kind.atk * s),
      def: Math.round(kind.def * s),
      awake: false,
    });
  }

  monsterAt(x: number, y: number): Monster | undefined {
    return this.monsters.find((m) => m.x === x && m.y === y);
  }

  private blocked(x: number, y: number): boolean {
    return !!this.monsterAt(x, y) || (this.pos.x === x && this.pos.y === y);
  }

  isVisible(x: number, y: number): boolean {
    const dx = x - this.pos.x;
    const dy = y - this.pos.y;
    return dx * dx + dy * dy <= SIGHT * SIGHT;
  }

  private updateSight() {
    for (let y = Math.max(0, this.pos.y - SIGHT); y <= Math.min(MAP_H - 1, this.pos.y + SIGHT); y++) {
      for (let x = Math.max(0, this.pos.x - SIGHT); x <= Math.min(MAP_W - 1, this.pos.x + SIGHT); x++) {
        if (this.isVisible(x, y)) this.seen[y][x] = true;
      }
    }
  }

  private damage(atk: number, def: number, mult = 1): number {
    return Math.max(1, Math.floor(atk * mult) + this.rng.int(0, 2) - def);
  }

  /** Runs one player action. Returns false when the action did not use a turn. */
  act(action: Action): boolean {
    if (this.status !== 'playing') return false;
    const used = this.playerAct(action);
    if (!used) return false;
    if (this.status === 'playing' || this.status === 'onStairs') this.monstersAct();
    this.turn += 1;
    if (this.turn % MP_REGEN_EVERY === 0) this.hunter.mp = Math.min(this.hunter.maxMp, this.hunter.mp + 1);
    this.updateSight();
    return true;
  }

  private playerAct(action: Action): boolean {
    const h = this.hunter;
    switch (action.type) {
      case 'wait':
        return true;
      case 'potion': {
        if (h.potions <= 0) {
          this.say('포션이 없다.');
          return false;
        }
        if (h.hp >= h.maxHp) {
          this.say('체력이 가득 차 있다.');
          return false;
        }
        const heal = Math.ceil(h.maxHp * POTION_HEAL);
        h.potions -= 1;
        h.hp = Math.min(h.maxHp, h.hp + heal);
        this.say(`포션을 마셨다. 체력 +${heal}`);
        return true;
      }
      case 'skill': {
        const targets = this.monsters.filter(
          (m) => Math.abs(m.x - this.pos.x) <= 1 && Math.abs(m.y - this.pos.y) <= 1,
        );
        if (targets.length === 0) {
          this.say(`${SKILL_NAME}: 주변에 적이 없다.`);
          return false;
        }
        if (h.mp < SKILL_COST) {
          this.say(`마나가 부족하다. (${SKILL_COST} 필요)`);
          return false;
        }
        h.mp -= SKILL_COST;
        this.say(`${SKILL_NAME}!`);
        for (const m of targets) this.hitMonster(m, this.damage(h.atk, m.def, 1.5));
        return true;
      }
      case 'move': {
        const nx = this.pos.x + action.dx;
        const ny = this.pos.y + action.dy;
        const target = this.monsterAt(nx, ny);
        if (target) {
          this.hitMonster(target, this.damage(h.atk, target.def));
          return true;
        }
        if (!isWalkable(this.map, nx, ny)) return false;
        this.pos = { x: nx, y: ny };
        if (this.map.tiles[ny][nx] === Tile.Stairs) {
          if (this.bossAlive) {
            this.say('수호자가 살아있는 한 계단은 열리지 않는다.');
          } else {
            this.status = 'onStairs';
          }
        }
        return true;
      }
    }
  }

  private hitMonster(m: Monster, dmg: number) {
    m.hp -= dmg;
    m.awake = true;
    if (m.hp > 0) {
      this.say(`${m.kind.name}에게 ${dmg} 피해.`);
      return;
    }
    this.monsters = this.monsters.filter((o) => o !== m);
    const gold = Math.round(m.kind.gold * floorScale(this.floor));
    this.runGold += gold;
    this.hunter.kills += 1;
    this.hunter.killScore += m.kind.score;
    this.say(`${m.kind.name} 처치! +${gold}G`);
    const levels = gainExp(this.hunter, Math.round(m.kind.exp * floorScale(this.floor)));
    if (levels > 0) this.say(`레벨 업! Lv.${this.hunter.level}`);
  }

  private monstersAct() {
    for (const m of this.monsters) {
      if (this.status === 'dead') return;
      const dx = this.pos.x - m.x;
      const dy = this.pos.y - m.y;
      if (!m.awake && dx * dx + dy * dy <= SIGHT * SIGHT) m.awake = true;
      if (!m.awake) continue;
      if (Math.abs(dx) + Math.abs(dy) === 1) {
        const dmg = this.damage(m.atk, this.hunter.def);
        this.hunter.hp -= dmg;
        this.say(`${m.kind.name}의 공격! ${dmg} 피해.`);
        if (this.hunter.hp <= 0) {
          this.hunter.hp = 0;
          this.status = 'dead';
          this.killer = m.kind.name;
          this.runGold = 0;
          this.say(`${this.hunter.name}은(는) ${m.kind.name}에게 쓰러졌다...`);
        }
        continue;
      }
      this.stepToward(m);
    }
  }

  private stepToward(m: Monster) {
    const dist = (x: number, y: number) => Math.abs(this.pos.x - x) + Math.abs(this.pos.y - y);
    let best: Point | undefined;
    let bestDist = dist(m.x, m.y);
    for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = m.x + ddx;
      const ny = m.y + ddy;
      if (!isWalkable(this.map, nx, ny) || this.blocked(nx, ny)) continue;
      const d = dist(nx, ny);
      if (d < bestDist) {
        bestDist = d;
        best = { x: nx, y: ny };
      }
    }
    if (best) {
      m.x = best.x;
      m.y = best.y;
    }
  }

  /** Go up from the stairs. Gives a floor-clear bonus. */
  climb(): boolean {
    if (this.status !== 'onStairs' || this.isTopFloor) return false;
    const bonus = 10 * this.floor;
    this.runGold += bonus;
    this.say(`${this.floor}층 돌파 보상 +${bonus}G`);
    this.enterFloor(this.floor + 1);
    return true;
  }

  /** Leave the tower from the stairs, keeping this run's gold. */
  retreat(): boolean {
    if (this.status !== 'onStairs') return false;
    const bonus = 10 * this.floor;
    this.runGold += bonus;
    this.say(`${this.floor}층 돌파 보상 +${bonus}G`);
    this.status = 'returned';
    return true;
  }

  /** Step off the stairs prompt and keep exploring the floor. */
  stay() {
    if (this.status === 'onStairs') this.status = 'playing';
  }
}
