import { FloorMap, generateFloor, isWalkable, MAP_H, MAP_W, mapHeight, mapWidth, Point, Tile, center } from './dungeon';
import { combatPower, gainExp, Hunter } from './hunter';
import type { EncounterOutcome } from './agency';
import { DARK_SIGHT, Gate, gateBoss, gateClearGold, gateClearStones, gateDanger, gateFloors, gateName, gatePool } from './gates';
import {
  abyssDepth, bossFor, eliteOf, floorExpScale, floorScale, MonsterKind, monsterPool, overLevelFactor, RESPAWN_EVERY, STALKER_FIRST, STALKER_NEXT,
  stalkerKind, TOP_FLOOR, TRAIT_RULES, Element, elementFactor,
} from './monsters';
import {
  addToBag,
  ChestContent,
  CONSUMABLES,
  ConsumableKind,
  CURSES,
  CurseKind,
  describeGear,
  equipIfBetter,
  Gear,
  GEAR_SLOT_NAMES,
  GUARD_TURNS,
  HP_POTION_HEAL,
  MP_POTION_RESTORE,
  Offer,
  offerLabel,
  rollOffers,
  rollChest,
  rollGear, gearLabel
} from './items';
import { Rng } from './rng';
import {
  ARCHER_DODGE, ARCHER_FAR_DAMAGE, ARCHER_RANGE, archerHitChance, KNIGHT_LOW_DEF, KNIGHT_LOW_HP, MAGE_SKILL_POWER, MAX_SKILL_LV,
  ClassId, OwnedSkill, SkillId, SKILL_LV_POWER, skillCost, SKILLS, SWORD_KILL_HEAL,
} from './classes';

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
  /** Turns left stunned or frozen: no moving, no attacking. */
  stun?: number;
  /** Turns left held in place: can still attack. */
  root?: number;
  /** Burn or poison: damage at the start of each of its turns. */
  dot?: { turns: number; dmg: number };
}

/** Effects the hunter's own skills put on the hunter. */
export interface Buffs {
  stance?: { turns: number; mult: number; half: boolean };
  rage?: { turns: number; mult: number };
  shield?: { turns: number; ratio: number };
  block?: { charges: number; mult: number };
  defUp?: { turns: number; amount: number; breakOnMove?: boolean };
  sanctuary?: { turns: number };
}

export interface Trap {
  x: number;
  y: number;
  mult: number;
}

export type Action =
  | { type: 'move'; dx: number; dy: number }
  | { type: 'wait' }
  | { type: 'skill'; slot?: number }
  | { type: 'use'; item: ConsumableKind };

/** An old colleague now at the rival agency appears only if no stronger than this times our hunter. */
export const FORMER_POWER_CAP = 1.2;

/** Aimed attacks that look for a target in line, and how far. Blink only moves, so it keeps the facing. */
export const AIM_REACH: Partial<Record<SkillId, number>> = { charge: 3, icebolt: 5, pierce: 6 };

export type RunStatus = 'playing' | 'onStairs' | 'choosing' | 'trading' | 'dead' | 'returned';

export type RewardKind = 'item' | 'gold' | 'skill' | 'rescue';

export const REWARDS: Record<RewardKind, { label: string; describe: (level: number) => string }> = {
  item: { label: '아이템', describe: () => '높은 층 수준의 장비 1개' },
  gold: { label: '골드', describe: (lv) => `${lv * 15}G (헌터 소지금)` },
  skill: { label: '스킬 강화', describe: () => '가진 스킬 하나를 바로 한 단계 강화' },
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
  /** Chance per floor (from floor 3, not boss floors) of a mid-boss. */
  eliteChance?: number;
  /** Chance per floor (from floor 2) of a wandering merchant. */
  merchantChance?: number;
  /** Size of each floor. Upright phones use tall floors. */
  mapSize?: { w: number; h: number };
  /** Floor to start on. Lower floors can be skipped once the hunter's grade allows it. */
  startFloor?: number;
  /** Go into this gate instead of the tower. */
  gate?: Gate;
  /** Fight an association ranker in the arena instead. */
  duel?: Duel;
}

/** A challenge against an association ranker: one fight in a closed arena. Losing is not death. */
export interface Duel {
  rankerId: number;
  rank: number;
  name: string;
  agency: string;
  cls?: ClassId;
  level: number;
  hp: number;
  atk: number;
  def: number;
  /** Set when the fight is over. */
  won?: boolean;
}

/** The ranker's health is this many times their stat sheet: they don't fall in a few hits. */
export const DUEL_HP = 2.5;

export interface Merchant {
  x: number;
  y: number;
  offers: Offer[];
  /** Index of each offer already bought. */
  sold: boolean[];
}

export const SIGHT = 7;

/** Things that happened during a turn, for the screen to show and play sounds for. */
/** Chance an ordinary monster drops a 마력석. */
export const STONE_DROP = 0.1;

export type RunEvent =
  | { type: 'hit'; x: number; y: number; amount: number }
  | { type: 'element'; x: number; y: number; weak: boolean }
  | { type: 'hurt'; amount: number }
  | { type: 'shot'; x: number; y: number; fromHunter?: boolean }
  | { type: 'miss'; x: number; y: number }
  | { type: 'dodge' }
  | { type: 'skill'; name: string }
  | { type: 'block' }
  | { type: 'kill'; x: number; y: number; big: boolean }
  | { type: 'heal'; amount: number }
  | { type: 'mana'; amount: number }
  | { type: 'chest'; cursed: boolean }
  /** Gear picked up: worn if better (old is what it replaced), otherwise left behind. */
  | { type: 'gear'; gear: Gear; equipped: boolean; old?: Gear }
  /** A potion or scroll found; got is false when the bag had no room. */
  | { type: 'loot'; item: ConsumableKind; got: boolean; count: number }
  | { type: 'gold'; amount: number }
  /** 마력석 picked up. */
  | { type: 'stone'; x: number; y: number; amount: number }
  /** A cursed chest, with what it took in numbers. */
  | { type: 'curse'; curse: CurseKind; detail: string }
  | { type: 'buy' }
  | { type: 'levelup' }
  | { type: 'rescue' }
  | { type: 'death' }
  | { type: 'floor' }
  /** The gate's master just fell: the gate is cleared. */
  | { type: 'gateClear' }
  /** A monster healed itself or was healed. */
  | { type: 'monsterHeal'; x: number; y: number; amount: number }
  /** The hunter's hit did nothing (the abyss stalker). */
  | { type: 'immune'; x: number; y: number }
  /** An abyss stalker has come for the hunter. */
  | { type: 'stalker'; nth: number }
  /** A ranker challenge is over. */
  | { type: 'duelEnd'; won: boolean };

/** A run in progress, as plain data for the save file. Rival hunters are kept by id. */
export interface RunSnapshot {
  floor: number;
  map: FloorMap;
  monsters: Array<Omit<Monster, 'hunter'> & { hunterId?: number }>;
  pos: Point;
  runGold: number;
  stones?: number;
  turn: number;
  status: RunStatus;
  /** One string of 0/1 per row. */
  seen: string[];
  log: string[];
  killer?: string;
  pendingChoice?: Omit<PendingChoice, 'hunter'> & { hunterId: number };
  chests: Point[];
  guardTurns: number;
  merchant?: Merchant;
  encounters: EncounterOutcome[];
  nextId: number;
  met: number[];
  floorTurn?: number;
  stalkers?: number;
  regenAcc?: { hp: number; mp: number };
  facing?: Point;
  buffs?: Buffs;
  traps?: Trap[];
  gate?: Gate;
  duel?: Duel;
}

