import { FloorMap, generateFloor, isWalkable, MAP_H, MAP_W, Point, Tile, center } from './dungeon';
import { gainExp, Hunter } from './hunter';
import type { EncounterOutcome } from './agency';
import { bossFor, floorScale, MonsterKind, monsterPool, TOP_FLOOR } from './monsters';
import {
  addToBag,
  ChestContent,
  CONSUMABLES,
  ConsumableKind,
  CURSES,
  describeGear,
  equipIfBetter,
  Gear,
  GEAR_SLOT_NAMES,
  GUARD_TURNS,
  HP_POTION_HEAL,
  MP_POTION_RESTORE,
  rollChest,
  rollGear,
} from './items';
import { Rng } from './rng';

export interface Monster {
  id: number;
  kind: MonsterKind;
  /** Set when this enemy is a named hunter of the rival agency. */
  hunter?: Hunter;
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
  | { type: 'use'; item: ConsumableKind };

export type RunStatus = 'playing' | 'onStairs' | 'choosing' | 'dead' | 'returned';

export type RewardKind = 'item' | 'gold' | 'skill' | 'rescue';

export const REWARDS: Record<RewardKind, { label: string; describe: (level: number) => string }> = {
  item: { label: '아이템', describe: () => '높은 층 수준의 장비 1개' },
  gold: { label: '골드', describe: (lv) => `${lv * 15}G (헌터 소지금)` },
  skill: { label: '스킬', describe: () => '회전베기 위력 +25%' },
  rescue: { label: '위기 시 1회 지원', describe: () => '쓰러질 때 한 번 체력 30%로 버팀' },
};

/** Choice offered after beating a rival hunter: two random rewards, or finishing them for experience. */
export interface PendingChoice {
  hunter: Hunter;
  rewards: RewardKind[];
  finishExp: number;
}

export interface RunOptions {
  /** Hunters of the rival agency who may turn up in the tower. */
  rivals?: Hunter[];
  rivalAgency?: string;
  /** Chance per floor (from floor 2) that one of them appears. */
  encounterChance?: number;
}

export const SIGHT = 7;
export const SKILL_NAME = '회전베기';
export const SKILL_COST = 5;
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
  pendingChoice?: PendingChoice;
  /** Unopened treasure chests on this floor. */
  chests: Point[] = [];
  /** Turns left on a guard potion: enemy hits do nothing. */
  guardTurns = 0;
  /** Rival hunters beaten this run and whether they were finished for good. */
  encounters: EncounterOutcome[] = [];
  private nextId = 1;
  private met = new Set<number>();

