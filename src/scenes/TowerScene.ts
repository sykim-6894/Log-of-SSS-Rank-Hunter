import * as Phaser from 'phaser';
import { activeHunter, AfterRunNews, enterGate, gradeIn, settleDeath, settleReturn } from '../core/agency';
import { gateClearGold, gateName } from '../core/gates';
import { MAP_H, mapHeight, mapWidth, TALL_MAP_H, TALL_MAP_W, Tile } from '../core/dungeon';
import { hallOfFameScore } from '../core/hunter';
import { BAG_MAX, CONSUMABLE_KINDS, CONSUMABLES, ConsumableKind, CurseKind, CURSES, describeGear, Gear, GEAR_SLOT_NAMES, offerLabel } from '../core/items';
import { DOLL_H, drawGearIcon, drawPaperDoll, gearDiff, tierColor } from '../game/paperdoll';
import { lookOf, lookTexture } from '../game/looks';
import { hasMonsterArt, monsterTexture } from '../game/monsterArt';
import { sfx, toggleSound } from '../game/sfx';
import { recommendedLevel, TRAITS } from '../core/monsters';
import { Action, REWARDS, RunEvent, TowerRun } from '../core/run';
import { cardText, cardTitle, chooseCard, pendingCards, skillCost, skillLabel, SKILLS, slotCount } from '../core/classes';
import { persist, rng, state } from '../game/store';
import { GH, GW, PORTRAIT } from '../game/layout';
import { bar, button, FONT, INK, PALETTE, panel, text, title } from '../game/ui';

const TILE = 24;
const HUD_Y = MAP_H * TILE; // 600

// Portrait layout: status bar on top, a camera that follows the hunter, the log,
// then a thumb area with the joystick on the left and action buttons on the right.
const P_TOP_H = 84;
const P_LOG_H = 60;
const P_CTL_H = 210;
const P_MAP_H = GH - P_TOP_H - P_LOG_H - P_CTL_H;
const P_LOG_Y = P_TOP_H + P_MAP_H;
const P_CTL_Y = P_LOG_Y + P_LOG_H;
const P_BTN_X = GW - 252; // action buttons start here
const P_ZOOM = 1.25;
const JOY_RADIUS = 44;
const JOY_DEADZONE = 14;
const JOY_REPEAT_MS = 170;
/** How long held walking pauses when a new enemy comes into view, before it carries on. */
const JOY_SIGHT_PAUSE_MS = 600;

/** One trip up the Tower of Growth. Draws the TowerRun and turns input into actions. */
export class TowerScene extends Phaser.Scene {
  private run!: TowerRun;
  private mapLayer!: Phaser.GameObjects.Graphics;
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private joy: {
    id: number;
    ox: number;
    oy: number;
    dir: { dx: number; dy: number } | null;
    used: boolean;
    /** Held walking waits until this time (a short pause when an enemy shows up). */
    pauseUntil: number;
    gfx: Phaser.GameObjects.Graphics;
    timer: Phaser.Time.TimerEvent | null;
  } | null = null;
  /** Level when the screen was last drawn, to notice level ups. */
  private shownLevel = 0;
  /** The gate master just fell: offer to leave with the reward at the next quiet moment. */
  private clearPending = false;
  /** Center pop-ups for finds and curses, shown one after another. */
  private notices: Notice[] = [];
  private noticeUp?: Phaser.GameObjects.Container;
  /** Portrait only: a fixed camera for the HUD while the main camera follows the hunter. */
  private uiCam: Phaser.Cameras.Scene2D.Camera | null = null;

  constructor() {
    super('Tower');
  }

  private startFloor = 1;
  /** Gate picked at the agency, if this trip goes into a gate. */
  private gateId?: number;

  init(data: { startFloor?: number; gateId?: number }) {
    this.startFloor = data?.startFloor ?? 1;
    this.gateId = data?.gateId;
  }