/** One trip into the Tower of Growth. Pure game rules, no drawing. */
export class TowerRun {
  floor = 0;
  map!: FloorMap;
  monsters: Monster[] = [];
  pos: Point = { x: 0, y: 0 };
  /** Gold earned this run. Lost if the hunter dies. */
  runGold = 0;
  /** 마력석 found this run. They go to the agency on return and are lost on death. */
  stones = 0;
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
  /** A wandering merchant on this floor, gone once the hunter has traded. */
  merchant?: Merchant;
  /** Rival hunters beaten this run and whether they were finished for good. */
  encounters: EncounterOutcome[] = [];
  /** Drained by the screen after each action. Not saved. */
  events: RunEvent[] = [];
  private nextId = 1;
  private met = new Set<number>();
  /** Way the hunter last moved: aimed skills and the archer's shot go this way. */
  facing: Point = { x: 1, y: 0 };
  buffs: Buffs = {};
  traps: Trap[] = [];
  /** Turns spent on this floor: new monsters wander in, and in the end the stalker comes. */
  floorTurn = 0;
  /** Abyss stalkers already on this floor. */
  stalkers = 0;
  /** Fractions of health and mana regeneration carried to the next turn. */
  private regenAcc = { hp: 0, mp: 0 };
  /** Mana handed back by the skill just used (a finishing smash at upgrade 5). */
  private refund = 0;
  /** Set when this run is a gate dungeon rather than the tower. Floors then count from the gate's entrance. */
  gate?: Gate;
  /** Set when this run is a ranker challenge in the arena. */
  duel?: Duel;

  constructor(
    public hunter: Hunter,
    private rng: Rng,
    private options: RunOptions = {},
    start = true,
  ) {
    this.gate = options.gate;
    this.duel = options.duel;
    if (start && this.duel) this.enterArena();
    else if (start) this.enterFloor(this.gate ? 1 : Math.max(1, options.startFloor ?? 1));
  }

  drainEvents(): RunEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  snapshot(): RunSnapshot {
    return {
      floor: this.floor,
      map: this.map,
      monsters: this.monsters.map(({ hunter, ...m }) => ({ ...m, hunterId: hunter?.id })),
      pos: { ...this.pos },
      runGold: this.runGold,
      stones: this.stones,
      turn: this.turn,
      status: this.status,
      seen: this.seen.map((row) => row.map((v) => (v ? '1' : '0')).join('')),
      log: this.log.slice(-12),
      killer: this.killer,
      pendingChoice: this.pendingChoice && {
        rewards: this.pendingChoice.rewards,
        finishExp: this.pendingChoice.finishExp,
        hunterId: this.pendingChoice.hunter.id,
      },
      chests: this.chests.map((c) => ({ ...c })),
      guardTurns: this.guardTurns,
      merchant: this.merchant,
      encounters: this.encounters,
      nextId: this.nextId,
      met: [...this.met],
      facing: this.facing,
      buffs: this.buffs,
      traps: this.traps,
      floorTurn: this.floorTurn,
      stalkers: this.stalkers,
      regenAcc: this.regenAcc,
      gate: this.gate,
      duel: this.duel,
    };
  }

  /** Picks a saved run back up. Returns undefined if the save no longer fits the game state. */
  static restore(s: RunSnapshot, hunter: Hunter, rng: Rng, options: RunOptions = {}): TowerRun | undefined {
    const rivals = options.rivals ?? [];
    const rival = (id: number) => rivals.find((h) => h.id === id);
    const run = new TowerRun(hunter, rng, options, false);
    run.floor = s.floor;
    run.map = s.map;
    run.monsters = s.monsters.map(({ hunterId, ...m }) => ({ ...m, hunter: hunterId === undefined ? undefined : rival(hunterId) }));
    run.pos = s.pos;
    run.runGold = s.runGold;
    run.stones = s.stones ?? 0;
    run.turn = s.turn;
    run.status = s.status;
    run.seen = s.seen.map((row) => [...row].map((c) => c === '1'));
    run.log = s.log;
    run.killer = s.killer;
    if (s.pendingChoice) {
      const h = rival(s.pendingChoice.hunterId);
      if (!h) return undefined;
      run.pendingChoice = { hunter: h, rewards: s.pendingChoice.rewards, finishExp: s.pendingChoice.finishExp };
    }
    run.chests = s.chests;
    run.guardTurns = s.guardTurns;
    run.merchant = s.merchant;
    run.encounters = s.encounters;
    run.nextId = s.nextId;
    run.met = new Set(s.met);
    run.facing = s.facing ?? { x: 1, y: 0 };
    run.buffs = s.buffs ?? {};
    run.traps = s.traps ?? [];
    run.floorTurn = s.floorTurn ?? 0;
    run.stalkers = s.stalkers ?? 0;
    run.regenAcc = s.regenAcc ?? { hp: 0, mp: 0 };
    run.gate = s.gate;
    run.duel = s.duel;
    return run;
  }

  get bossAlive(): boolean {
    return this.monsters.some((m) => m.kind.boss);
  }

  /** Last floor of a gate. The tower has none: above floor 20 the abyss goes on. */
  get isTopFloor(): boolean {
    return this.duel ? true : this.gate ? this.floor >= gateFloors(this.gate) : false;
  }

  /** In the abyss above the tower's last floor. */
  get inAbyss(): boolean {
    return !this.gate && !this.duel && this.floor > TOP_FLOOR;
  }

  /** The tower floor this floor is as dangerous as. In the tower that is the floor itself. */
  get danger(): number {
    return this.gate ? gateDanger(this.gate, this.floor) : this.floor;
  }

  /** How far the hunter sees. Dark gates cut it short. */
  get sight(): number {
    // The arena is lit: both fighters see each other from the start.
    if (this.duel) return 20;
    return this.gate?.rule === 'dark' ? DARK_SIGHT : SIGHT;
  }

  /** Where the hunter is, for the screen: "7층" or "C급 독안개 늪 2/4층". */
  get placeName(): string {
    if (this.duel) return '결투장';
    if (this.inAbyss) return `심연 ${abyssDepth(this.floor)}층`;
    return this.gate ? `${gateName(this.gate)} ${this.floor}/${gateFloors(this.gate)}층` : `${this.floor}층`;
  }

  /** Short form for the top bar: "7층" or "게이트 2/4층". */
  get placeShort(): string {
    if (this.duel) return '결투장';
    if (this.inAbyss) return `심연 ${abyssDepth(this.floor)}층`;
    return this.gate ? `게이트 ${this.floor}/${gateFloors(this.gate)}층` : `${this.floor}층`;
  }

  private get pool(): MonsterKind[] {
    return this.gate ? gatePool(this.gate, this.danger) : monsterPool(this.floor);
  }

  private say(msg: string) {
    this.log.push(msg);
    if (this.log.length > 50) this.log.shift();
  }

  enterFloor(n: number) {
    this.floor = n;
    this.map = generateFloor(this.rng, this.options.mapSize?.w ?? MAP_W, this.options.mapSize?.h ?? MAP_H);
    this.pos = { ...this.map.start };
    this.monsters = [];
    this.seen = Array.from({ length: mapHeight(this.map) }, () => Array<boolean>(mapWidth(this.map)).fill(false));
    this.status = 'playing';
    this.traps = [];
    this.floorTurn = 0;
    this.stalkers = 0;
    if (!this.gate) {
      this.hunter.bestFloor = Math.max(this.hunter.bestFloor, Math.min(TOP_FLOOR, n));
      if (n > TOP_FLOOR) this.hunter.abyssBest = Math.max(this.hunter.abyssBest ?? 0, abyssDepth(n));
    }

    const danger = this.danger;
    const pool = this.pool;
    const count = Math.round((4 + danger) * (this.gate?.rule === 'swarm' ? 1.5 : 1));
    const rooms = this.map.rooms.slice(1);
    for (let i = 0; i < count; i++) {
      const room = this.rng.pick(rooms);
      const x = this.rng.int(room.x, room.x + room.w - 1);
      const y = this.rng.int(room.y, room.y + room.h - 1);
      if (this.blocked(x, y) || this.map.tiles[y][x] === Tile.Stairs) continue;
      const kind = this.rng.pick(pool);
      this.spawn(kind, x, y, danger);
      if (kind.trait === 'pack') this.spawnPack(kind, x, y, danger);
    }

    this.maybeSpawnRival(danger);
    this.placeChests(danger);
    this.maybeSpawnElite(danger);
    this.maybePlaceMerchant(danger);

    let boss = this.gate ? (this.isTopFloor ? gateBoss(this.gate, danger) : undefined) : bossFor(n);
    if (boss && n > TOP_FLOOR) boss = { ...boss, name: `심연의 군주 (${abyssDepth(n)}층)` };
    if (boss) {
      const c = center(this.map.rooms[this.map.rooms.length - 1]);
      const spot = [
        { x: c.x - 1, y: c.y },
        { x: c.x + 1, y: c.y },
        { x: c.x, y: c.y - 1 },
        { x: c.x, y: c.y + 1 },
      ].find((p) => isWalkable(this.map, p.x, p.y) && !this.blocked(p.x, p.y));
      if (spot) {
        this.spawn(boss, spot.x, spot.y, danger);
        this.say(`${this.gate ? '마지막 층' : this.placeName}에 ${boss.name}의 기척이 느껴진다.`);
      }
    }
    if (this.gate) {
      this.say(`${this.placeName}에 들어섰다.`);
      if (n === 1 && this.gate.rule === 'sealed') this.say('봉인의 기운이 가득하다. 체력 물약이 듣지 않는다.');
      if (n === 1 && this.gate.rule === 'dark') this.say('짙은 어둠 때문에 앞이 잘 보이지 않는다.');
      if (n === 1 && this.gate.rival) this.say(`${this.gate.rival.agency} 팀이 먼저 와 있다. 먼저 끝내면 보상 +30%!`);
    } else if (n > TOP_FLOOR) {
      this.say(`${this.placeName}에 들어섰다.${n === TOP_FLOOR + 1 ? ' 탑 위로 끝없는 심연이 펼쳐져 있다.' : ''}`);
    } else this.say(`성장의 탑 ${n}층에 들어섰다.`);
    this.events.push({ type: 'floor' });
    this.updateSight();
  }