  constructor(
    public hunter: Hunter,
    private rng: Rng,
    private options: RunOptions = {},
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

    this.maybeSpawnRival(n);
    this.placeChests(n);

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

  private maybeSpawnRival(floor: number) {
    const pool = (this.options.rivals ?? []).filter((h) => !this.met.has(h.id));
    if (floor < 2 || pool.length === 0) return;
    if (!this.rng.chance(this.options.encounterChance ?? 0.25)) return;
    // The hunter's own rival shows up more often than the others.
    const mine = pool.find((h) => h.rivalOf === this.hunter.id);
    const h = mine && this.rng.chance(0.5) ? mine : this.rng.pick(pool);
    const room = this.rng.pick(this.map.rooms.slice(1));
    const x = this.rng.int(room.x, room.x + room.w - 1);
    const y = this.rng.int(room.y, room.y + room.h - 1);
    if (this.blocked(x, y) || this.map.tiles[y][x] === Tile.Stairs) return;
    this.met.add(h.id);
    const agency = this.options.rivalAgency ?? '경쟁사';
    const kind: MonsterKind = {
      id: `hunter-${h.id}`,
      name: `${agency} ${h.name}`,
      glyph: 'H',
      hp: h.maxHp,
      atk: h.atk,
      def: h.def,
      exp: h.level * 12,
      gold: h.level * 8,
      score: 40 + h.level * 10,
    };
    this.monsters.push({ id: this.nextId++, kind, hunter: h, x, y, hp: h.maxHp, maxHp: h.maxHp, atk: h.atk, def: h.def, awake: false });
    const tag = h.origin === 'rival' ? '라이벌' : '옛 동료';
    this.say(`[${tag}] ${h.name}의 기척이 느껴진다...`);
  }

  /** One or two chests per floor (one more from floor 6), in rooms other than the start. */
  private placeChests(floor: number) {
    this.chests = [];
    const count = this.rng.int(1, 2) + (floor >= 6 ? 1 : 0);
    const rooms = this.map.rooms.slice(1);
    for (let tries = 0; this.chests.length < count && tries < 30; tries++) {
      const room = this.rng.pick(rooms);
      const x = this.rng.int(room.x, room.x + room.w - 1);
      const y = this.rng.int(room.y, room.y + room.h - 1);
      if (this.blocked(x, y) || this.map.tiles[y][x] !== Tile.Floor || this.chestAt(x, y) >= 0) continue;
      this.chests.push({ x, y });
    }
  }

  chestAt(x: number, y: number): number {
    return this.chests.findIndex((c) => c.x === x && c.y === y);
  }

  private openChest(index: number) {
    this.chests.splice(index, 1);
    this.applyChest(rollChest(this.rng, this.floor));
  }

  /** Public so tests can force a result. */
  applyChest(c: ChestContent) {
    const h = this.hunter;
    switch (c.type) {
      case 'gold':
        this.runGold += c.amount;
        this.say(`보물상자: ${c.amount}G!`);
        return;
      case 'consumable': {
        const got = addToBag(h, c.kind);
        this.say(got ? `보물상자: ${CONSUMABLES[c.kind].name}!` : `보물상자: ${CONSUMABLES[c.kind].name}... 가방이 가득 차서 두고 왔다.`);
        return;
      }
      case 'gear':
        this.say(`보물상자: ${c.gear.name}!`);
        this.takeGear(c.gear);
        return;
      case 'curse':
        this.say(`저주받은 상자였다! ${CURSES[c.curse]}`);
        if (c.curse === 'drain') h.hp = Math.max(1, h.hp - Math.ceil(h.maxHp * 0.25));
        if (c.curse === 'mana') h.mp = 0;
        if (c.curse === 'greed') this.runGold = Math.floor(this.runGold * 0.7);
        if (c.curse === 'ambush') this.ambush();
        return;
    }
  }

  private takeGear(g: Gear) {
    const r = equipIfBetter(this.hunter, g);
    const slot = GEAR_SLOT_NAMES[g.slot];
    if (r.equipped) {
      this.say(`${slot} 장착: ${g.name} (${describeGear(g)})` + (r.discarded ? `. ${r.discarded.name}은(는) 버렸다.` : ''));
    } else {
      this.say(`지금 ${slot}이(가) 더 좋다. ${g.name}은(는) 버렸다.`);
    }
  }

  /** Two awake monsters of this floor appear next to the hunter. */
  private ambush() {
    const pool = monsterPool(this.floor);
    const spots = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
      .map(([dx, dy]) => ({ x: this.pos.x + dx, y: this.pos.y + dy }))
      .filter((p) => isWalkable(this.map, p.x, p.y) && !this.blocked(p.x, p.y) && this.map.tiles[p.y][p.x] !== Tile.Stairs);
    for (const p of spots.slice(0, 2)) {
      this.spawn(this.rng.pick(pool), p.x, p.y, this.floor);
      this.monsters[this.monsters.length - 1].awake = true;
    }
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
    // While a choice is pending the world waits; enemies act once it is made.
    this.turn += 1;
    if (this.guardTurns > 0) this.guardTurns -= 1;
    if (this.turn % MP_REGEN_EVERY === 0) this.hunter.mp = Math.min(this.hunter.maxMp, this.hunter.mp + 1);
    this.updateSight();
    return true;
  }

  private playerAct(action: Action): boolean {
    const h = this.hunter;
    switch (action.type) {
      case 'wait':
        return true;
      case 'use':
        return this.useItem(action.item);
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
        for (const m of targets) this.hitMonster(m, this.damage(h.atk, m.def, h.skillPower));
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
        const chest = this.chestAt(nx, ny);
        if (chest >= 0) this.openChest(chest);
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

  private useItem(kind: ConsumableKind): boolean {
    const h = this.hunter;
    const name = CONSUMABLES[kind].name;
    if (h.bag[kind] <= 0) {
      this.say(`${name}이 없다.`);
      return false;
    }
    if (kind === 'hp') {
      if (h.hp >= h.maxHp) {
        this.say('체력이 가득 차 있다.');
        return false;
      }
      const heal = Math.ceil(h.maxHp * HP_POTION_HEAL);
      h.hp = Math.min(h.maxHp, h.hp + heal);
      this.say(`${name}을 마셨다. 체력 +${heal}`);
    } else if (kind === 'mp') {
      if (h.mp >= h.maxMp) {
        this.say('마나가 가득 차 있다.');
        return false;
      }
      const gain = Math.ceil(h.maxMp * MP_POTION_RESTORE);
      h.mp = Math.min(h.maxMp, h.mp + gain);
      this.say(`${name}을 마셨다. 마나 +${gain}`);
    } else {
      // +1 because the turn spent drinking it also counts down.
      this.guardTurns = GUARD_TURNS + 1;
      this.say(`${name}을 마셨다. ${GUARD_TURNS}턴 동안 무적!`);
    }
    h.bag[kind] -= 1;
    return true;
  }

  private hitMonster(m: Monster, dmg: number) {
    m.hp -= dmg;
    m.awake = true;
    if (m.hp > 0) {
      this.say(`${m.kind.name}에게 ${dmg} 피해.`);
      return;
    }
    this.monsters = this.monsters.filter((o) => o !== m);
    const scale = m.hunter ? 1 : floorScale(this.floor);
    const gold = Math.round(m.kind.gold * scale);
    this.runGold += gold;
    this.hunter.kills += 1;
    this.hunter.killScore += m.kind.score;
    this.say(`${m.kind.name} 처치! +${gold}G`);
    const levels = gainExp(this.hunter, Math.round(m.kind.exp * scale));
    if (levels > 0) this.say(`레벨 업! Lv.${this.hunter.level}`);
    if (m.hunter) this.offerChoice(m.hunter);
  }

  private offerChoice(h: Hunter) {
    const all: RewardKind[] = ['item', 'gold', 'skill', 'rescue'];
    const first = this.rng.pick(all);
    const second = this.rng.pick(all.filter((r) => r !== first));
    this.pendingChoice = { hunter: h, rewards: [first, second], finishExp: h.level * 25 };
    this.status = 'choosing';
  }

  /** Pick a reward (0 or 1), or 2 to finish the rival hunter for good and take experience. */
  resolveChoice(index: number): string {
    const c = this.pendingChoice;
    if (!c || this.status !== 'choosing') return '';
    const h = this.hunter;
    let msg: string;
    if (index >= 2) {
      gainExp(h, c.finishExp);
      this.encounters.push({ hunterId: c.hunter.id, finished: true });
      msg = `${c.hunter.name}을(를) 완전히 쓰러뜨렸다. 경험치 +${c.finishExp}`;
    } else {
      const kind = c.rewards[index];
      if (kind === 'item') this.takeGear(rollGear(this.rng, this.floor + 3));
      if (kind === 'gold') h.gold += c.hunter.level * 15;
      if (kind === 'skill') h.skillPower = Math.round((h.skillPower + 0.25) * 100) / 100;
      if (kind === 'rescue') h.rescues += 1;
      this.encounters.push({ hunterId: c.hunter.id, finished: false });
      msg = `${REWARDS[kind].label}: ${REWARDS[kind].describe(c.hunter.level)}. ${c.hunter.name}은(는) 물러났다... 더 강해져서 돌아올 것이다.`;
    }
    this.say(msg);
    this.pendingChoice = undefined;
    this.status = this.map.tiles[this.pos.y][this.pos.x] === Tile.Stairs && !this.bossAlive ? 'onStairs' : 'playing';
    return msg;
  }

  private monstersAct() {
    for (const m of this.monsters) {
      if (this.status === 'dead') return;
      const dx = this.pos.x - m.x;
      const dy = this.pos.y - m.y;
      if (!m.awake && dx * dx + dy * dy <= SIGHT * SIGHT) m.awake = true;
      if (!m.awake) continue;
      if (Math.abs(dx) + Math.abs(dy) === 1) {
        if (this.guardTurns > 0) {
          this.say(`${m.kind.name}의 공격! 무적이라 피해가 없다.`);
          continue;
        }
        const dmg = this.damage(m.atk, this.hunter.def);
        this.hunter.hp -= dmg;
        this.say(`${m.kind.name}의 공격! ${dmg} 피해.`);
        if (this.hunter.hp <= 0 && this.hunter.rescues > 0) {
          this.hunter.rescues -= 1;
          this.hunter.hp = Math.ceil(this.hunter.maxHp * 0.3);
          this.say('에이전시의 긴급 지원! 위기를 넘겼다.');
          continue;
        }
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