  create() {
    this.cameras.main.setBackgroundColor(PALETTE.bg);
    this.joy = null;
    this.metKinds = new Set();
    this.notices = [];
    this.noticeUp = undefined;
    this.clearPending = false;
    this.run = this.resumeOrStart();
    this.overlay = [];
    this.dynamic = [];
    this.uiCam = null;
    if (PORTRAIT) {
      const cam = this.cameras.main;
      cam.setViewport(0, P_TOP_H, GW, P_MAP_H).setZoom(P_ZOOM);
      this.uiCam = this.cameras.add(0, 0, GW, GH);
    }
    this.mapLayer = this.world(this.add.graphics());
    this.shownLevel = this.run.hunter.level;

    const keys: Record<string, Action> = {
      ArrowUp: { type: 'move', dx: 0, dy: -1 },
      ArrowDown: { type: 'move', dx: 0, dy: 1 },
      ArrowLeft: { type: 'move', dx: -1, dy: 0 },
      ArrowRight: { type: 'move', dx: 1, dy: 0 },
      w: { type: 'move', dx: 0, dy: -1 },
      s: { type: 'move', dx: 0, dy: 1 },
      a: { type: 'move', dx: -1, dy: 0 },
      d: { type: 'move', dx: 1, dy: 0 },
      q: { type: 'skill', slot: 0 },
      1: { type: 'skill', slot: 0 },
      2: { type: 'skill', slot: 1 },
      3: { type: 'skill', slot: 2 },
      e: { type: 'use', item: 'hp' },
      r: { type: 'use', item: 'mp' },
      f: { type: 'use', item: 'guard' },
      x: { type: 'use', item: 'escape' },
      ' ': { type: 'wait' },
    };
    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      if (ev.key.toLowerCase() === 'b') return this.showBag();
      if (ev.key.toLowerCase() === 'm') {
        this.run.log.push(toggleSound() ? '소리를 켰다.' : '소리를 껐다.');
        return this.redraw();
      }
      const action = keys[ev.key] ?? keys[ev.key.toLowerCase()];
      if (action) this.perform(action);
    });

    // Touch the map: a joystick appears under the finger. Drag to walk, hold to keep walking.
    // A quick tap without dragging still steps one tile toward the tapped point.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.joyStart(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.joyMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.joyEnd(p));
    this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.joyEnd(p));

    this.redraw();
  }

  /** Tap the minimap to make it larger or smaller again. */
  private bigMinimap = false;

  /** Where the minimap sits: top right corner of the map view, upright layout only. */
  private minimapRect() {
    if (!PORTRAIT || !this.run) return undefined;
    const px = this.bigMinimap ? 6 : 3;
    const w = mapWidth(this.run.map) * px + 8;
    const h = mapHeight(this.run.map) * px + 8;
    return { x: GW - w - 8, y: P_TOP_H + 8, w, h, px };
  }

  /** The explored part of the floor in small: walls, stairs, enemies in sight, the hunter. */
  private drawMinimap() {
    const r = this.minimapRect();
    if (!r) return;
    const run = this.run;
    const g = this.ui(this.add.graphics().setDepth(30));
    this.dynamic.push(g);
    g.fillStyle(0x000000, 0.55).fillRect(r.x, r.y, r.w, r.h);
    g.lineStyle(1, PALETTE.line, 1).strokeRect(r.x, r.y, r.w, r.h);
    const ox = r.x + 4;
    const oy = r.y + 4;
    const dot = (x: number, y: number, color: number, alpha = 1) => g.fillStyle(color, alpha).fillRect(ox + x * r.px, oy + y * r.px, r.px, r.px);
    for (let y = 0; y < mapHeight(run.map); y++) {
      for (let x = 0; x < mapWidth(run.map); x++) {
        if (!run.seen[y][x]) continue;
        const t = run.map.tiles[y][x];
        if (t === Tile.Floor) dot(x, y, 0x8a7560, 0.8);
        else if (t === Tile.Stairs) dot(x, y, PALETTE.gold);
      }
    }
    for (const c of run.chests) if (run.seen[c.y][c.x]) dot(c.x, c.y, 0xc98a3a);
    if (run.merchant && run.seen[run.merchant.y][run.merchant.x]) dot(run.merchant.x, run.merchant.y, 0x7fd67a);
    for (const m of run.monsters) if (run.canSee(m)) dot(m.x, m.y, m.kind.stalker ? 0xb05cff : m.kind.boss || m.kind.elite ? 0xff5040 : 0xd0603a);
    dot(run.pos.x, run.pos.y, 0xffffff);
  }

  /** Map objects: drawn only by the main (following) camera. */
  private world<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.uiCam?.ignore(o);
    return o;
  }

  /** HUD and dialogs: drawn only by the fixed camera in portrait. */
  private ui<T extends Phaser.GameObjects.GameObject>(o: T): T {
    if (this.uiCam) this.cameras.main.ignore(o);
    return o;
  }

  /** Where a touch may start the joystick: the map, or (portrait) the left of the thumb area. */
  private joyArea(p: Phaser.Input.Pointer) {
    if (!PORTRAIT) return p.y < HUD_Y;
    if (p.y >= P_TOP_H && p.y < P_LOG_Y) return true;
    return p.y >= P_CTL_Y && p.x < P_BTN_X - 6;
  }

  private joyStart(p: Phaser.Input.Pointer) {
    if (this.overlay.length || this.joy) return;
    const mm = this.minimapRect();
    if (mm && p.x >= mm.x && p.x <= mm.x + mm.w && p.y >= mm.y && p.y <= mm.y + mm.h) {
      this.bigMinimap = !this.bigMinimap;
      return this.redraw();
    }
    if (!this.joyArea(p)) return;
    const gfx = this.ui(this.add.graphics().setDepth(50));
    this.joy = { id: p.id, ox: p.x, oy: p.y, dir: null, used: false, pauseUntil: 0, gfx, timer: null };
    this.drawJoy(p.x, p.y);
  }

  private joyMove(p: Phaser.Input.Pointer) {
    const joy = this.joy;
    if (!joy || p.id !== joy.id) return;
    let vx = p.x - joy.ox;
    let vy = p.y - joy.oy;
    const len = Math.hypot(vx, vy);
    if (len > JOY_RADIUS) {
      vx = (vx / len) * JOY_RADIUS;
      vy = (vy / len) * JOY_RADIUS;
    }
    this.drawJoy(joy.ox + vx, joy.oy + vy);
    if (len < JOY_DEADZONE) {
      joy.dir = null;
      return;
    }
    const dir = Math.abs(vx) >= Math.abs(vy) ? { dx: Math.sign(vx), dy: 0 } : { dx: 0, dy: Math.sign(vy) };
    const changed = !joy.dir || joy.dir.dx !== dir.dx || joy.dir.dy !== dir.dy;
    joy.dir = dir;
    if (!changed) return;
    // A new direction always takes one step right away and clears a safety stop.
    joy.pauseUntil = 0;
    joy.used = true;
    this.joyStep();
    if (this.joy && !this.joy.timer) {
      this.joy.timer = this.time.addEvent({ delay: JOY_REPEAT_MS, loop: true, callback: () => this.joyStep() });
    }
  }

  private joyEnd(p: Phaser.Input.Pointer) {
    const joy = this.joy;
    if (!joy || p.id !== joy.id) return;
    this.joyClear();
    if (joy.used || this.overlay.length) return;
    // Plain tap on the map: step toward the tapped tile, or wait when tapping the hunter.
    if (PORTRAIT && (joy.oy < P_TOP_H || joy.oy >= P_LOG_Y)) return;
    const at = this.cameras.main.getWorldPoint(joy.ox, joy.oy);
    const dx = Math.floor(at.x / TILE) - this.run.pos.x;
    const dy = Math.floor(at.y / TILE) - this.run.pos.y;
    if (dx === 0 && dy === 0) return this.perform({ type: 'wait' });
    if (Math.abs(dx) >= Math.abs(dy)) this.perform({ type: 'move', dx: Math.sign(dx), dy: 0 });
    else this.perform({ type: 'move', dx: 0, dy: Math.sign(dy) });
  }

  /**
   * One held-joystick step. When a kind of enemy not met before this run comes into view,
   * walking pauses briefly (with a "!" over the hunter) so the player can react, then carries
   * on while held. Kinds already met don't stop the hunter again.
   */
  private joyStep() {
    const joy = this.joy;
    if (!joy || !joy.dir || this.time.now < joy.pauseUntil) return;
    if (this.overlay.length || this.run.status !== 'playing') return this.joyClear();
    this.perform({ type: 'move', dx: joy.dir.dx, dy: joy.dir.dy });
    if (this.joy && this.noteNewKinds()) {
      this.joy.pauseUntil = this.time.now + JOY_SIGHT_PAUSE_MS;
      this.floatText(this.run.pos.x, this.run.pos.y, '!', INK.gold);
    }
  }

  /** Kinds of enemy already met this run (rival hunters and mid-bosses count as their own kinds). */
  private metKinds = new Set<string>();

  /** Records the kinds of enemy in view. True if one of them was new. */
  private noteNewKinds(): boolean {
    let fresh = false;
    for (const m of this.run.monsters) {
      if (!this.run.canSee(m) || this.metKinds.has(m.kind.id)) continue;
      this.metKinds.add(m.kind.id);
      const trait = m.kind.trait ? TRAITS[m.kind.trait] : undefined;
      if (trait) this.run.log.push(`[${trait.name}] ${m.kind.name}: ${trait.text}`);
      fresh = true;
    }
    return fresh;
  }

  private drawJoy(kx: number, ky: number) {
    const joy = this.joy;
    if (!joy) return;
    const g = joy.gfx.clear();
    g.fillStyle(0x000000, 0.25).fillCircle(joy.ox, joy.oy, JOY_RADIUS + 8);
    g.lineStyle(3, 0xe8d5b0, 0.55).strokeCircle(joy.ox, joy.oy, JOY_RADIUS + 8);
    g.fillStyle(0xe8d5b0, 0.7).fillCircle(kx, ky, 18);
    g.lineStyle(2, 0x2a221c, 0.8).strokeCircle(kx, ky, 18);
  }

  private joyClear() {
    if (!this.joy) return;
    this.joy.timer?.remove();
    this.joy.gfx.destroy();
    this.joy = null;
  }

  /** Continue the run saved in the game state if there is one, otherwise start a new one. */
  private resumeOrStart(): TowerRun {
    const options = {
      rivals: state.rival.roster,
      rivalAgency: state.rival.name,
      mapSize: PORTRAIT ? { w: TALL_MAP_W, h: TALL_MAP_H } : undefined,
    };
    const saved = state.run;
    if (saved) {
      const slot = state.slots.findIndex((h) => h?.id === saved.hunterId);
      const run = slot >= 0 ? TowerRun.restore(saved.data, state.slots[slot]!, rng, options) : undefined;
      if (run) {
        state.activeSlot = slot;
        run.log.push('— 저장된 곳에서 이어서 진행 —');
        // A tall floor saved on an upright phone doesn't fit the wide screen: lay this floor out again.
        if (!PORTRAIT && mapHeight(run.map) > MAP_H) run.enterFloor(run.floor);
        return run;
      }
      state.run = undefined;
    }
    const gate = this.gateId !== undefined ? enterGate(state, this.gateId) : undefined;
    const run = new TowerRun(activeHunter(state)!, rng, { ...options, startFloor: this.startFloor, gate });
    if (this.startFloor > 1) run.log.push(`이미 돌파한 ${this.startFloor - 1}층까지 건너뛰었다.`);
    return run;
  }

  /** Save after every change, so closing the app mid-run loses nothing. A finished run clears it. */
  private saveRun() {
    const s = this.run.status;
    if (s === 'dead' || s === 'returned') return;
    state.run = { hunterId: this.run.hunter.id, data: this.run.snapshot() };
    persist();
  }

  private perform(action: Action) {
    if (this.overlay.length) return;
    this.run.act(action);
    this.redraw();
    // Kinds seen while walking with keys or taps don't stop the joystick later.
    if (!this.joy) this.noteNewKinds();
  }

  private clearDynamic() {
    this.dynamic.forEach((o) => o.destroy());
    this.dynamic = [];
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.world(o);
    this.dynamic.push(o);
    return o;
  }

  private redraw() {
    const run = this.run;
    this.playEvents(run.drainEvents());
    const g = this.mapLayer;
    g.clear();
    this.clearDynamic();

    const mw = mapWidth(run.map);
    const mh = mapHeight(run.map);
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        if (!run.seen[y][x]) continue;
        const tile = run.map.tiles[y][x];
        if (tile === Tile.Wall && !this.touchesFloor(x, y)) continue;
        this.drawTile(g, x, y, tile, run.isVisible(x, y));
      }
    }
    for (const c of run.chests) if (run.seen[c.y][c.x]) this.drawChest(g, c.x, c.y, run.isVisible(c.x, c.y));

    const mer = run.merchant;
    if (mer && run.seen[mer.y][mer.x]) {
      const mg = this.keep(this.add.graphics());
      mg.fillStyle(0x3d5a3a, run.isVisible(mer.x, mer.y) ? 1 : 0.45).fillRect(mer.x * TILE + 3, mer.y * TILE + 3, TILE - 6, TILE - 6);
      this.keep(this.glyph(mer.x, mer.y, '$', INK.gold, 16));
    }

    for (const m of run.monsters) {
      if (!run.canSee(m)) continue;
      const color = m.hunter ? '#d79bff' : m.kind.boss ? INK.red : m.kind.elite ? INK.gold : m.kind.range ? (m.awake ? '#7fd6c9' : '#5f9c93') : m.awake ? INK.rust : '#c9a46a';
      if (m.hunter) this.keep(this.figure(m.x, m.y, lookOf(m.hunter), 0xd79bff));
      else if (hasMonsterArt(m.kind.id)) {
        // Mid-bosses: the same creature, bigger and gold. Sleeping monsters are a little dim.
        const img = this.keep(this.add.image(m.x * TILE + TILE / 2, m.y * TILE + TILE - 1, monsterTexture(this, m.kind.id)).setOrigin(0.5, 1));
        if (m.kind.elite) img.setScale(1.3).setTint(0xffd27a);
        if (m.kind.boss) img.setScale(1.35);
        if (m.kind.stalker) img.setScale(1.45);
        if (!m.awake) img.setAlpha(0.75);
        if (m.stun) img.setTint(0x9fd8ff);
      } else this.keep(this.glyph(m.x, m.y, m.kind.glyph, color, m.kind.boss ? 24 : m.kind.elite ? 20 : 15));
      const hpRatio = m.hp / m.maxHp;
      if (hpRatio < 1 && !m.kind.stalker) {
        const hb = this.keep(this.add.graphics());
        hb.fillStyle(0x000000, 1);
        hb.fillRect(m.x * TILE + 2, m.y * TILE + TILE - 4, TILE - 5, 3);
        hb.fillStyle(PALETTE.hp, 1);
        hb.fillRect(m.x * TILE + 2, m.y * TILE + TILE - 4, (TILE - 5) * hpRatio, 3);
      }
    }
    this.keep(this.figure(run.pos.x, run.pos.y, lookOf(run.hunter)));
    if (PORTRAIT) {
      // Bounds follow the floor, since a run saved sideways keeps its wide floor.
      this.cameras.main.setBounds(0, 0, mw * TILE, mh * TILE);
      this.cameras.main.centerOn(run.pos.x * TILE + TILE / 2, run.pos.y * TILE + TILE / 2);
      this.drawMinimap();
    }
    this.drawStalkerClock();

    if (PORTRAIT) this.drawHudPortrait();
    else this.drawHud();
    if (run.hunter.level > this.shownLevel) this.showLevelUp(run.hunter.level);
    this.shownLevel = run.hunter.level;

    if (run.hunter.picks > 0 && run.status !== 'dead' && !this.overlay.length) this.showCards();
    if (this.clearPending && run.status === 'playing' && !this.overlay.length) this.showGateClear();
    if (run.status === 'onStairs' && !this.overlay.length) this.showStairs();
    if (run.status === 'dead' && !this.overlay.length) this.showDeath();
    this.saveRun();
    if (run.status === 'choosing' && !this.overlay.length) this.showChoice();
    if (run.status === 'trading' && !this.overlay.length) this.showMerchant();
    if (run.status === 'returned' && !this.overlay.length) this.finishReturn();
  }

  /** Stone floor with a little speckle; bricked walls. Remembered tiles are drawn dark. */
  private drawTile(g: Phaser.GameObjects.Graphics, x: number, y: number, tile: Tile, visible: boolean) {
    const px = x * TILE;
    const py = y * TILE;
    const hash = (x * 73856093) ^ (y * 19349663);
    if (tile === Tile.Wall) {
      g.fillStyle(visible ? 0x5a4a3c : 0x2a221c, 1).fillRect(px, py, TILE, TILE);
      g.fillStyle(visible ? 0x3a2f26 : 0x1c1713, 1);
      g.fillRect(px, py + 11, TILE, 2).fillRect(px, py + 23, TILE, 1);
      const off = y % 2 === 0 ? 6 : 18;
      g.fillRect(px + off, py, 2, 11).fillRect(px + ((off + 12) % 24), py + 13, 2, 10);
      g.fillStyle(visible ? 0x6e5b49 : 0x2f2620, 1).fillRect(px, py, TILE, 1);
      return;
    }
    g.fillStyle(visible ? ((x + y) % 2 ? 0x37302a : 0x3a332c) : 0x1b1712, 1).fillRect(px, py, TILE, TILE);
    if (visible && (hash & 7) === 0) g.fillStyle(0x3a322b, 1).fillRect(px + (hash & 15) + 3, py + ((hash >> 4) & 15) + 3, 2, 2);
    if (tile === Tile.Stairs) {
      const c = this.run.bossAlive ? 0x6b5330 : PALETTE.gold;
      g.fillStyle(c, visible ? 1 : 0.4);
      for (let i = 0; i < 4; i++) g.fillRect(px + 4 + i * 4, py + 18 - i * 4, 16 - i * 4, 3);
    }
  }

  /** A small wooden chest with a gold band. Cursed ones look the same. */
  private drawChest(g: Phaser.GameObjects.Graphics, x: number, y: number, visible: boolean) {
    const px = x * TILE;
    const py = y * TILE;
    const a = visible ? 1 : 0.45;
    g.fillStyle(0x000000, 0.4 * a).fillRect(px + 5, py + 18, 16, 3);
    g.fillStyle(0x8a5a2b, a).fillRect(px + 4, py + 8, 16, 11);
    g.fillStyle(0x5e3b1c, a).fillRect(px + 4, py + 12, 16, 2);
    g.fillStyle(0xa8703a, a).fillRect(px + 5, py + 8, 14, 3);
    g.fillStyle(PALETTE.gold, a).fillRect(px + 11, py + 8, 2, 11).fillRect(px + 10, py + 13, 4, 3);
  }

  private touchesFloor(x: number, y: number): boolean {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const t = this.run.map.tiles[y + dy]?.[x + dx];
        if (t !== undefined && t !== Tile.Wall) return true;
      }
    }
    return false;
  }

  /** A hunter's pixel figure standing on a tile. Rival hunters get a purple tint. */
  private figure(x: number, y: number, look: number, tint?: number) {
    const img = this.add.image(x * TILE + TILE / 2, y * TILE + TILE - 1, lookTexture(this, look)).setOrigin(0.5, 1);
    if (tint !== undefined) img.setTint(tint);
    return img;
  }

  private glyph(x: number, y: number, ch: string, color: string, size: number) {
    return this.add
      .text(x * TILE + TILE / 2, y * TILE + TILE / 2 - 1, ch, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold' })
      .setOrigin(0.5);
  }


  private drawHud() {
    const run = this.run;
    const h = run.hunter;
    const k = <T extends Phaser.GameObjects.GameObject>(o: T) => this.keep(o);
    const g = k(this.add.graphics());
    g.fillStyle(PALETTE.panel, 1).fillRect(0, HUD_Y, 960, 120);
    g.fillStyle(PALETTE.line, 1).fillRect(0, HUD_Y, 960, 2);
    g.fillStyle(PALETTE.shadow, 1).fillRect(0, HUD_Y + 2, 960, 2);
    const nameText = k(title(this, 16, HUD_Y + 12, h.name, 15, INK.text));
    k(text(this, 16 + nameText.width + 10, HUD_Y + 15, `${gradeIn(state, h)}급 · Lv.${h.level}`, 12, INK.rust, true));
    k(text(this, 16, HUD_Y + 40, `체력`, 12, INK.quiet));
    k(bar(this, 54, HUD_Y + 43, 150, 8, h.hp / h.maxHp, PALETTE.hp));
    k(text(this, 212, HUD_Y + 40, `${h.hp}/${h.maxHp}`, 12, INK.text));
    k(text(this, 16, HUD_Y + 60, `마나`, 12, INK.quiet));
    k(bar(this, 54, HUD_Y + 63, 150, 8, h.mp / h.maxMp, PALETTE.mp));
    k(text(this, 212, HUD_Y + 60, `${h.mp}/${h.maxMp}`, 12, INK.text));
    const status = k(text(this, 16, HUD_Y + 88, `${run.placeShort}(적정 Lv.${recommendedLevel(run.danger)}) · 수입 ${run.runGold}G · 물약 ${this.bagLine()}` + (h.rescues ? ` · 지원 ${h.rescues}` : ''), 12, INK.gold));
    // Keep clear of the log beside it: drop what the bag button already shows.
    if (status.width > 258) status.setText(`${run.placeShort}(적정 Lv.${recommendedLevel(run.danger)}) · 수입 ${run.runGold}G`);

    const lg = k(this.add.graphics());
    lg.fillStyle(PALETTE.panelDark, 1).fillRect(284, HUD_Y + 12, 400, 96);
    run.log.slice(-4).forEach((line, i, arr) =>
      k(text(this, 296, HUD_Y + 20 + i * 21, line, 12, i === arr.length - 1 ? INK.text : INK.faint)),
    );

    this.skillButtons(700, HUD_Y + 12, 244, 46, true).forEach(k);
    k(button(this, 700, HUD_Y + 64, 120, 44, `가방 B`, () => this.showBag()));
    if (run.guardTurns > 0) k(text(this, 204, HUD_Y + 15, `무적 ${run.guardTurns}턴`, 12, INK.gate, true));
    k(button(this, 828, HUD_Y + 64, 116, 44, `대기  Space`, () => this.perform({ type: 'wait' })));
  }

  private drawHudPortrait() {
    const run = this.run;
    const h = run.hunter;
    const k = <T extends Phaser.GameObjects.GameObject>(o: T) => {
      this.dynamic.push(o);
      return this.ui(o);
    };
    const g = k(this.add.graphics());
    // Top status bar
    g.fillStyle(PALETTE.panel, 1).fillRect(0, 0, GW, P_TOP_H);
    g.fillStyle(PALETTE.line, 1).fillRect(0, P_TOP_H - 2, GW, 2);
    const nameText = k(title(this, 14, 10, h.name, 15, INK.text));
    const gradeText = k(text(this, 14 + nameText.width + 8, 13, `${gradeIn(state, h)}급 · Lv.${h.level}`, 12, INK.rust, true));
    // Long lines (gates, big earnings) lose the words the bag button already shows.
    const room = GW - 14 - (gradeText.x + gradeText.width + 10);
    const full = `${run.placeShort}(적정 Lv.${recommendedLevel(run.danger)}) · 수입 ${run.runGold}G · 물약 ${this.bagLine()}` + (h.rescues ? ` · 지원 ${h.rescues}` : '');
    const status = k(text(this, GW - 14, 13, full, 12, INK.gold).setOrigin(1, 0));
    if (status.width > room) status.setText(`${run.placeShort}(적정 Lv.${recommendedLevel(run.danger)}) · ${run.runGold}G`);
    k(text(this, 14, 38, '체력', 12, INK.quiet));
    k(bar(this, 52, 41, 300, 8, h.hp / h.maxHp, PALETTE.hp));
    k(text(this, GW - 14, 38, `${h.hp}/${h.maxHp}`, 12, INK.text).setOrigin(1, 0));
    k(text(this, 14, 58, '마나', 12, INK.quiet));
    k(bar(this, 52, 61, 300, 8, h.mp / h.maxMp, PALETTE.mp));
    k(text(this, GW - 14, 58, `${h.mp}/${h.maxMp}`, 12, INK.text).setOrigin(1, 0));

    // Log strip: the last two lines
    g.fillStyle(PALETTE.panelDark, 1).fillRect(0, P_LOG_Y, GW, P_LOG_H);
    g.fillStyle(PALETTE.line, 1).fillRect(0, P_LOG_Y, GW, 2);
    run.log.slice(-2).forEach((line, i, arr) => {
      const t = k(text(this, 14, P_LOG_Y + 10 + i * 22, line, 12, i === arr.length - 1 ? INK.text : INK.faint));
      let v = line;
      while (t.width > GW - 28 && v.length > 1) t.setText(`${(v = v.slice(0, -1))}…`);
    });

    // Thumb area: joystick pad on the left, actions on the right
    g.fillStyle(PALETTE.panel, 1).fillRect(0, P_CTL_Y, GW, GH - P_CTL_Y);
    g.fillStyle(PALETTE.line, 1).fillRect(0, P_CTL_Y, GW, 2);
    const cx = P_BTN_X / 2;
    const cy = P_CTL_Y + 96;
    g.lineStyle(2, PALETTE.line, 1).strokeCircle(cx, cy, 60);
    g.fillStyle(PALETTE.dim, 1).fillCircle(cx, cy, 20);
    k(text(this, cx, P_CTL_Y + 172, '여기를 끌어서 이동', 12, INK.faint).setOrigin(0.5, 0));
    const bw = GW - 14 - P_BTN_X;
    this.skillButtons(P_BTN_X, P_CTL_Y + 18, bw, 66, false).forEach(k);
    k(button(this, P_BTN_X, P_CTL_Y + 94, (bw - 6) / 2, 52, `가방\n물약 ${h.bag.hp + h.bag.mp + h.bag.guard}`, () => this.showBag()));
    if (run.guardTurns > 0) k(text(this, 14, P_TOP_H + 8, `무적 ${run.guardTurns}턴`, 12, INK.gate, true));
    k(button(this, P_BTN_X + (bw + 6) / 2, P_CTL_Y + 94, (bw - 6) / 2, 52, '대기\n(한 턴)', () => this.perform({ type: 'wait' })));
    const buffs = this.buffLine();
    if (buffs) k(text(this, 14, P_TOP_H + (run.guardTurns > 0 ? 26 : 8), buffs, 12, INK.gate, true));
  }

  /** Three skill slot buttons in a row: name and upgrade, mana cost; locked slots say when they open. */
  private skillButtons(x: number, y: number, w: number, hgt: number, keysShown: boolean) {
    const h = this.run.hunter;
    const bw = (w - 12) / 3;
    const open = slotCount(h.level);
    return [0, 1, 2].map((i) => {
      const s = h.skills[i];
      const bx = x + i * (bw + 6);
      if (!s) {
        const label = i < open ? '빈 칸\n레벨업 때' : `Lv.${i === 1 ? 5 : 10}에\n열림`;
        return button(this, bx, y, bw, hgt, label, () => {}, { enabled: false });
      }
      const cost = skillCost(s);
      const key = keysShown ? `${i + 1} ` : '';
      return button(this, bx, y, bw, hgt, `${key}${SKILLS[s.id].name}\n${s.lv}단·마나${cost}`, () => this.perform({ type: 'skill', slot: i }), {
        enabled: h.mp >= cost,
      });
    });
  }

  /** Effects the hunter has up right now, for the status line. */
  private buffLine(): string {
    const b = this.run.buffs;
    const parts: string[] = [];
    if (b.stance) parts.push(`반격 ${b.stance.turns}`);
    if (b.rage) parts.push(`함성 ${b.rage.turns}`);
    if (b.shield) parts.push(`보호막 ${b.shield.turns}`);
    if (b.block) parts.push(`막기 ${b.block.charges}회`);
    if (b.defUp) parts.push(`방어+${b.defUp.amount} ${b.defUp.turns}`);
    if (b.sanctuary) parts.push(`성역 ${b.sanctuary.turns}`);
    if (this.run.traps.length) parts.push(`덫 ${this.run.traps.length}`);
    return parts.join(' · ');
  }

  /** Level-up cards: pick one of three. A new skill with full slots asks which one to drop. */
  private showCards() {
    const h = this.run.hunter;
    const cards = pendingCards(h, rng);
    if (!cards) return;
    this.joyClear();
    persist();
    const pick = (i: number, replace?: number) => {
      const msg = chooseCard(h, i, replace);
      if (msg) this.run.log.push(`카드 선택: ${msg}.`);
      this.closeOverlay();
      this.redraw();
    };
    const buttons: Array<[string, () => void, boolean?, boolean?]> = cards.map((c, i) => [
      `${cardTitle(c, h)}\n${cardText(c, h)}`,
      () => {
        if (c.type === 'learn' && h.skills.length >= slotCount(h.level)) {
          this.closeOverlay();
          this.showReplace(i, pick);
        } else pick(i);
      },
      c.type !== 'stat',
    ]);
    const more = h.picks > 1 ? ` · 남은 선택 ${h.picks}` : '';
    this.dialog(`Lv.${h.level} 카드 고르기`, [`스킬 칸 ${h.skills.length}/${slotCount(h.level)}${more}`], buttons, INK.gold);
  }

  private showReplace(card: number, pick: (i: number, replace?: number) => void) {
    const h = this.run.hunter;
    const buttons: Array<[string, () => void, boolean?, boolean?]> = h.skills.map((s, j) => [`${skillLabel(s)}단계 버리고 바꾸기`, () => pick(card, j)]);
    buttons.push(['다른 카드 고르기', () => {
      this.closeOverlay();
      this.showCards();
    }, true]);
    this.dialog('어떤 스킬과 바꿀까?', ['버린 스킬의 강화는 사라진다.'], buttons, INK.gold);
  }

  /** The wandering merchant's wares, paid from this run's earnings. */
  private showMerchant() {
    const run = this.run;
    const m = run.merchant;
    if (!m) return;
    this.joyClear();
    const buttons: Array<[string, () => void, boolean?, boolean?]> = m.offers.map((o, i) => [
      m.sold[i] ? `${offerLabel(o)} · 판매 완료` : `${offerLabel(o)} · ${o.price}G`,
      () => {
        run.buyOffer(i);
        this.closeOverlay();
        this.redraw();
      },
      false,
      !m.sold[i] && run.runGold >= o.price,
    ]);
    buttons.push(['거래 끝내기 (상인이 떠남)', () => {
      run.leaveMerchant();
      this.closeOverlay();
      this.redraw();
    }, true]);
    this.dialog('떠돌이 상인', [`이번 수입 ${run.runGold}G로 살 수 있다.`, '거래를 끝내면 상인은 떠난다.'], buttons, INK.gold);
  }

  /** Floating numbers, flashes, shakes and sounds for what just happened. */
  private playEvents(events: RunEvent[]) {
    const cam = this.cameras.main;
    const at = this.run.pos;
    let hurt = 0;
    for (const e of events) {
      switch (e.type) {
        case 'hit':
          this.floatText(e.x, e.y, `${e.amount}`, '#fff4e2');
          this.tileFlash(e.x, e.y);
          sfx.hit();
          break;
        case 'kill':
          this.burst(e.x, e.y, e.big);
          if (e.big) {
            cam.shake(220, 0.008);
            sfx.bigKill();
          } else sfx.kill();
          break;
        case 'shot':
          this.shot(e.x, e.y, e.fromHunter);
          break;
        case 'miss':
          this.floatText(e.x, e.y, '빗나감', INK.faint);
          break;
        case 'dodge':
          this.floatText(at.x, at.y, '회피', INK.gate);
          sfx.block();
          break;
        case 'skill':
          this.floatText(at.x, at.y, e.name, INK.gold);
          sfx.skill();
          break;
        case 'hurt':
          hurt += e.amount;
          this.floatText(at.x, at.y, `-${e.amount}`, INK.red);
          break;
        case 'block':
          this.floatText(at.x, at.y, '막음', INK.gate);
          sfx.block();
          break;
        case 'heal':
          this.floatText(at.x, at.y, `+${e.amount}`, '#8fdc7a');
          sfx.heal();
          break;
        case 'mana':
          this.floatText(at.x, at.y, `+${e.amount}`, '#6fc6e0');
          sfx.mana();
          break;
        case 'chest':
          if (e.cursed) {
            cam.flash(260, 120, 40, 160);
            sfx.curse();
          } else sfx.chest();
          break;
        case 'gear':
          if (e.equipped) sfx.gear();
          this.notice(gearNotice(e.gear, e.equipped, e.old));
          break;
        case 'loot':
          this.notice(lootNotice(e.item, e.got, e.count));
          break;
        case 'gold':
          this.notice({ heading: '보물상자', color: INK.gold, lines: [[`+${e.amount}G`, INK.gold, 20]], ms: 1400 });
          break;
        case 'curse':
          this.notice(curseNotice(e.curse, e.detail));
          break;
        case 'buy':
          sfx.buy();
          break;
        case 'levelup':
          sfx.levelup();
          break;
        case 'rescue':
          this.floatText(at.x, at.y, '긴급 지원!', INK.gold);
          sfx.rescue();
          break;
        case 'death':
          cam.shake(400, 0.012);
          sfx.death();
          break;
        case 'floor':
          sfx.floor();
          break;
        case 'monsterHeal':
          if (this.run.isVisible(e.x, e.y)) this.floatText(e.x, e.y, `+${e.amount}`, '#8fdc7a');
          break;
        case 'immune':
          this.floatText(e.x, e.y, '무효', INK.faint);
          sfx.block();
          break;
        case 'stalker':
          cam.shake(500, 0.01);
          cam.flash(400, 90, 30, 140);
          sfx.curse();
          this.notice({
            heading: `${e.nth}차 던전 붕괴!`,
            color: '#c98bff',
            lines: [
              [e.nth > 1 ? '더 강한 심연의 추적자가 나타났다.' : '심연의 추적자가 나타났다.', INK.text],
              ['쓰러뜨릴 수 없는 적이 당신을 찾아 나섰다.', INK.quiet],
              ['계단을 찾아 이 층을 떠나라!', INK.red, 15],
            ],
            ms: 3200,
          });
          break;
        case 'gateClear':
          this.clearPending = true;
          cam.flash(300, 229, 174, 70);
          sfx.levelup();
          break;
      }
    }
    if (hurt > 0) {
      cam.flash(140, 150, 25, 20);
      if (hurt >= this.run.hunter.maxHp * 0.2) cam.shake(160, 0.006);
      sfx.hurt();
    }
  }

  /** A number that rises from a tile and fades. Several on one tile spread a little. */
  private floatText(x: number, y: number, value: string, color: string) {
    const t = this.world(
      this.add
        .text(x * TILE + TILE / 2 + Phaser.Math.Between(-4, 4), y * TILE - 2, value, {
          fontFamily: FONT,
          fontSize: '13px',
          color,
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setDepth(30),
    );
    this.tweens.add({ targets: t, y: t.y - 20, alpha: 0, delay: 250, duration: 550, onComplete: () => t.destroy() });
  }

  /** A white blink over a tile that was hit. */
  /** An arrow or bolt between (x, y) and the hunter: toward the hunter, or out from them. */
  private shot(tx: number, ty: number, fromHunter = false) {
    const a = this.run.pos;
    const x = fromHunter ? a.x : tx;
    const y = fromHunter ? a.y : ty;
    const to = fromHunter ? { x: tx, y: ty } : a;
    const p = this.world(this.add.rectangle(x * TILE + TILE / 2, y * TILE + TILE / 2, 8, 3, 0xe5ae46).setDepth(26));
    p.setRotation(Math.atan2(to.y - y, to.x - x));
    this.tweens.add({
      targets: p,
      x: to.x * TILE + TILE / 2,
      y: to.y * TILE + TILE / 2,
      duration: 90 + 25 * (Math.abs(to.x - x) + Math.abs(to.y - y)),
      onComplete: () => p.destroy(),
    });
  }

  private tileFlash(x: number, y: number) {
    const r = this.world(this.add.rectangle(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE, TILE, 0xffffff, 0.55).setDepth(25));
    this.tweens.add({ targets: r, alpha: 0, duration: 120, onComplete: () => r.destroy() });
  }

  /** An outline that grows and fades where something died. */
  private burst(x: number, y: number, big: boolean) {
    const g = this.world(this.add.rectangle(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE, TILE).setDepth(25));
    g.setStrokeStyle(2, big ? PALETTE.gold : 0xe07a45, 1);
    this.tweens.add({ targets: g, scale: big ? 3 : 1.8, alpha: 0, duration: big ? 500 : 300, onComplete: () => g.destroy() });
  }

  /** A banner over the map that rises and fades: new level, full health and mana. */
  private showLevelUp(level: number) {
    const cx = GW / 2;
    const cy = PORTRAIT ? P_TOP_H + P_MAP_H * 0.18 : HUD_Y * 0.2; // above the hunter, who sits mid-map in portrait
    const banner = this.ui(this.add.container(cx, cy).setDepth(40));
    const g = this.add.graphics();
    g.fillStyle(PALETTE.shadow, 0.85).fillRect(-150, -34, 300, 70);
    g.lineStyle(2, PALETTE.gold, 1).strokeRect(-150, -34, 300, 70);
    banner.add(g);
    banner.add(title(this, 0, -24, `레벨 업!  Lv.${level}`, 23, INK.gold).setOrigin(0.5, 0));
    banner.add(text(this, 0, 10, '체력·마나 모두 회복', 12, INK.gate, true).setOrigin(0.5, 0));
    banner.setScale(0.6);
    this.tweens.add({ targets: banner, scale: 1, duration: 160, ease: 'Back.Out' });
    this.tweens.add({ targets: banner, y: cy - 30, alpha: 0, delay: 1200, duration: 500, onComplete: () => banner.destroy() });
  }

  private notice(n: Notice) {
    this.notices.push(n);
    if (!this.noticeUp) this.nextNotice();
  }

  /**
   * A card in the middle of the map, like the level-up banner but staying a little longer:
   * what was found or what the curse took. Tap to close it early.
   */
  private nextNotice() {
    const n = this.notices.shift();
    this.noticeUp = undefined;
    if (!n) return;
    const cx = GW / 2;
    const cy = PORTRAIT ? P_TOP_H + P_MAP_H * 0.5 : HUD_Y * 0.5;
    const w = Math.min(420, GW - 32);
    const box = this.ui(this.add.container(cx, cy).setDepth(45));
    const g = this.add.graphics();
    box.add(g);
    const iconW = n.icon ? 52 : 0;
    const left = -w / 2 + 18 + iconW;
    const items: Phaser.GameObjects.Text[] = [];
    const head = title(this, 0, 0, n.heading, 23, n.color).setOrigin(0.5, 0);
    let y = 0;
    const body: Phaser.GameObjects.Text[] = n.lines.map(([value, color, size]) => {
      const t = (size && size > 12 ? title(this, left, 0, value, size, color) : text(this, left, 0, value, 12, color))
        .setWordWrapWidth(w / 2 - left - 18, true);
      return t;
    });
    const bodyH = body.reduce((sum, t) => sum + t.height + 6, 0);
    const hgt = 18 + head.height + 12 + Math.max(bodyH, n.icon ? 48 : 0) + 12;
    const top = -hgt / 2;
    head.y = top + 16;
    y = head.y + head.height + 12;
    const bodyTop = y;
    for (const t of body) {
      t.y = y;
      y += t.height + 6;
    }
    const edge = Phaser.Display.Color.HexStringToColor(n.color).color;
    g.fillStyle(PALETTE.shadow, 0.94).fillRect(-w / 2, top, w, hgt);
    g.lineStyle(2, edge, 1).strokeRect(-w / 2, top, w, hgt);
    g.fillStyle(edge, 1).fillRect(-w / 2, top, w, 4);
    if (n.icon) n.icon(g, -w / 2 + 18, bodyTop);
    box.add([head, ...body, ...items]);
    g.setInteractive(new Phaser.Geom.Rectangle(-w / 2, top, w, hgt), Phaser.Geom.Rectangle.Contains);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      this.tweens.add({ targets: box, alpha: 0, duration: 200, onComplete: () => { box.destroy(); this.nextNotice(); } });
    };
    g.on('pointerup', close);
    box.setScale(0.7);
    this.tweens.add({ targets: box, scale: 1, duration: 160, ease: 'Back.Out' });
    this.time.delayedCall(n.ms ?? 2400, close);
    this.noticeUp = box;
  }

  /**
   * Corner of the map: turns until the abyss stalker comes for a hunter who lingers.
   * Under the minimap in portrait, top right of the map in landscape.
   */
  private drawStalkerClock() {
    const run = this.run;
    const r = this.minimapRect();
    const x = r ? r.x + r.w : GW - 10;
    const y = r ? r.y + r.h + 4 : 8;
    const left = run.stalkerIn;
    const label = `${run.stalkers + 1}차 던전 붕괴까지 ${left}턴`;
    const color = run.stalkers > 0 || left <= 30 ? '#e0574f' : INK.quiet;
    const t = this.ui(text(this, x, y, label, 12, color).setOrigin(1, 0).setDepth(30));
    t.setBackgroundColor('#000000aa').setPadding(4, 2, 4, 2);
    this.dynamic.push(t);
  }

  /** Health / mana / guard potion counts. */
  private bagLine() {
    const b = this.run.hunter.bag;
    return `${b.hp}/${b.mp}/${b.guard}`;
  }

  /** Bag: worn gear, and potions to drink (each use takes a turn). */
  private showBag() {
    if (this.overlay.length || this.run.status !== 'playing') return;
    this.joyClear();
    const h = this.run.hunter;
    const keys: Record<string, string> = { hp: 'E', mp: 'R', guard: 'F', escape: 'X' };
    const o = this.overlay;
    const push = <T extends Phaser.GameObjects.GameObject>(obj: T) => {
      o.push(this.ui(obj));
      return obj;
    };
    const shade = push(this.add.graphics());
    shade.fillStyle(0x000000, 0.7).fillRect(0, 0, GW, GH);
    shade.setInteractive(new Phaser.Geom.Rectangle(0, 0, GW, GH), Phaser.Geom.Rectangle.Contains);
    const w = Math.min(540, GW - 20);
    const btnH = 46;
    const hgt = 58 + DOLL_H + 24 + (CONSUMABLE_KINDS.length + 1) * (btnH + 8) + 10;
    const x = (GW - w) / 2;
    const y = Math.max(4, (GH - hgt) / 2);
    push(panel(this, x, y, w, hgt));
    push(title(this, GW / 2, y + 16, '가방', 20, INK.text).setOrigin(0.5, 0));
    drawPaperDoll(this, x + 14, y + 52, w - 28, h).forEach((d) => push(d));
    let by = y + 52 + DOLL_H + 10;
    push(text(this, GW / 2, by, '물약을 마시면 한 턴이 지나갑니다.', 12, INK.faint).setOrigin(0.5, 0));
    by += 22;
    const pad = PORTRAIT ? 14 : 40;
    CONSUMABLE_KINDS.forEach((kind) => {
      const label = `${CONSUMABLES[kind].name} ${h.bag[kind]}개 · ${CONSUMABLES[kind].describe}` + (PORTRAIT ? '' : ` (${keys[kind]})`);
      push(button(this, x + pad, by, w - pad * 2, btnH, label, () => {
        this.closeOverlay();
        this.perform({ type: 'use', item: kind });
      }, { enabled: h.bag[kind] > 0 }));
      by += btnH + 8;
    });
    push(button(this, x + pad, by, w - pad * 2, btnH, '닫기', () => {
      this.closeOverlay();
      this.redraw();
    }, { primary: true }));
  }

  private closeOverlay() {
    this.overlay.forEach((o) => o.destroy());
    this.overlay = [];
  }

  private dialog(heading: string, lines: string[], buttons: Array<[string, () => void, boolean?, boolean?]>, headingColor: string = INK.text) {
    const o = this.overlay;
    const push = <T extends Phaser.GameObjects.GameObject>(obj: T) => {
      o.push(this.ui(obj));
      return obj;
    };
    const shade = push(this.add.graphics());
    shade.fillStyle(0x000000, 0.7);
    shade.fillRect(0, 0, GW, GH);
    shade.setInteractive(new Phaser.Geom.Rectangle(0, 0, GW, GH), Phaser.Geom.Rectangle.Contains);
    const w = Math.min(520, GW - 24);
    const cx = GW / 2;
    const pad = PORTRAIT ? 20 : 40;
    // Lay the lines out first (wrapped to the panel) so the panel can fit them.
    const texts = lines.map((l) => push(text(this, cx, 0, l, 12, INK.quiet).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(w - 32, true)));
    const linesH = texts.reduce((sum, t) => sum + t.height + 7, 0);
    const hgt = 100 + linesH + buttons.length * 58;
    const x = (GW - w) / 2;
    const y = (GH - hgt) / 2;
    o.unshift(this.ui(panel(this, x, y, w, hgt)));
    this.children.bringToTop(shade);
    o.forEach((obj) => obj !== shade && this.children.bringToTop(obj));
    const head = push(title(this, cx, y + 24, heading, PORTRAIT ? 20 : 23, headingColor).setOrigin(0.5, 0));
    head.setWordWrapWidth(w - 24, true);
    let ly = y + 66;
    texts.forEach((t) => {
      t.y = ly;
      ly += t.height + 7;
    });
    buttons.forEach(([label, fn, primary, enabled], i) => {
      push(button(this, x + pad, ly + 16 + i * 58, w - pad * 2, 48, label, fn, { primary: !!primary, size: 12, enabled: enabled ?? true }));
    });
  }

  /**
   * Right after the gate master falls (and again from the stairs): leave with the reward,
   * or stay to finish the floor. The reward can be taken later from the stairs.
   */
  private showGateClear() {
    const run = this.run;
    this.clearPending = false;
    if (!run.gate) return;
    this.joyClear();
    this.dialog('게이트 클리어!', [
      `${gateName(run.gate)}의 주인을 쓰러뜨렸다. 이번 수입 ${run.runGold}G`,
      `클리어 보상 ${gateClearGold(run.gate)}G${run.gate.rival ? '(가로채기 +30%)' : ''}와 장비 하나를 챙겨서 나간다.`,
      '남아도 보상은 사라지지 않는다. 나중에 계단에서 나갈 수 있다.',
    ], [
      ['보상 받고 귀환하기', () => { this.closeOverlay(); run.clearGate(); this.finishReturn(true); }, true],
      ['남아서 더 둘러보기', () => { this.closeOverlay(); run.stay(); this.redraw(); }],
    ], INK.gold);
  }

  private showStairs() {
    const run = this.run;
    const h = run.hunter;
    if (run.gateCleared) return this.showGateClear();
    const lines = [
      `${run.placeName} 돌파! 이번 수입 ${run.runGold}G (+돌파 보상 ${10 * run.danger}G)`,
      `체력 ${h.hp}/${h.maxHp} · 마나 ${h.mp}/${h.maxMp} · 물약 ${this.bagLine()}`,
      '죽으면 이번 수입은 모두 잃습니다.',
    ];
    const buttons: Array<[string, () => void, boolean?]> = [];
    if (run.gate) lines.push('지금 나가면 이 게이트는 닫힙니다.');
    if (!run.isTopFloor) {
      buttons.push([run.gate ? `더 들어가기 (${run.floor + 1}층)` : `더 올라가기 (${run.floor + 1}층)`, () => { this.closeOverlay(); run.climb(); this.redraw(); }, true]);
    } else {
      lines.push('지금 갈 수 있는 탑의 꼭대기입니다.');
    }
    buttons.push(['귀환하기', () => { this.closeOverlay(); run.retreat(); this.finishReturn(); }]);
    buttons.push(['이 층을 더 둘러보기', () => { this.closeOverlay(); run.stay(); this.redraw(); }]);
    this.dialog('계단에 도착했다', lines, buttons);
  }

  private showChoice() {
    const run = this.run;
    const c = run.pendingChoice!;
    const tag = c.hunter.origin === 'rival' ? '라이벌' : '옛 동료';
    const pick = (i: number) => () => {
      this.closeOverlay();
      run.resolveChoice(i);
      this.redraw();
    };
    this.dialog(
      `[${tag}] ${c.hunter.name}을(를) 쓰러뜨렸다`,
      [`${state.rival.name} 소속 · Lv.${c.hunter.level}`, '보상을 받고 보내주면 더 강해져서 다시 나타난다.', '완전히 쓰러뜨리면 다시는 만나지 않는다.'],
      [
        [`${REWARDS[c.rewards[0]].label}: ${REWARDS[c.rewards[0]].describe(c.hunter.level)}`, pick(0), true],
        [`${REWARDS[c.rewards[1]].label}: ${REWARDS[c.rewards[1]].describe(c.hunter.level)}`, pick(1), true],
        [`완전한 사망: 경험치 +${c.finishExp}`, pick(2)],
      ],
      '#d79bff',
    );
  }

  private newsLines(n: AfterRunNews): string[] {
    const msgs: string[] = [];
    for (const name of n.finished) msgs.push(`${name}은(는) 명예의 전당에 이름만 남겼다.`);
    for (const name of n.grewStronger) msgs.push(`${name}은(는) ${state.rival.name}에서 더 강해졌다.`);
    if (n.rivalCreated) msgs.push(`S급 승급 소식에 ${state.rival.name}이(가) 라이벌 ${n.rivalCreated.name}을(를) 내세웠다!`);
    msgs.push(...n.gateNews);
    return msgs;
  }

  private finishReturn(cleared = false) {
    const run = this.run;
    const r = settleReturn(state, rng, run.runGold, run.encounters, cleared);
    const stolen = cleared && run.gate?.rival ? ` ${run.gate.rival.agency}보다 먼저 해냈다!` : '';
    const where = run.gate ? (cleared ? `${gateName(run.gate)} 클리어!${stolen}` : `${run.placeName}에서 귀환.`) : `${run.floor}층에서 귀환.`;
    const msgs = [
      `${where} 수입 ${r.earned}G 중 ${r.tribute}G(${Math.round(r.rate * 100)}%) 상납.`,
    ];
    if (r.promotedTo) {
      msgs.push(`등급 재심사: ${r.promotedFrom}급 → ${r.promotedTo}급! 재계약 지원금 ${r.signingSupport}G.`);
    }
    msgs.push('남은 물약은 모두 두고 왔다. 가방에는 체력 물약 1개만 챙겼다.');
    msgs.push(...this.newsLines(r));
    state.run = undefined;
    persist();
    this.scene.start('HQ', { messages: msgs });
  }

  private showDeath() {
    const run = this.run;
    const h = run.hunter;
    const score = hallOfFameScore(h);
    const grade = gradeIn(state, h);
    const killer = run.killer ?? '알 수 없는 적';
    const d = settleDeath(state, rng, killer, run.encounters);
    state.run = undefined;
    persist();
    const legend = h.everSSS;
    const fateLine = d.scouted
      ? `지나가던 ${state.rival.name}이(가) ${h.name}을(를) 구해 데려갔다...`
      : `${h.name}의 이름은 기록으로만 남는다.`;
    const msgs = [
      d.scouted ? `${h.name}은(는) ${state.rival.name}에 스카웃됐다. 언젠가 적으로 만날지도.` : `${h.name}의 기록이 남았다.`,
      ...(d.newGear?.length ? [`${state.rival.name}이(가) ${h.name}에게 새 장비를 맞춰 줬다: ${d.newGear.map((g) => g.name).join(', ')}.`] : []),
      ...this.newsLines(d),
    ];
    this.dialog(
      legend ? '그래, 너였구나.' : '넌 주인공이 아니었네...',
      [
        `${h.name} · ${grade}급 · Lv.${h.level}`,
        `${run.placeName}에서 ${killer}에게 쓰러졌다.`,
        `처치 ${h.kills}마리 · 최고 ${h.bestFloor}층 · 기록 점수 ${score}`,
        fateLine,
      ],
      [['본부로 돌아가기', () => this.scene.start('HQ', { messages: msgs }), true]],
      legend ? INK.gold : INK.red,
    );
  }
}

/** One pop-up: a heading, a few lines (text, color, size), an optional pixel icon. */
interface Notice {
  heading: string;
  color: string;
  lines: Array<[string, string, number?]>;
  icon?: (g: Phaser.GameObjects.Graphics, x: number, y: number) => void;
  ms?: number;
}

const POTION_COLORS: Record<ConsumableKind, number> = { hp: 0xc9403a, mp: 0x3d9fb3, guard: 0xe5ae46, escape: 0xe6dac0 };

/** A 40×44 pixel potion bottle, or a rolled scroll for the return scroll. */
function drawItemIcon(kind: ConsumableKind) {
  return (g: Phaser.GameObjects.Graphics, x: number, y: number) => {
    g.fillStyle(0x2a211a, 1).fillRect(x, y, 40, 44);
    if (kind === 'escape') {
      g.fillStyle(0xe6dac0, 1).fillRect(x + 8, y + 10, 24, 24);
      g.fillStyle(0xb9a98a, 1).fillRect(x + 6, y + 8, 28, 4).fillRect(x + 6, y + 32, 28, 4);
      g.fillStyle(0xc4562a, 1).fillRect(x + 12, y + 16, 16, 2).fillRect(x + 12, y + 22, 12, 2);
      return;
    }
    g.fillStyle(0x7a5a3a, 1).fillRect(x + 16, y + 6, 8, 5); // cork
    g.fillStyle(0xcfcfcf, 1).fillRect(x + 15, y + 11, 10, 6); // neck
    g.fillStyle(0xcfcfcf, 1).fillRect(x + 9, y + 17, 22, 22); // glass
    g.fillStyle(POTION_COLORS[kind], 1).fillRect(x + 11, y + 23, 18, 14); // liquid
    g.fillStyle(0xffffff, 0.7).fillRect(x + 12, y + 19, 3, 6); // shine
  };
}

function gearNotice(gear: Gear, equipped: boolean, old?: Gear): Notice {
  const color = tierColor(gear.tier);
  const slot = `${GEAR_SLOT_NAMES[gear.slot]} · ${gear.tier}단계`;
  if (!equipped) {
    return {
      heading: '장비 발견',
      color: INK.quiet,
      icon: drawGearIcon(gear),
      lines: [
        [slot, INK.faint],
        [gear.name, color, 15],
        [describeGear(gear), INK.text],
        [old ? `지금 쓰는 ${old.name}이(가) 더 좋아서 두고 왔다.` : '쓸 일이 없어 두고 왔다.', INK.faint],
      ],
      ms: 1800,
    };
  }
  const lines: Notice['lines'] = [[slot, INK.faint], [gear.name, color, 15], [describeGear(gear), INK.text]];
  const diff = gearDiff(gear, old);
  if (diff) lines.push([`능력치 변화  ${diff}`, INK.gate]);
  if (old) lines.push([`이전 장비 ${old.name}은(는) 버렸다.`, INK.faint]);
  return { heading: old ? '장비 업그레이드!' : '새 장비 장착!', color: INK.gold, icon: drawGearIcon(gear), lines };
}

function lootNotice(item: ConsumableKind, got: boolean, count: number): Notice {
  const c = CONSUMABLES[item];
  return {
    heading: got ? '아이템 획득!' : '가방이 가득 찼다',
    color: got ? INK.gold : INK.quiet,
    icon: drawItemIcon(item),
    lines: [
      [c.name, INK.text, 15],
      [c.describe, INK.gate],
      [got ? `가방 ${count}/${BAG_MAX}` : `가방 ${count}/${BAG_MAX} · 두고 왔다`, got ? INK.quiet : INK.red],
    ],
  };
}

const CURSE_NAMES: Record<CurseKind, string> = {
  drain: '흡혈의 저주',
  mana: '마력 소멸의 저주',
  greed: '탐욕의 저주',
  ambush: '매복의 저주',
};

function curseNotice(curse: CurseKind, detail: string): Notice {
  return {
    heading: `저주! ${CURSE_NAMES[curse]}`,
    color: INK.red,
    lines: [
      [detail, INK.red, 15],
      [CURSES[curse], INK.quiet],
    ],
    ms: 2800,
  };
}