  /** A closed arena with the ranker across from the hunter. No stairs: it ends when one falls. */
  enterArena() {
    const d = this.duel!;
    this.floor = 1;
    const W = this.options.mapSize?.w ?? MAP_W;
    const H = this.options.mapSize?.h ?? MAP_H;
    const rw = Math.min(15, W - 4);
    const rh = Math.min(11, H - 4);
    const room = { x: Math.floor((W - rw) / 2), y: Math.floor((H - rh) / 2), w: rw, h: rh };
    const tiles: Tile[][] = Array.from({ length: H }, (_, y) =>
      Array.from({ length: W }, (_, x) => (x >= room.x && x < room.x + rw && y >= room.y && y < room.y + rh ? Tile.Floor : Tile.Wall)));
    const c = center(room);
    const tall = rh > rw;
    const start = tall ? { x: c.x, y: room.y + rh - 2 } : { x: room.x + 1, y: c.y };
    const foe = tall ? { x: c.x, y: room.y + 1 } : { x: room.x + rw - 2, y: c.y };
    this.map = { tiles, rooms: [room], start, stairs: { x: 0, y: 0 } };
    this.pos = { ...start };
    this.monsters = [];
    this.chests = [];
    this.merchant = undefined;
    this.traps = [];
    this.floorTurn = 0;
    this.stalkers = 0;
    this.seen = Array.from({ length: H }, () => Array<boolean>(W).fill(false));
    this.status = 'playing';
    const hp = Math.round(d.hp * DUEL_HP);
    const kind: MonsterKind = {
      id: `ranker-${d.rankerId}`,
      name: `${d.rank}위 ${d.name}`,
      glyph: 'R',
      hp, atk: d.atk, def: d.def,
      exp: d.level * 30,
      gold: d.level * 20,
      score: 200 + d.level * 20,
      range: d.cls === 'mage' || d.cls === 'archer' ? 4 : undefined,
      ranker: true,
    };
    this.monsters.push({ id: this.nextId++, kind, x: foe.x, y: foe.y, hp, maxHp: hp, atk: d.atk, def: d.def, awake: true });
    this.say(`결투장에 들어섰다. ${d.agency}의 ${d.rank}위 ${d.name}(Lv.${d.level})이(가) 기다리고 있다.`);
    this.say('쓰러뜨리면 순위를 빼앗는다. 져도 목숨은 잃지 않는다.');
    this.events.push({ type: 'floor' });
    this.updateSight();
  }

  private maybeSpawnRival(floor: number) {
    // A rival only hunts the hunter they shadow; others' rivals stay away.
    // Old colleagues at the rival agency only show up for a hunter who could stand up to them.
    const cap = combatPower(this.hunter) * FORMER_POWER_CAP;
    const pool = (this.options.rivals ?? []).filter((h) => !this.met.has(h.id) &&
      (h.origin === 'rival' ? h.rivalOf === this.hunter.id : combatPower(h) <= cap));
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
      range: h.cls === 'mage' || h.cls === 'archer' ? 4 : undefined,
    };
    this.monsters.push({ id: this.nextId++, kind, hunter: h, x, y, hp: h.maxHp, maxHp: h.maxHp, atk: h.atk, def: h.def, awake: false });
    const tag = h.origin === 'rival' ? `${this.hunter.name}의 라이벌` : '옛 동료';
    const again = h.spared ? ` 풀어준 뒤로 훨씬 강해졌다 (${h.spared}번째 재회).` : '';
    this.say(`[${tag}] ${h.name}의 기척이 느껴진다...${again}`);
  }

  private randomFreeSpot(): Point | undefined {
    const rooms = this.map.rooms.slice(1);
    for (let tries = 0; tries < 30; tries++) {
      const room = this.rng.pick(rooms);
      const x = this.rng.int(room.x, room.x + room.w - 1);
      const y = this.rng.int(room.y, room.y + room.h - 1);
      if (this.blocked(x, y) || this.map.tiles[y][x] !== Tile.Floor || this.chestAt(x, y) >= 0 || this.merchantAt(x, y)) continue;
      return { x, y };
    }
    return undefined;
  }

  private maybeSpawnElite(floor: number) {
    if (this.gate) {
      if (this.isTopFloor) return;
      if (this.gate.rule !== 'elite' && (floor < 3 || !this.rng.chance(this.options.eliteChance ?? 0.35))) return;
    } else if (floor < 3 || bossFor(floor) || !this.rng.chance(this.options.eliteChance ?? 0.35)) return;
    const spot = this.randomFreeSpot();
    if (!spot) return;
    const kind = eliteOf(this.rng.pick(this.pool));
    this.spawn(kind, spot.x, spot.y, floor);
    this.say(`강한 기척이 느껴진다... ${kind.name}!`);
  }

  private maybePlaceMerchant(floor: number) {
    this.merchant = undefined;
    if (this.gate || floor < 2 || !this.rng.chance(this.options.merchantChance ?? 0.35)) return;
    const spot = this.randomFreeSpot();
    if (!spot) return;
    const offers = rollOffers(this.rng, floor);
    this.merchant = { ...spot, offers, sold: offers.map(() => false) };
    this.say('어딘가에서 떠돌이 상인의 방울 소리가 들린다.');
  }

  merchantAt(x: number, y: number): boolean {
    return !!this.merchant && this.merchant.x === x && this.merchant.y === y;
  }

  /** Buy one offer with this run's earnings. Returns a message, or '' if it could not. */
  buyOffer(index: number): string {
    const m = this.merchant;
    const o = m?.offers[index];
    if (!m || !o || this.status !== 'trading' || m.sold[index]) return '';
    if (this.runGold < o.price) {
      this.say('이번 수입이 모자라다.');
      return '';
    }
    const h = this.hunter;
    if (o.type === 'item' && h.bag[o.item] >= 5) {
      this.say('가방에 더 넣을 자리가 없다.');
      return '';
    }
    this.runGold -= o.price;
    m.sold[index] = true;
    this.events.push({ type: 'buy' });
    const msg = `${offerLabel(o)} 구매. -${o.price}G`;
    this.say(msg);
    if (o.type === 'gear') this.takeGear(o.gear);
    if (o.type === 'item') addToBag(h, o.item);
    if (o.type === 'heal') {
      h.hp = h.maxHp;
      h.mp = h.maxMp;
    }
    return msg;
  }

  /** End the trade. The merchant packs up and leaves. */
  leaveMerchant() {
    if (this.status !== 'trading') return;
    this.merchant = undefined;
    this.status = 'playing';
    this.say('상인은 다음 손님을 찾아 떠났다.');
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
    const c = rollChest(this.rng, this.danger);
    this.events.push({ type: 'chest', cursed: c.type === 'curse' });
    this.applyChest(c);
  }

  /** Public so tests can force a result. */
  applyChest(c: ChestContent) {
    const h = this.hunter;
    switch (c.type) {
      case 'gold':
        this.runGold += c.amount;
        this.events.push({ type: 'gold', amount: c.amount });
        this.say(`보물상자: ${c.amount}G!`);
        return;
      case 'consumable': {
        const got = addToBag(h, c.kind);
        this.events.push({ type: 'loot', item: c.kind, got: got > 0, count: h.bag[c.kind] });
        this.say(got ? `보물상자: ${CONSUMABLES[c.kind].name}!` : `보물상자: ${CONSUMABLES[c.kind].name}... 가방이 가득 차서 두고 왔다.`);
        return;
      }
      case 'gear':
        this.say(`보물상자: ${gearLabel(c.gear)}!`);
        this.takeGear(c.gear);
        return;
      case 'curse':
        this.say(`저주받은 상자였다! ${CURSES[c.curse]}`);
        let detail = '';
        if (c.curse === 'drain') {
          const before = h.hp;
          h.hp = Math.max(1, h.hp - Math.ceil(h.maxHp * 0.25));
          detail = `체력 -${before - h.hp}  (${before} → ${h.hp})`;
        }
        if (c.curse === 'mana') {
          detail = `마나 -${h.mp}  (${h.mp} → 0)`;
          h.mp = 0;
        }
        if (c.curse === 'greed') {
          const before = this.runGold;
          this.runGold = Math.floor(this.runGold * 0.7);
          detail = `이번 수입 -${before - this.runGold}G  (${before}G → ${this.runGold}G)`;
        }
        if (c.curse === 'ambush') {
          const before = this.monsters.length;
          this.ambush();
          detail = `몬스터 ${this.monsters.length - before}마리가 바로 옆에 나타났다`;
        }
        this.events.push({ type: 'curse', curse: c.curse, detail });
        return;
    }
  }

  private takeGear(g: Gear) {
    const old = this.hunter.gear[g.slot];
    const r = equipIfBetter(this.hunter, g);
    this.events.push({ type: 'gear', gear: g, equipped: r.equipped, old });
    const slot = GEAR_SLOT_NAMES[g.slot];
    if (r.equipped) {
      this.say(`${slot} 장착: ${gearLabel(g)} (${describeGear(g)})` + (r.discarded ? `. ${gearLabel(r.discarded)}은(는) 버렸다.` : ''));
    } else {
      this.say(`지금 ${slot}이(가) 더 좋다. ${gearLabel(g)}은(는) 버렸다.`);
    }
  }

  /** Two awake monsters of this floor appear next to the hunter. */
  private ambush() {
    const pool = this.pool;
    const spots = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
      .map(([dx, dy]) => ({ x: this.pos.x + dx, y: this.pos.y + dy }))
      .filter((p) => isWalkable(this.map, p.x, p.y) && !this.blocked(p.x, p.y) && this.map.tiles[p.y][p.x] !== Tile.Stairs);
    for (const p of spots.slice(0, 2)) {
      this.spawn(this.rng.pick(pool), p.x, p.y, this.danger);
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
    return !!this.monsterAt(x, y) || (this.pos.x === x && this.pos.y === y) || this.merchantAt(x, y);
  }

  /** Whether the hunter can see this monster: in sight, and close enough if it hides in shadow. */
  canSee(m: Monster): boolean {
    if (!this.isVisible(m.x, m.y)) return false;
    if (m.kind.trait !== 'stealth') return true;
    return TowerRun.cheb(m, this.pos) <= TRAIT_RULES.stealthRange;
  }

  /** Turns until the next abyss stalker comes to this floor. */
  get stalkerIn(): number {
    return Math.max(0, STALKER_FIRST + this.stalkers * STALKER_NEXT - this.floorTurn);
  }

  /** One or two more of a pack kind on free tiles next to the first. */
  private spawnPack(kind: MonsterKind, x: number, y: number, danger: number) {
    const extra = this.rng.int(1, 2);
    let added = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      if (added >= extra) break;
      const nx = x + dx;
      const ny = y + dy;
      if (!isWalkable(this.map, nx, ny) || this.blocked(nx, ny) || this.map.tiles[ny][nx] === Tile.Stairs) continue;
      this.spawn(kind, nx, ny, danger);
      added += 1;
    }
  }

  /** A pack member woke: its kin nearby wake with it. */
  private wake(m: Monster) {
    if (m.awake) return;
    m.awake = true;
    if (m.kind.trait !== 'pack') return;
    for (const o of this.monsters) {
      if (!o.awake && o.kind.id === m.kind.id && TowerRun.cheb(o, m) <= TRAIT_RULES.packWake) o.awake = true;
    }
  }

  /** The floor clock: new monsters wander in now and then, and the stalker comes for those who linger. */
  private tickFloor() {
    this.floorTurn += 1;
    const cap = 6 + this.danger;
    if (this.floorTurn % RESPAWN_EVERY === 0 && this.monsters.filter((m) => !m.kind.stalker).length < cap) {
      const spot = this.hiddenSpot(0);
      if (spot) {
        const kind = this.rng.pick(this.pool);
        this.spawn(kind, spot.x, spot.y, this.danger);
        this.say('어디선가 새로운 기척이 느껴진다.');
      }
    }
    if (this.stalkerIn === 0) {
      const spot = this.hiddenSpot(12) ?? this.hiddenSpot(0);
      this.stalkers += 1;
      if (spot) {
        // Each one hits like a monster several floors further up.
        this.spawn(stalkerKind(this.stalkers), spot.x, spot.y, this.danger + 4 + 2 * this.stalkers);
        const st = this.monsters[this.monsters.length - 1];
        st.awake = true;
        this.say(`${this.stalkers}차 던전 붕괴! ${st.kind.name}가 나타났다. 쓰러뜨릴 수 없다. 서둘러 이 층을 떠나라!`);
        this.events.push({ type: 'stalker', nth: this.stalkers });
      }
    }
  }

  /** A free floor tile out of the hunter's sight, at least minDist tiles away. */
  private hiddenSpot(minDist: number): Point | undefined {
    for (let tries = 0; tries < 40; tries++) {
      const p = this.randomFreeSpot();
      if (!p) continue;
      if (this.isVisible(p.x, p.y) || TowerRun.cheb(p, this.pos) < minDist) continue;
      return p;
    }
    return undefined;
  }

  /** Steps along the shortest path to the hunter, around walls. */
  private chaseStep(m: Monster) {
    const W = mapWidth(this.map);
    const H = mapHeight(this.map);
    const dist = new Int32Array(W * H).fill(-1);
    const q: number[] = [this.pos.y * W + this.pos.x];
    dist[q[0]] = 0;
    for (let i = 0; i < q.length; i++) {
      const c = q[i];
      const cx = c % W;
      const cy = (c - cx) / W;
      if (cx === m.x && cy === m.y) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!isWalkable(this.map, nx, ny) || dist[ny * W + nx] >= 0) continue;
        dist[ny * W + nx] = dist[c] + 1;
        q.push(ny * W + nx);
      }
    }
    const here = dist[m.y * W + m.x];
    if (here < 0) return this.stepToward(m);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = m.x + dx;
      const ny = m.y + dy;
      if (!isWalkable(this.map, nx, ny) || this.blocked(nx, ny)) continue;
      const d = dist[ny * W + nx];
      if (d >= 0 && d < here) {
        m.x = nx;
        m.y = ny;
        return;
      }
    }
  }

  /** Backs away from the hunter if there is room. Returns true if it moved. */
  private stepAway(m: Monster): boolean {
    const d = (x: number, y: number) => Math.abs(this.pos.x - x) + Math.abs(this.pos.y - y);
    let best: Point | undefined;
    let bestD = d(m.x, m.y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = m.x + dx;
      const ny = m.y + dy;
      if (!isWalkable(this.map, nx, ny) || this.blocked(nx, ny)) continue;
      if (d(nx, ny) > bestD) {
        bestD = d(nx, ny);
        best = { x: nx, y: ny };
      }
    }
    if (!best) return false;
    m.x = best.x;
    m.y = best.y;
    return true;
  }

  /** A shaman's turn to mend a hurt ally nearby. Returns true if it healed instead of attacking. */
  private healAlly(m: Monster): boolean {
    if (this.turn % TRAIT_RULES.healEvery !== 0) return false;
    const hurt = this.monsters.find(
      (o) => o !== m && !o.kind.stalker && !o.hunter && o.hp < o.maxHp * 0.7 && Math.abs(o.x - m.x) + Math.abs(o.y - m.y) <= TRAIT_RULES.healRange,
    );
    if (!hurt) return false;
    const amount = Math.min(hurt.maxHp - hurt.hp, Math.ceil(hurt.maxHp * TRAIT_RULES.healAmount));
    hurt.hp += amount;
    this.events.push({ type: 'monsterHeal', x: hurt.x, y: hurt.y, amount });
    if (this.canSee(m)) this.say(`${m.kind.name}이(가) ${hurt.kind.name}을(를) 치유했다. (+${amount})`);
    return true;
  }

  isVisible(x: number, y: number): boolean {
    const dx = x - this.pos.x;
    const dy = y - this.pos.y;
    return dx * dx + dy * dy <= this.sight * this.sight;
  }

  private updateSight() {
    const r = this.sight;
    for (let y = Math.max(0, this.pos.y - r); y <= Math.min(mapHeight(this.map) - 1, this.pos.y + r); y++) {
      for (let x = Math.max(0, this.pos.x - r); x <= Math.min(mapWidth(this.map) - 1, this.pos.x + r); x++) {
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
    this.tickBuffs();
    this.regenerate();
    if (!this.duel && (this.status === 'playing' || this.status === 'onStairs')) this.tickFloor();
    this.updateSight();
    return true;
  }

  /** The hunter's own health and mana regeneration, a fraction per turn. */
  private regenerate() {
    const h = this.hunter;
    if (h.hp <= 0) return;
    const acc = this.regenAcc;
    acc.hp += h.hpRegen ?? 0;
    acc.mp += h.mpRegen ?? 0;
    const hp = Math.floor(acc.hp);
    const mp = Math.floor(acc.mp);
    acc.hp -= hp;
    acc.mp -= mp;
    h.hp = Math.min(h.maxHp, h.hp + hp);
    h.mp = Math.min(h.maxMp, h.mp + mp);
  }

  private tickBuffs() {
    const b = this.buffs;
    const h = this.hunter;
    if (b.sanctuary && h.hp > 0) {
      const heal = Math.min(h.maxHp - h.hp, Math.ceil(h.maxHp * 0.05));
      if (heal > 0) {
        h.hp += heal;
        this.events.push({ type: 'heal', amount: heal });
      }
    }
    for (const key of ['stance', 'rage', 'shield', 'defUp', 'sanctuary'] as const) {
      const buff = b[key];
      if (buff && --buff.turns <= 0) delete b[key];
    }
  }

  private playerAct(action: Action): boolean {
    const h = this.hunter;
    switch (action.type) {
      case 'wait':
        return true;
      case 'use':
        return this.useItem(action.item);
      case 'skill':
        return this.useSkill(action.slot ?? 0);
      case 'move': {
        const nx = this.pos.x + action.dx;
        const ny = this.pos.y + action.dy;
        this.facing = { x: action.dx, y: action.dy };
        if (this.merchantAt(nx, ny)) {
          // Talking to the merchant takes no time; the world waits.
          this.status = 'trading';
          this.say('떠돌이 상인: "골라 보시오. 거래가 끝나면 난 떠나네."');
          return false;
        }
        const target = this.monsterAt(nx, ny);
        if (target) {
          const dmg = this.damage(this.atkNow(), target.def);
          this.hitMonster(target, dmg);
          if (target.kind.trait === 'thorns' && !target.kind.stalker) this.thorns(target, dmg);
          return true;
        }
        if (h.cls === 'archer' && this.archerShot(action.dx, action.dy)) return true;
        if (!isWalkable(this.map, nx, ny)) return false;
        this.moveTo(nx, ny);
        return true;
      }
    }
  }

  /** Steps onto a tile: chests open, the stairs may open, a standing guard breaks. */
  private moveTo(nx: number, ny: number) {
    this.pos = { x: nx, y: ny };
    if (this.buffs.defUp?.breakOnMove) delete this.buffs.defUp;
    const chest = this.chestAt(nx, ny);
    if (chest >= 0) this.openChest(chest);
    if (this.map.tiles[ny][nx] === Tile.Stairs) {
      if (this.bossAlive) {
        this.say('수호자가 살아있는 한 계단은 열리지 않는다.');
      } else {
        this.status = 'onStairs';
      }
    }
  }

  /** Spikes: part of a melee hit comes back. Never kills on its own. */
  private thorns(m: Monster, dealt: number) {
    const h = this.hunter;
    const back = Math.min(h.hp - 1, Math.max(1, Math.ceil(dealt * TRAIT_RULES.thornsShare)));
    if (back <= 0 || this.guardTurns > 0) return;
    h.hp -= back;
    this.events.push({ type: 'hurt', amount: back });
    this.say(`${m.kind.name}의 가시에 찔렸다. ${back} 피해.`);
  }

  private atkNow(): number {
    return this.hunter.atk * (this.buffs.rage?.mult ?? 1);
  }

  /** Hits with the hunter's attack times mult. Returns true if it killed. */
  /** Element of the skill being cast right now, if any. */
  private element?: Element;

  private strike(m: Monster, mult: number, ignoreDef = false): boolean {
    if (!this.monsters.includes(m)) return false;
    const ef = elementFactor(m.kind, this.element);
    if (ef !== 1) this.events.push({ type: 'element', x: m.x, y: m.y, weak: ef > 1 });
    this.hitMonster(m, this.damage(this.atkNow(), ignoreDef ? 0 : m.def, mult * ef));
    return !this.monsters.includes(m);
  }

  private alive(m: Monster): boolean {
    return this.monsters.includes(m);
  }

  private free(x: number, y: number): boolean {
    return isWalkable(this.map, x, y) && !this.blocked(x, y);
  }

  private static cheb(a: Point, b: Point): number {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  }

  /** Monsters in sight within `range` tiles, nearest first. */
  private near(range: number, from: Point = this.pos): Monster[] {
    return this.monsters
      .filter((m) => this.canSee(m) && TowerRun.cheb(m, from) <= range)
      .sort((a, b) => TowerRun.cheb(a, from) - TowerRun.cheb(b, from));
  }

  /** Monsters along a straight line from the hunter, up to the first wall. */
  /**
   * Turns the hunter toward the nearest enemy standing in a straight line within reach,
   * unless one is already in line the way they face.
   */
  aim(reach: number) {
    const target = (dx: number, dy: number) => this.inLine(dx, dy, reach).find((m) => this.canSee(m) && !m.kind.stalker);
    if (target(this.facing.x, this.facing.y)) return;
    let best: { dir: Point; dist: number } | undefined;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const m = target(dx, dy);
      if (!m) continue;
      const dist = TowerRun.cheb(m, this.pos);
      if (!best || dist < best.dist) best = { dir: { x: dx, y: dy }, dist };
    }
    if (best) this.facing = best.dir;
  }

  private inLine(dx: number, dy: number, len: number): Monster[] {
    const out: Monster[] = [];
    for (let i = 1; i <= len; i++) {
      const x = this.pos.x + dx * i;
      const y = this.pos.y + dy * i;
      if (!isWalkable(this.map, x, y) || this.merchantAt(x, y)) break;
      const m = this.monsterAt(x, y);
      if (m) out.push(m);
    }
    return out;
  }

  /** The monster right in front, or else any one next to the hunter (sideways only if orthogonal). */
  private frontTarget(orthogonal = false): Monster | undefined {
    const front = this.monsterAt(this.pos.x + this.facing.x, this.pos.y + this.facing.y);
    if (front) return front;
    return this.monsters.find((m) =>
      orthogonal ? Math.abs(m.x - this.pos.x) + Math.abs(m.y - this.pos.y) === 1 : TowerRun.cheb(m, this.pos) === 1,
    );
  }

  /** The archer's basic attack at a monster 2 or 3 tiles away in a clear line. Returns true if a shot was taken. */
  private archerShot(dx: number, dy: number): boolean {
    for (let d = 1; d <= ARCHER_RANGE; d++) {
      const x = this.pos.x + dx * d;
      const y = this.pos.y + dy * d;
      if (!isWalkable(this.map, x, y) || this.merchantAt(x, y)) return false;
      const m = this.monsterAt(x, y);
      if (!m) continue;
      this.events.push({ type: 'shot', x, y, fromHunter: true });
      if (!this.rng.chance(archerHitChance(d))) {
        m.awake = true;
        this.events.push({ type: 'miss', x, y });
        this.say(`화살이 ${m.kind.name}을(를) 빗나갔다.`);
        return true;
      }
      this.strike(m, ARCHER_FAR_DAMAGE);
      return true;
    }
    return false;
  }

  private useSkill(slot: number): boolean {
    const h = this.hunter;
    const s = h.skills[slot];
    if (!s) {
      this.say('그 칸에는 아직 스킬이 없다.');
      return false;
    }
    const info = SKILLS[s.id];
    const cost = skillCost(s);
    if (h.mp < cost) {
      this.say(`마나가 부족하다. (${info.name} ${cost} 필요)`);
      return false;
    }
    this.refund = 0;
    h.mp -= cost;
    this.events.push({ type: 'skill', name: info.name });
    this.say(`${info.name}!`);
    this.element = info.element;
    const cast = this.castSkill(s);
    this.element = undefined;
    if (!cast) {
      h.mp += cost; // nothing to hit: no mana, no turn
      this.events.pop();
      this.log.splice(this.log.lastIndexOf(`${info.name}!`), 1);
      return false;
    }
    h.mp = Math.min(h.maxMp, h.mp + this.refund);
    return true;
  }

  /** Does the skill. Returns false (after saying why) when it had nothing to act on. */
  private castSkill(s: OwnedSkill): boolean {
    const h = this.hunter;
    const max = s.lv >= MAX_SKILL_LV;
    const p = (1 + SKILL_LV_POWER * (s.lv - 1)) * (h.skillPower / 1.5) * (h.cls === 'mage' ? MAGE_SKILL_POWER : 1);
    const name = SKILLS[s.id].name;
    // Straight-line attacks turn toward an enemy in line if none is in front.
    const reach = AIM_REACH[s.id];
    if (reach) this.aim(reach);
    const none = (why = '주변에 적이 없다.') => {
      this.say(`${name}: ${why}`);
      return false;
    };
    const f = this.facing;
    switch (s.id) {
      // ---- 검사 ----
      case 'spin': {
        const targets = this.near(max ? 2 : 1);
        if (!targets.length) return none();
        targets.forEach((m) => this.strike(m, 1.5 * p));
        return true;
      }
      case 'charge': {
        let landing: Point | undefined;
        let hit = false;
        for (let i = 1; i <= 3; i++) {
          const x = this.pos.x + f.x * i;
          const y = this.pos.y + f.y * i;
          if (!isWalkable(this.map, x, y) || this.merchantAt(x, y)) break;
          const m = this.monsterAt(x, y);
          if (m) {
            hit = true;
            if (!this.strike(m, 2 * p)) m.stun = Math.max(m.stun ?? 0, 1);
            if (!max) break;
            if (this.monsterAt(x, y)) continue;
          }
          if (!this.monsterAt(x, y)) landing = { x, y };
        }
        if (!hit) return none('돌진할 방향에 적이 없다.');
        if (landing) this.moveTo(landing.x, landing.y);
        return true;
      }
      case 'smash': {
        const t = this.frontTarget();
        if (!t) return none();
        if (this.strike(t, 2.5 * p, true) && max) this.refund = skillCost(s);
        return true;
      }
      case 'stance':
        this.buffs.stance = { turns: 3, mult: 1.2 * p, half: max };
        return true;
      case 'warcry':
        this.buffs.rage = { turns: 4, mult: 1 + 0.3 * p };
        if (max) for (const m of this.near(1)) m.stun = Math.max(m.stun ?? 0, 1);
        return true;
      case 'storm': {
        const targets = this.near(2);
        if (!targets.length) return none('2칸 안에 적이 없다.');
        targets.forEach((m) => this.strike(m, 2.5 * p));
        return true;
      }
      // ---- 마법사 ----
      case 'fireball': {
        const t = this.near(4)[0];
        if (!t) return none('4칸 안에 적이 없다.');
        const around = this.monsters.filter((m) => m !== t && TowerRun.cheb(m, t) === 1);
        this.events.push({ type: 'shot', x: t.x, y: t.y, fromHunter: true });
        this.strike(t, 2 * p);
        around.forEach((m) => this.strike(m, p));
        if (max && this.alive(t)) t.dot = { turns: 3, dmg: Math.ceil(h.atk * 0.3 * p) };
        return true;
      }
      case 'icebolt': {
        const line = this.inLine(f.x, f.y, 5);
        if (!line.length) return none('바라보는 방향에 적이 없다.');
        const last = max ? line[line.length - 1] : line[0];
        this.events.push({ type: 'shot', x: last.x, y: last.y, fromHunter: true });
        for (const m of max ? line : [line[0]]) {
          if (!this.strike(m, 1.3 * p)) m.stun = Math.max(m.stun ?? 0, max ? 3 : 2);
        }
        return true;
      }
      case 'chain': {
        let cur = this.near(5)[0];
        if (!cur) return none('5칸 안에 적이 없다.');
        const done = new Set<Monster>();
        for (let i = 0; i < (max ? 5 : 3) && cur; i++) {
          done.add(cur);
          const from: Point = { x: cur.x, y: cur.y };
          this.strike(cur, 1.2 * p);
          cur = this.monsters.filter((m) => !done.has(m) && TowerRun.cheb(m, from) <= 3)
            .sort((a, b) => TowerRun.cheb(a, from) - TowerRun.cheb(b, from))[0];
        }
        return true;
      }
      case 'manashield':
        this.buffs.shield = { turns: 5, ratio: max ? 2 : 1 };
        return true;
      case 'blink': {
        let landing: Point | undefined;
        for (let i = 1; i <= 4; i++) {
          const x = this.pos.x + f.x * i;
          const y = this.pos.y + f.y * i;
          if (!this.free(x, y)) break;
          landing = { x, y };
        }
        if (!landing) return none('그쪽으로는 갈 수 없다.');
        const origin = { ...this.pos };
        this.moveTo(landing.x, landing.y);
        if (max) this.monsters.filter((m) => TowerRun.cheb(m, origin) <= 1).forEach((m) => this.strike(m, 1.5 * p));
        return true;
      }
      case 'meteor': {
        const targets = this.near(99);
        if (!targets.length) return none('보이는 적이 없다.');
        targets.forEach((m) => this.strike(m, 1.8 * p));
        return true;
      }
      // ---- 궁수 ----
      case 'pierce': {
        const line = this.inLine(f.x, f.y, 6);
        if (!line.length) return none('바라보는 방향에 적이 없다.');
        const last = line[line.length - 1];
        this.events.push({ type: 'shot', x: last.x, y: last.y, fromHunter: true });
        line.forEach((m) => this.strike(m, 1.4 * p, max));
        return true;
      }
      case 'backshot': {
        const t = this.frontTarget(true);
        if (!t) return none('붙어 있는 적이 없다.');
        const dx = Math.sign(this.pos.x - t.x);
        const dy = Math.sign(this.pos.y - t.y);
        if (!this.strike(t, 1.2 * p) && max) t.stun = Math.max(t.stun ?? 0, 1);
        for (let i = 0; i < 2 && this.free(this.pos.x + dx, this.pos.y + dy); i++) this.moveTo(this.pos.x + dx, this.pos.y + dy);
        return true;
      }
      case 'poison': {
        const t = this.near(5)[0];
        if (!t) return none('5칸 안에 적이 없다.');
        const dot = () => ({ turns: 4, dmg: Math.ceil(h.atk * 0.3 * p) });
        const around = max ? this.monsters.filter((m) => m !== t && TowerRun.cheb(m, t) === 1) : [];
        this.events.push({ type: 'shot', x: t.x, y: t.y, fromHunter: true });
        if (!this.strike(t, p)) t.dot = dot();
        around.forEach((m) => (m.dot = dot()));
        return true;
      }
      case 'volley': {
        const t = this.near(5)[0];
        if (!t) return none('5칸 안에 적이 없다.');
        this.events.push({ type: 'shot', x: t.x, y: t.y, fromHunter: true });
        for (let i = 0; i < (max ? 4 : 3) && this.alive(t); i++) this.strike(t, 0.7 * p);
        return true;
      }
      case 'trap': {
        if (this.traps.some((t) => t.x === this.pos.x && t.y === this.pos.y)) return none('이미 덫이 있다.');
        this.traps.push({ x: this.pos.x, y: this.pos.y, mult: 2 * p });
        while (this.traps.length > (max ? 2 : 1)) this.traps.shift();
        return true;
      }
      case 'rain': {
        const c = this.near(99)[0];
        if (!c) return none('보이는 적이 없다.');
        const center: Point = { x: c.x, y: c.y };
        this.monsters.filter((m) => TowerRun.cheb(m, center) <= (max ? 2 : 1)).forEach((m) => this.strike(m, 2 * p));
        return true;
      }
      // ---- 기사 ----
      case 'block':
        this.buffs.block = { charges: max ? 3 : 2, mult: p };
        return true;
      case 'taunt': {
        const pulled = this.near(3);
        if (!pulled.length) return none('3칸 안에 적이 없다.');
        for (const m of pulled) {
          m.awake = true;
          for (let i = 0; i < 3 && TowerRun.cheb(m, this.pos) > 1; i++) this.stepToward(m);
          if (max) m.stun = Math.max(m.stun ?? 0, 1);
        }
        this.buffs.defUp = { turns: 3, amount: 3 };
        return true;
      }
      case 'bash': {
        const t = this.frontTarget(true);
        if (!t) return none('붙어 있는 적이 없다.');
        if (this.strike(t, 1.3 * p)) return true;
        const dx = Math.sign(t.x - this.pos.x);
        const dy = Math.sign(t.y - this.pos.y);
        let moved = 0;
        while (moved < 2 && this.free(t.x + dx, t.y + dy)) {
          t.x += dx;
          t.y += dy;
          moved++;
        }
        if (moved < 2 || max) t.stun = Math.max(t.stun ?? 0, 1);
        return true;
      }
      case 'heal': {
        if (h.hp >= h.maxHp) return none('체력이 가득 차 있다.');
        const heal = Math.min(h.maxHp - h.hp, Math.ceil(h.maxHp * (0.3 + 0.05 * (s.lv - 1))));
        h.hp += heal;
        this.events.push({ type: 'heal', amount: heal });
        if (max) this.buffs.defUp = { turns: 3, amount: 3 };
        return true;
      }
      case 'bulwark':
        this.buffs.defUp = { turns: 4, amount: 5, breakOnMove: !max };
        return true;
      case 'sanctuary':
        this.buffs.sanctuary = { turns: max ? 7 : 5 };
        return true;
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
      if (this.gate?.rule === 'sealed') {
        this.say('봉인 때문에 체력 물약이 듣지 않는다.');
        return false;
      }
      if (h.hp >= h.maxHp) {
        this.say('체력이 가득 차 있다.');
        return false;
      }
      const heal = Math.ceil(h.maxHp * HP_POTION_HEAL);
      h.hp = Math.min(h.maxHp, h.hp + heal);
      this.events.push({ type: 'heal', amount: heal });
      this.say(`${name}을 마셨다. 체력 +${heal}`);
    } else if (kind === 'mp') {
      if (h.mp >= h.maxMp) {
        this.say('마나가 가득 차 있다.');
        return false;
      }
      const gain = Math.ceil(h.maxMp * MP_POTION_RESTORE);
      h.mp = Math.min(h.maxMp, h.mp + gain);
      this.events.push({ type: 'mana', amount: gain });
      this.say(`${name}을 마셨다. 마나 +${gain}`);
    } else if (kind === 'escape') {
      this.status = 'returned';
      this.say(`${name}을 펼쳤다. 빛에 휩싸여 탑을 빠져나간다.`);
    } else {
      // +1 because the turn spent drinking it also counts down.
      this.guardTurns = GUARD_TURNS + 1;
      this.say(`${name}을 마셨다. ${GUARD_TURNS}턴 동안 무적!`);
    }
    h.bag[kind] -= 1;
    return true;
  }

  private hitMonster(m: Monster, dmg: number) {
    if (m.kind.stalker) {
      this.events.push({ type: 'immune', x: m.x, y: m.y });
      this.say(`${m.kind.name}에게는 어떤 공격도 통하지 않는다!`);
      return;
    }
    m.hp -= dmg;
    this.wake(m);
    this.events.push({ type: 'hit', x: m.x, y: m.y, amount: dmg });
    if (m.hp > 0) {
      this.say(`${m.kind.name}에게 ${dmg} 피해.`);
      return;
    }
    this.monsters = this.monsters.filter((o) => o !== m);
    this.events.push({ type: 'kill', x: m.x, y: m.y, big: !!(m.kind.boss || m.kind.elite || m.hunter || m.kind.ranker) });
    if (m.kind.ranker && this.duel) {
      this.duel.won = true;
      const gold = m.kind.gold;
      this.runGold += gold;
      this.hunter.kills += 1;
      this.hunter.killScore += m.kind.score;
      this.say(`${m.kind.name}을(를) 쓰러뜨렸다! 순위를 빼앗았다. +${gold}G`);
      const levels = gainExp(this.hunter, m.kind.exp);
      if (levels > 0) this.events.push({ type: 'levelup' });
      this.gainStones(5, m.x, m.y);
      this.events.push({ type: 'duelEnd', won: true });
      this.status = 'returned';
      return;
    }
    if (this.hunter.cls === 'sword' && this.hunter.hp > 0 && this.hunter.hp < this.hunter.maxHp) {
      const heal = Math.min(SWORD_KILL_HEAL, this.hunter.maxHp - this.hunter.hp);
      this.hunter.hp += heal;
      this.events.push({ type: 'heal', amount: heal });
    }
    const scale = m.hunter ? 1 : floorScale(this.danger);
    const gold = Math.round(m.kind.gold * scale);
    this.runGold += gold;
    this.hunter.kills += 1;
    this.hunter.killScore += m.kind.score;
    this.say(`${m.kind.name} 처치! +${gold}G`);
    if (m.kind.boss && this.gateCleared) {
      this.events.push({ type: 'gateClear' });
      this.say(`${gateName(this.gate!)} 클리어!`);
    }
    const expScale = m.hunter ? 1 : floorExpScale(this.danger) * overLevelFactor(this.hunter.level, this.danger);
    const levels = gainExp(this.hunter, Math.max(1, Math.round(m.kind.exp * expScale)));
    if (levels > 0) this.events.push({ type: 'levelup' });
    if (levels > 0) this.say(`레벨 업! Lv.${this.hunter.level} · 체력·마나 모두 회복`);
    const stones = m.hunter || m.kind.stalker ? 0
      : m.kind.boss ? 3 + Math.floor(this.danger / 5)
      : m.kind.elite ? 2
      : this.rng.chance(STONE_DROP) ? 1 : 0;
    this.gainStones(stones, m.x, m.y);
    if (m.kind.elite) {
      this.say('중간보스가 장비를 떨어뜨렸다!');
      this.takeGear(rollGear(this.rng, this.danger + 2));
    }
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
      if (kind === 'item') this.takeGear(rollGear(this.rng, this.danger + 3));
      if (kind === 'gold') h.gold += c.hunter.level * 15;
      if (kind === 'skill') {
        const open = h.skills.filter((sk) => sk.lv < MAX_SKILL_LV);
        if (open.length) this.rng.pick(open).lv += 1;
        else h.skillPower = Math.round((h.skillPower + 0.25) * 100) / 100;
      }
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
    for (const m of [...this.monsters]) {
      if (this.status === 'dead') return;
      if (!this.alive(m)) continue; // killed earlier this turn (a counter, a trap)
      if (m.dot) {
        const dmg = m.dot.dmg;
        if (--m.dot.turns <= 0) m.dot = undefined;
        this.hitMonster(m, dmg);
        if (!this.alive(m)) continue;
      }
      if (m.kind.trait === 'regen' && m.hp < m.maxHp) {
        const amount = Math.min(m.maxHp - m.hp, Math.max(1, Math.round(m.maxHp * TRAIT_RULES.regenPerTurn)));
        m.hp += amount;
        this.events.push({ type: 'monsterHeal', x: m.x, y: m.y, amount });
      }
      if (m.stun) {
        m.stun -= 1;
        continue;
      }
      const dx = this.pos.x - m.x;
      const dy = this.pos.y - m.y;
      if (!m.awake && dx * dx + dy * dy <= this.sight * this.sight) this.wake(m);
      if (!m.awake) continue;
      if (m.kind.trait === 'healer' && this.healAlly(m)) continue;
      const adjacent = Math.abs(dx) + Math.abs(dy) === 1;
      if (adjacent && m.kind.trait === 'kite' && !m.root && this.rng.chance(TRAIT_RULES.kiteChance) && this.stepAway(m)) continue;
      const shoots = !adjacent && this.canShoot(m);
      if (adjacent || shoots) {
        if (shoots) this.events.push({ type: 'shot', x: m.x, y: m.y });
        this.attackHunter(m, shoots, adjacent);
        continue;
      }
      if (m.root) {
        m.root -= 1;
        continue;
      }
      if (m.kind.stalker) this.chaseStep(m);
      else this.stepToward(m);
      this.checkTrap(m);
      // Swift monsters take a second step if they still can't reach.
      if (m.kind.trait === 'swift' && this.alive(m) && !m.root && Math.abs(this.pos.x - m.x) + Math.abs(this.pos.y - m.y) > 1) {
        this.stepToward(m);
        this.checkTrap(m);
      }
    }
  }

  /** A monster that steps on the archer's trap takes the hit and is held in place. */
  private checkTrap(m: Monster) {
    const i = this.traps.findIndex((t) => t.x === m.x && t.y === m.y);
    if (i < 0) return;
    const trap = this.traps.splice(i, 1)[0];
    this.say(`${m.kind.name}이(가) 덫에 걸렸다!`);
    if (!this.strike(m, trap.mult)) m.root = 2;
  }

  /** One enemy attack on the hunter, through every defense the hunter has up. */
  private attackHunter(m: Monster, ranged: boolean, adjacent: boolean) {
    const h = this.hunter;
    const b = this.buffs;
    let mult = 1;
    let label = ranged ? '원거리 공격' : '공격';
    // Enemy hunters use a skill now and then.
    if (m.hunter && m.hunter.skills?.length && this.turn % 3 === 0) {
      mult = 1.6;
      label = SKILLS[m.hunter.skills[0].id].name;
    }
    if (m.kind.trait === 'rage' && m.hp <= m.maxHp * TRAIT_RULES.rageAt) {
      mult *= TRAIT_RULES.rageMult;
      label = '광폭 공격';
    }
    if (this.guardTurns > 0) {
      this.say(`${m.kind.name}의 ${label}! 무적이라 피해가 없다.`);
      this.events.push({ type: 'block' });
      return;
    }
    if (h.cls === 'archer' && this.rng.chance(ARCHER_DODGE)) {
      this.say(`${m.kind.name}의 ${label}을(를) 피했다.`);
      this.events.push({ type: 'dodge' });
      return;
    }
    if (b.block && b.block.charges > 0) {
      b.block.charges -= 1;
      const mul = b.block.mult;
      if (b.block.charges <= 0) delete b.block;
      this.say(`방패로 ${m.kind.name}의 ${label}을(를) 막았다!`);
      this.events.push({ type: 'block' });
      this.strike(m, mul);
      return;
    }
    let def = h.def + (b.defUp?.amount ?? 0);
    if (h.cls === 'knight' && h.hp <= h.maxHp * KNIGHT_LOW_HP) def += KNIGHT_LOW_DEF;
    let dmg = this.damage(m.atk * mult, def);
    if (b.sanctuary || b.stance?.half) dmg = Math.ceil(dmg / 2);
    if (b.shield && h.mp > 0) {
      const absorbed = Math.min(dmg, h.mp * b.shield.ratio);
      h.mp -= Math.ceil(absorbed / b.shield.ratio);
      dmg -= absorbed;
      if (absorbed > 0) this.say(`마나 보호막이 ${absorbed} 피해를 막았다.`);
    }
    if (dmg <= 0) {
      this.events.push({ type: 'block' });
      return;
    }
    h.hp -= dmg;
    this.events.push({ type: 'hurt', amount: dmg });
    this.say(`${m.kind.name}의 ${label}! ${dmg} 피해.`);
    if (h.hp <= 0 && h.rescues > 0 && !this.duel) {
      h.rescues -= 1;
      h.hp = Math.ceil(h.maxHp * 0.3);
      this.say('에이전시의 긴급 지원! 위기를 넘겼다.');
      this.events.push({ type: 'rescue' });
      return;
    }
    if (h.hp <= 0 && this.duel) {
      h.hp = 1;
      this.duel.won = false;
      this.status = 'returned';
      this.say(`${m.kind.name}에게 졌다... 심판이 결투를 멈췄다.`);
      this.events.push({ type: 'duelEnd', won: false });
      return;
    }
    if (h.hp <= 0) {
      h.hp = 0;
      this.status = 'dead';
      this.killer = m.kind.name;
      this.runGold = 0;
      this.say(`${h.name}은(는) ${m.kind.name}에게 쓰러졌다...`);
      this.events.push({ type: 'death' });
      return;
    }
    if (b.stance && adjacent) this.strike(m, b.stance.mult);
  }

  /** A ranged monster fires along a row or column when nothing stands in between. */
  private canShoot(m: Monster): boolean {
    const range = m.kind.range;
    if (!range) return false;
    const dx = this.pos.x - m.x;
    const dy = this.pos.y - m.y;
    if (dx !== 0 && dy !== 0) return false;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist < 2 || dist > range) return false;
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);
    for (let i = 1; i < dist; i++) {
      const x = m.x + sx * i;
      const y = m.y + sy * i;
      if (!isWalkable(this.map, x, y) || this.monsterAt(x, y)) return false;
    }
    return true;
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
    const bonus = 10 * this.danger;
    this.runGold += bonus;
    this.say(`${this.floor}층 돌파 보상 +${bonus}G`);
    this.enterFloor(this.floor + 1);
    return true;
  }

  /** Leave the tower from the stairs, keeping this run's gold. */
  retreat(): boolean {
    if (this.status !== 'onStairs') return false;
    const bonus = 10 * this.danger;
    this.runGold += bonus;
    this.say(`${this.floor}층 돌파 보상 +${bonus}G`);
    this.status = 'returned';
    return true;
  }

  /** The gate's master is down: the reward can be taken from anywhere on the last floor. */
  get gateCleared(): boolean {
    return !!this.gate && this.isTopFloor && !this.bossAlive;
  }

  /** Gold and gear for clearing a gate, once its master is down. Ends the run. */
  clearGate(): boolean {
    const gate = this.gate;
    if (!gate || !this.gateCleared || (this.status !== 'onStairs' && this.status !== 'playing')) return false;
    const gold = gateClearGold(gate);
    this.runGold += gold;
    this.say(`${gateName(gate)} 클리어! 보상 +${gold}G`);
    this.gainStones(gateClearStones(gate), this.pos.x, this.pos.y);
    this.takeGear(rollGear(this.rng, this.danger + 4));
    this.status = 'returned';
    return true;
  }

  private gainStones(n: number, x: number, y: number) {
    if (n <= 0) return;
    this.stones += n;
    this.events.push({ type: 'stone', x, y, amount: n });
    this.say(`마력석 +${n} (이번 탐험 ${this.stones}개)`);
  }

  /** Step off the stairs prompt and keep exploring the floor. */
  stay() {
    if (this.status === 'onStairs') this.status = 'playing';
  }
}
