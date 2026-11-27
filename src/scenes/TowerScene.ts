import * as Phaser from 'phaser';
import { hasCrawl, preloadCrawl } from '../game/crawl';
import { ART } from '../game/art';
import { activeHunter, AfterRunNews, agencyOf, enterGate, gradeIn, PREPS, rivalAgencyNames, rivalHunters, settleDaily, settleDeath, settleDuel, settleReturn, storeSpare } from '../core/agency';
import { DAILY_RULES, DailyRun, dateLabel } from '../core/daily';
import { CODEX_IDS, recordKills } from '../core/codex';
import { questReward, questText } from '../core/quests';
import { gateClearGold, gateName } from '../core/gates';
import { MAP_H, mapHeight, mapWidth, TALL_MAP_H, TALL_MAP_W, Tile } from '../core/dungeon';
import { hallOfFameScore } from '../core/hunter';
import { bagMax, CONSUMABLE_KINDS, CONSUMABLES, ConsumableKind, CurseKind, CURSES, describeGear, Gear, gearLabel, GEAR_SLOT_NAMES, offerLabel } from '../core/items';
import { DOLL_H, drawGearIcon, drawPaperDoll, gearDiff, tierColor } from '../game/paperdoll';
import { lookOf, lookTexture } from '../game/looks';
import { moveControl } from '../game/controls';
import { CLASSES } from '../core/classes';
import { hasMonsterArt, monsterTexture } from '../game/monsterArt';
import { footShadow } from '../game/pixel';
import { paintConsumable } from '../game/icons';
import { chestTexture, merchantTexture, TileFrame, tileset } from '../game/tiles';
import { sfx, toggleSound } from '../game/sfx';
import { ABILITIES, abilitiesOf, abyssDepth, MONSTERS, recommendedLevel, TOP_FLOOR, TRAITS, elementNote } from '../core/monsters';
import { levelUpMessage, unlocked } from '../core/agencyLevel';
import { Action, Duel, REWARDS, RunEvent, Survival, TowerRun, waveReward } from '../core/run';
import { cardText, cardTitle, chooseCard, pendingCards, skillCost, skillLabel, SKILLS, slotCount } from '../core/classes';
import { persist, rng, state } from '../game/store';
import { fitCamera, GH, GW, pointerAt, PORTRAIT, RES } from '../game/layout';
import { bar, button, FONT, INK, PALETTE, panel, text, title } from '../game/ui';
import { L } from '../core/lang';
import { GuidePage, showGuide, tipWanted, markTip } from '../game/guide';
import { TIPS } from '../game/tips';
import { ABYSS_GOLD_PER_RULE, ABYSS_RULE_EVERY, rulesLine } from '../core/abyss';

/** World units per map tile: the sprites' own size (32 for the crawl set), so they are drawn pixel for pixel. */
const TILE = ART === 'crawl' ? 32 : 24;
/** The camera zooms are tuned for 24-unit tiles; crawl tiles come out a little bigger, to show their detail. */
const TILE_FIT = ART === 'crawl' ? 0.85 : 1;
/** Tint for tiles and props the hunter remembers but cannot see right now. */
const REMEMBERED = 0x4a4038;
const HUD_Y = MAP_H * 24; // 600

// Portrait layout: status bar on top, a camera that follows the hunter, the log,
// then a thumb area with the joystick on the left and action buttons on the right.
const P_TOP_H = 84;
const P_LOG_H = 60;
const P_CTL_H = 210;
const P_MAP_H = GH - P_TOP_H - P_LOG_H - P_CTL_H;
const P_LOG_Y = P_TOP_H + P_MAP_H;
const P_CTL_Y = P_LOG_Y + P_LOG_H;
const P_BTN_X = GW - 252; // action buttons start here
const P_ZOOM = 1.7;
/** Landscape: the map camera follows the hunter at this zoom, above the bottom HUD. */
const L_ZOOM = 1.5;
const JOY_RADIUS = 44;
const JOY_DEADZONE = 14;
const JOY_REPEAT_MS = 170;
/** How long held walking pauses when a new enemy comes into view, before it carries on. */
const JOY_SIGHT_PAUSE_MS = 600;

/** One trip up the Tower of Growth. Draws the TowerRun and turns input into actions. */
export class TowerScene extends Phaser.Scene {
  private run!: TowerRun;
  private mapLayer!: Phaser.GameObjects.Graphics;
  private tileLayer!: Phaser.GameObjects.Blitter;
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private joy: {
    id: number;
    ox: number;
    oy: number;
    dir: { dx: number; dy: number } | null;
    used: boolean;
    /** Held on a cross button rather than a floating stick. */
    fixed?: boolean;
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
  /** A brand-new agency's first climb: Officer Yoon explains each step. */
  private tutorial = false;
  private killsAtStart = 0;
  /** Officer Yoon is talking: the game waits. */
  private guiding = false;
  /** Gate picked at the agency, if this trip goes into a gate. */
  private gateId?: number;
  /** Ranker challenge set up at the agency, if this trip is a duel. */
  private duel?: Duel;
  /** Survival arena set up at the agency, if this trip is one. */
  private survival?: Survival;
  /** Today's rift set up at the agency, if this trip is one. */
  private daily?: DailyRun;

  init(data: { startFloor?: number; gateId?: number; duel?: Duel; survival?: Survival; daily?: DailyRun }) {
    this.startFloor = data?.startFloor ?? 1;
    this.gateId = data?.gateId;
    this.duel = data?.duel;
    this.survival = data?.survival;
    this.daily = data?.daily;
  }

  preload() {
    preloadCrawl(this);
  }

  create() {
    this.cameras.main.setBackgroundColor(PALETTE.bg);
    this.joy = null;
    this.metKinds = new Set();
    this.notices = [];
    this.noticeUp = undefined;
    this.clearPending = false;
    this.codexDone = false;
    this.guiding = false;
    this.tutorial = (state.day ?? 0) === 0 && !this.gateId && !this.duel && !this.survival && !this.daily && !state.run?.data.gate && !state.run?.data.survival && !state.run?.data.daily;
    this.run = this.resumeOrStart();
    this.killsAtStart = this.run.hunter.kills;
    this.overlay = [];
    this.dynamic = [];
    this.uiCam = null;
    if (PORTRAIT) {
      fitCamera(this.cameras.main, 0, P_TOP_H, GW, P_MAP_H, P_ZOOM * TILE_FIT);
      this.uiCam = fitCamera(this.cameras.add(0, 0, GW, GH));
    } else {
      fitCamera(this.cameras.main, 0, 0, GW, HUD_Y, L_ZOOM * TILE_FIT);
      this.uiCam = fitCamera(this.cameras.add(0, 0, GW, GH));
    }
    this.tileLayer = this.world(this.add.blitter(0, 0, tileset(this)));
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
      z: { type: 'attack' },
    };
    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
      if (ev.key.toLowerCase() === 'b') return this.showBag();
      if (ev.key.toLowerCase() === 'm') {
        this.run.log.push(toggleSound() ? L('소리를 켰다.', 'Sound on.') : L('소리를 껐다.', 'Sound off.'));
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

  /** Shows one of Officer Yoon's tips if one fits this moment. True if it did. */
  private maybeTip(): boolean {
    const run = this.run;
    if (run.status !== 'playing' && run.status !== 'onStairs') return false;
    const h = run.hunter;
    const seen = run.monsters.filter((m) => run.canSee(m));
    const tip = (id: keyof typeof TIPS, pages: GuidePage[]) => {
      if (!tipWanted(id)) return false;
      markTip(id);
      this.joyClear();
      this.guiding = true;
      showGuide(this, pages, {
        place: (o) => this.ui(o),
        onClose: () => {
          this.guiding = false;
          this.redraw();
        },
      });
      return true;
    };
    if (run.duel) return tip('duel', TIPS.duel());
    if (run.survival) return tip('arena', TIPS.arena());
    if (run.daily && tip('daily', TIPS.daily())) return true;
    if (this.tutorial) {
      const touch = this.sys.game.device.input.touch;
      const dpad = moveControl() === 'dpad';
      const spot = dpad ? this.dpadSpot() : undefined;
      const area = !PORTRAIT ? undefined
        : spot ? { x: spot.cx - spot.size * 1.5, y: spot.cy - spot.size * 1.5, w: spot.size * 3, h: spot.size * 3 }
        : { x: 4, y: P_CTL_Y, w: P_BTN_X - 12, h: GH - P_CTL_Y - 4 };
      if (tip('tw-move', TIPS['tw-move'](dpad, touch, area))) return true;
      if (run.status === 'onStairs' && tip('tw-stairs', TIPS['tw-stairs']())) return true;
      if (seen.some((m) => !m.hunter && !m.kind.stalker) && tip('tw-attack', TIPS['tw-attack'](h.cls === 'archer'))) return true;
      const first = h.skills[0];
      if (first && h.kills > this.killsAtStart && !seen.length && tip('tw-skill', TIPS['tw-skill'](`${PORTRAIT ? '' : '1 '}${SKILLS[first.id].name}`))) return true;
      if (h.hp < h.maxHp * 0.6 && h.bag.hp > 0 && tip('tw-potion', TIPS['tw-potion']())) return true;
    }
    if (h.picks > 0 && tip('card', TIPS.card())) return true;
    if (seen.some((m) => m.windup) && run.dangerTiles().length && tip('telegraph', TIPS.telegraph())) return true;
    if (seen.some((m) => m.kind.boss) && tip('boss', TIPS.boss())) return true;
    if (seen.some((m) => m.kind.elite) && tip('elite', TIPS.elite())) return true;
    if (seen.some((m) => m.hunter) && tip('former', TIPS.former())) return true;
    const mer = run.merchant;
    if (mer && run.isVisible(mer.x, mer.y) && tip('merchant', TIPS.merchant())) return true;
    if (run.chests.some((c) => run.isVisible(c.x, c.y)) && tip('chest', TIPS.chest())) return true;
    if (!run.gate && run.stalkerIn <= 40 && tip('collapse', TIPS.collapse())) return true;
    return false;
  }

  /** Tap the minimap to make it larger or smaller again. */
  private bigMinimap = false;

  /** Where the minimap sits: top right corner of the map view, upright layout only. */
  private minimapRect() {
    if (!this.run) return undefined;
    const px = this.bigMinimap ? 6 : 3;
    const w = mapWidth(this.run.map) * px + 8;
    const h = mapHeight(this.run.map) * px + 8;
    return { x: GW - w - 8, y: PORTRAIT ? P_TOP_H + 8 : 8, w, h, px };
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
  private joyArea(p: { x: number; y: number }) {
    // Fixed cross buttons: touching the map does nothing.
    if (moveControl() === 'dpad') return false;
    if (!PORTRAIT) return p.y < HUD_Y;
    if (p.y >= P_TOP_H && p.y < P_LOG_Y) return true;
    return p.y >= P_CTL_Y && p.x < P_BTN_X - 6;
  }

  private joyStart(pointer: Phaser.Input.Pointer) {
    const p = { id: pointer.id, ...pointerAt(pointer) };
    if (this.overlay.length || this.joy || this.guiding) return;
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

  private joyMove(pointer: Phaser.Input.Pointer) {
    const p = { id: pointer.id, ...pointerAt(pointer) };
    const joy = this.joy;
    if (!joy || p.id !== joy.id || joy.fixed) return;
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
    // A plain tap without dragging does nothing: only the joystick or the cross buttons move the hunter.
    this.joyClear();
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
      const el = elementNote(m.kind);
      if (trait) this.run.log.push(`[${trait.name}] ${m.kind.name}: ${trait.text}${el ? ` (${el})` : ''}`);
      else if (el) this.run.log.push(`${m.kind.name}: ${el}`);
      for (const a of abilitiesOf(m.kind)) if (a !== 'fuse') this.run.log.push(`  · ${ABILITIES[a].name}: ${ABILITIES[a].text}`);
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

  /** Where the cross buttons sit: the thumb area (upright), or over the map's bottom left on a wide touch screen. */
  private dpadSpot(): { cx: number; cy: number; size: number } | undefined {
    if (moveControl() !== 'dpad') return undefined;
    if (PORTRAIT) return { cx: P_BTN_X / 2, cy: P_CTL_Y + 100, size: 50 };
    if (!this.sys.game.device.input.touch) return undefined;
    return { cx: 96, cy: HUD_Y - 96, size: 46 };
  }

  /** Four fixed buttons in a cross. Hold one to keep walking that way. */
  private drawDpad(): Phaser.GameObjects.GameObject[] {
    const d = this.dpadSpot();
    if (!d) return [];
    const { cx, cy, size: s } = d;
    const gap = 4;
    const g = this.add.graphics().setDepth(PORTRAIT ? 0 : 20);
    const alpha = PORTRAIT ? 1 : 0.55;
    const out: Phaser.GameObjects.GameObject[] = [g];
    g.fillStyle(PALETTE.dim, alpha * 0.6).fillRect(cx - s / 2, cy - s / 2, s, s);
    const dirs: Array<[number, number]> = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (const [dx, dy] of dirs) {
      const bx = cx + dx * (s + gap) - s / 2;
      const by = cy + dy * (s + gap) - s / 2;
      g.fillStyle(0x1f1915, alpha).fillRect(bx, by + 4, s, s - 4);
      g.fillStyle(0x3a2f27, alpha).fillRect(bx, by, s, s - 4);
      g.fillStyle(0xffffff, 0.1 * alpha).fillRect(bx + 2, by + 2, s - 4, 2);
      // Arrow
      const ax = bx + s / 2;
      const ay = by + (s - 4) / 2;
      const a = s * 0.22;
      g.fillStyle(0xe8d5b0, 0.9 * alpha).fillTriangle(
        ax + dx * a, ay + dy * a,
        ax - dx * a * 0.6 + dy * a, ay - dy * a * 0.6 + dx * a,
        ax - dx * a * 0.6 - dy * a, ay - dy * a * 0.6 - dx * a,
      );
      const zone = this.add.zone(bx + s / 2, by + s / 2, s + gap, s + gap).setInteractive();
      zone.on('pointerdown', (p: Phaser.Input.Pointer) => this.dpadPress(p, dx, dy));
      out.push(zone);
    }
    return out;
  }

  private dpadPress(p: Phaser.Input.Pointer, dx: number, dy: number) {
    if (this.overlay.length) return;
    this.joyClear();
    const gfx = this.ui(this.add.graphics());
    const at = pointerAt(p);
    this.joy = { id: p.id, ox: at.x, oy: at.y, dir: { dx, dy }, used: true, fixed: true, pauseUntil: 0, gfx, timer: null };
    this.joyStep();
    if (this.joy && !this.joy.timer) {
      this.joy.timer = this.time.addEvent({ delay: JOY_REPEAT_MS, loop: true, callback: () => this.joyStep() });
    }
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
      rivals: rivalHunters(state),
      rivalAgency: state.rival.name,
      rivalAgencies: rivalAgencyNames(state),
      mapSize: PORTRAIT ? { w: TALL_MAP_W, h: TALL_MAP_H } : undefined,
      keepSpare: unlocked(state.agent, 'stash'),
    };
    const saved = state.run;
    if (saved) {
      const slot = state.slots.findIndex((h) => h?.id === saved.hunterId);
      const run = slot >= 0 ? TowerRun.restore(saved.data, state.slots[slot]!, rng, options) : undefined;
      if (run) {
        state.activeSlot = slot;
        run.log.push(L('— 저장된 곳에서 이어서 진행 —', '— Resumed from your save —'));
        // A tall floor saved on an upright phone doesn't fit the wide screen: lay this floor out again.
        if (!PORTRAIT && mapHeight(run.map) > MAP_H) run.enterFloor(run.floor);
        return run;
      }
      state.run = undefined;
    }
    const gate = this.gateId !== undefined ? enterGate(state, this.gateId) : undefined;
    const hunter = activeHunter(state)!;
    // The very first climb of a new agency starts on an easy floor.
    const easyFirst = this.tutorial && hunter.bestFloor === 0 && this.startFloor === 1;
    const run = new TowerRun(hunter, rng, { ...options, startFloor: this.startFloor, gate, duel: this.duel, survival: this.survival, daily: this.daily, easyFirst, prep: hunter.prep });
    if (hunter.prep) run.log.push(L(`출정 준비: ${PREPS[hunter.prep].name} (${PREPS[hunter.prep].describe})`, `Prep: ${PREPS[hunter.prep].name} (${PREPS[hunter.prep].describe})`));
    if (this.startFloor > 1 && !this.duel && !this.survival && !this.daily) {
      run.log.push(this.startFloor > TOP_FLOOR ? L(`이미 돌파한 심연 ${this.startFloor - TOP_FLOOR - 1}층까지 건너뛰었다.`, `Skipped ahead past Abyss ${this.startFloor - TOP_FLOOR - 1}F, already cleared.`) : L(`이미 돌파한 ${this.startFloor - 1}층까지 건너뛰었다.`, `Skipped ahead past ${this.startFloor - 1}F, already cleared.`));
    }
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
    if (this.overlay.length || this.guiding) return;
    this.run.act(action);
    this.redraw();
    // Kinds seen while walking with keys or taps don't stop the joystick later.
    if (!this.joy) this.noteNewKinds();
  }

  private clearDynamic() {
    this.tweens.killTweensOf(this.dynamic);
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
    this.tileLayer.clear();
    this.clearDynamic();

    const mw = mapWidth(run.map);
    const mh = mapHeight(run.map);
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        if (!run.seen[y][x]) continue;
        const tile = run.map.tiles[y][x];
        if (tile === Tile.Wall && !this.touchesFloor(x, y)) continue;
        this.drawTile(x, y, tile, run.isVisible(x, y));
      }
    }
    // Red tiles: where wound-up moves will land. Brighter for the ones that go off next turn.
    const danger = this.keep(this.add.graphics());
    for (const d of run.dangerTiles()) {
      if (!run.seen[d.y]?.[d.x]) continue;
      danger.fillStyle(0xff3020, d.turns <= 1 ? 0.38 : 0.2);
      danger.fillRect(d.x * TILE + 1, d.y * TILE + 1, TILE - 2, TILE - 2);
      danger.lineStyle(1, 0xff6a50, d.turns <= 1 ? 0.9 : 0.5);
      danger.strokeRect(d.x * TILE + 1.5, d.y * TILE + 1.5, TILE - 3, TILE - 3);
    }
    if (run.dangerTiles().length) {
      this.tweens.add({ targets: danger, alpha: 0.55, duration: 380, yoyo: true, repeat: -1 });
    }
    // Shadows under everything standing on the floor, drawn before the figures.
    const shadows = this.keep(this.add.graphics());
    for (const c of run.chests) if (run.seen[c.y][c.x]) this.drawChest(c.x, c.y, run.isVisible(c.x, c.y));

    const mer = run.merchant;
    if (mer && run.seen[mer.y][mer.x]) {
      const vis = run.isVisible(mer.x, mer.y);
      if (vis) footShadow(shadows, mer.x * TILE + TILE / 2, mer.y * TILE + TILE - 2, 18);
      const img = this.keep(this.add.image(mer.x * TILE + TILE / 2, mer.y * TILE + TILE + 1, merchantTexture(this)).setOrigin(0.5, 1));
      if (!vis) img.setTint(REMEMBERED);
    }

    for (const m of run.monsters) {
      if (!run.canSee(m)) continue;
      const color = m.hunter ? '#d79bff' : m.kind.boss ? INK.red : m.kind.elite ? INK.gold : m.kind.range ? (m.awake ? '#7fd6c9' : '#5f9c93') : m.awake ? INK.rust : '#c9a46a';
      footShadow(shadows, m.x * TILE + TILE / 2, m.y * TILE + TILE - 2, m.kind.boss || m.kind.stalker ? 26 : 18);
      if (m.hunter) this.keep(this.figure(m.x, m.y, lookOf(m.hunter), 0xd79bff));
      else if (m.kind.ranker) this.keep(this.figure(m.x, m.y, CLASSES[run.duel?.cls ?? 'sword'].look, 0xffd27a));
      else if (hasMonsterArt(m.kind.id)) {
        // Mid-bosses: the same creature, bigger and gold. Sleeping monsters are a little dim.
        const img = this.keep(this.add.image(m.x * TILE + TILE / 2, m.y * TILE + TILE + 1, monsterTexture(this, m.kind.id)).setOrigin(0.5, 1));
        if (m.kind.elite) img.setScale(1.3).setTint(0xffd27a);
        if (m.kind.boss) img.setScale(1.35);
        if (m.kind.stalker) img.setScale(1.45);
        if (!m.awake) img.setAlpha(0.75);
        if (m.kind.trait === 'bomb' && !hasCrawl(this, 'bomber')) img.setTint(0xff9a6a);
        if (m.shell) img.setTint(0x9a9a9a);
        if (m.stun) img.setTint(0x9fd8ff);
      } else this.keep(this.glyph(m.x, m.y, m.kind.glyph, color, m.kind.boss ? 24 : m.kind.elite ? 20 : 15));
      const hpRatio = m.hp / m.maxHp;
      if ((hpRatio < 1 || m.maxMp) && !m.kind.stalker) {
        const hb = this.keep(this.add.graphics());
        hb.fillStyle(0x000000, 1);
        hb.fillRect(m.x * TILE + 2, m.y * TILE + TILE - 4, TILE - 5, 3);
        hb.fillStyle(PALETTE.hp, 1);
        hb.fillRect(m.x * TILE + 2, m.y * TILE + TILE - 4, (TILE - 5) * hpRatio, 3);
        // Monsters with mana moves show a mana bar under the health bar.
        if (m.maxMp) {
          hb.fillStyle(0x000000, 1);
          hb.fillRect(m.x * TILE + 2, m.y * TILE + TILE - 1, TILE - 5, 3);
          hb.fillStyle(PALETTE.mp, 1);
          hb.fillRect(m.x * TILE + 2, m.y * TILE + TILE - 1, (TILE - 5) * ((m.mp ?? 0) / m.maxMp), 3);
        }
      }
      // A wind-up: "!" and the move's name over the monster; a fuse shows its count.
      if (m.windup) {
        const label = m.windup.id === 'fuse' ? `${m.windup.turns}` : '!';
        this.keep(this.add.text(m.x * TILE + TILE / 2, m.y * TILE - 2, label, {
          fontFamily: FONT, fontSize: '16px', color: '#ff5a3c', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5, 1).setResolution(RES).setDepth(20));
      } else if (m.shell) {
        this.keep(this.add.text(m.x * TILE + TILE / 2, m.y * TILE - 2, L('웅크림', 'Curled'), {
          fontFamily: FONT, fontSize: '10px', color: '#d8d0c0', stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5, 1).setResolution(RES).setDepth(20));
      }
    }
    footShadow(shadows, run.pos.x * TILE + TILE / 2, run.pos.y * TILE + TILE - 2, 18);
    this.keep(this.figure(run.pos.x, run.pos.y, lookOf(run.hunter)));
    // The map camera follows the hunter. Bounds follow the floor, since a run saved
    // in the other layout keeps its floor shape.
    this.cameras.main.setBounds(0, 0, mw * TILE, mh * TILE);
    this.cameras.main.centerOn(run.pos.x * TILE + TILE / 2, run.pos.y * TILE + TILE / 2);
    this.drawMinimap();
    this.drawStalkerClock();

    if (PORTRAIT) this.drawHudPortrait();
    else this.drawHud();
    if (run.hunter.level > this.shownLevel) this.showLevelUp(run.hunter.level);
    this.shownLevel = run.hunter.level;

    if (!this.overlay.length && !this.guiding && this.maybeTip()) {
      this.saveRun();
      return;
    }
    if (run.hunter.picks > 0 && run.status !== 'dead' && !this.overlay.length) this.showCards();
    if (this.clearPending && run.status === 'playing' && !this.overlay.length) this.showGateClear();
    if (run.status === 'onStairs' && !this.overlay.length) this.showStairs();
    if (run.status === 'dead' && !this.overlay.length) this.showDeath();
    this.saveRun();
    if (run.status === 'choosing' && !this.overlay.length) this.showChoice();
    if (run.status === 'trading' && !this.overlay.length) this.showMerchant();
    if (run.status === 'returned' && !this.overlay.length) {
      if (run.duel) this.showDuelEnd();
      else if (run.survival?.fell) this.showArenaFall();
      else if (run.daily?.fell) this.showDailyFall();
      else this.finishReturn();
    }
  }

  /**
   * Tiles from the shared tileset. Walls with floor below show their brick face, the rest
   * their dark top; floor next to a wall gets a soft shade. Remembered tiles are drawn dark.
   */
  private drawTile(x: number, y: number, tile: Tile, visible: boolean) {
    const px = x * TILE;
    const py = y * TILE;
    const tiles = this.run.map.tiles;
    const put = (frame: TileFrame, alpha = 1) => {
      const bob = this.tileLayer.create(px, py, frame);
      if (!visible) bob.tint = REMEMBERED;
      if (alpha < 1) bob.setAlpha(alpha);
    };
    if (tile === Tile.Wall) {
      const below = tiles[y + 1]?.[x];
      if (below !== undefined && below !== Tile.Wall) {
        put(y % 2 ? 'wallFront2' : 'wallFront');
        return;
      }
      put('wallTop');
      const open = (t: Tile | undefined) => t !== undefined && t !== Tile.Wall;
      // Where a wall top meets the floor above or beside it, a lit edge marks the room's border.
      if (open(tiles[y - 1]?.[x])) put('rimN');
      if (open(tiles[y]?.[x + 1])) put('rimE');
      if (open(tiles[y]?.[x - 1])) put('rimW');
      return;
    }
    const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
    if (tile === Tile.Stairs) put(this.run.bossAlive ? 'stairsShut' : 'stairsOpen');
    else put((['floor0', 'floor0', 'floor1', 'floor2', 'floor0', 'floor1', 'floor2', 'floor3'] as const)[hash & 7]);
    if (tiles[y - 1]?.[x] === Tile.Wall) put('shadowN');
    if (tiles[y]?.[x - 1] === Tile.Wall) put('shadowW', 0.7);
  }

  /** A wooden chest with a gold band, outlined like the sprites. Cursed ones look the same. */
  private drawChest(x: number, y: number, visible: boolean) {
    const img = this.keep(this.add.image(x * TILE + TILE / 2, y * TILE + TILE + 1, chestTexture(this)).setOrigin(0.5, 1));
    if (!visible) img.setTint(REMEMBERED);
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
    const img = this.add.image(x * TILE + TILE / 2, y * TILE + TILE + 1, lookTexture(this, look)).setOrigin(0.5, 1);
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
    const k = <T extends Phaser.GameObjects.GameObject>(o: T) => {
      this.dynamic.push(o);
      return this.ui(o);
    };
    const g = k(this.add.graphics());
    g.fillStyle(PALETTE.panel, 1).fillRect(0, HUD_Y, 960, 120);
    g.fillStyle(PALETTE.line, 1).fillRect(0, HUD_Y, 960, 2);
    g.fillStyle(PALETTE.shadow, 1).fillRect(0, HUD_Y + 2, 960, 2);
    const nameText = k(title(this, 16, HUD_Y + 12, h.name, 15, INK.text));
    k(text(this, 16 + nameText.width + 10, HUD_Y + 15, L(`${gradeIn(state, h)}급 · Lv.${h.level}`, `${gradeIn(state, h)}-Rank · Lv.${h.level}`), 12, INK.rust, true));
    k(text(this, 16, HUD_Y + 40, L(`체력`, `HP`), 12, INK.quiet));
    k(bar(this, 54, HUD_Y + 43, 150, 8, h.hp / h.maxHp, PALETTE.hp));
    k(text(this, 212, HUD_Y + 40, `${h.hp}/${h.maxHp}`, 12, INK.text));
    k(text(this, 16, HUD_Y + 60, L(`마나`, `MP`), 12, INK.quiet));
    k(bar(this, 54, HUD_Y + 63, 150, 8, h.mp / h.maxMp, PALETTE.mp));
    k(text(this, 212, HUD_Y + 60, `${h.mp}/${h.maxMp}`, 12, INK.text));
    const status = k(text(this, 16, HUD_Y + 88, L(`${run.duel ? run.placeShort : `${run.placeShort}(적정 Lv.${recommendedLevel(run.danger)})`} · 수입 ${run.runGold}G · 물약 ${this.bagLine()}`, `${run.duel ? run.placeShort : `${run.placeShort}(Lv.${recommendedLevel(run.danger)})`} · Income ${run.runGold}G · Pots ${this.bagLine()}`) + (h.rescues ? L(` · 지원 ${h.rescues}`, ` · Rescue ${h.rescues}`) : ''), 12, INK.gold));
    // Keep clear of the log beside it: drop what the bag button already shows.
    if (status.width > 258) status.setText(L(`${run.duel ? run.placeShort : `${run.placeShort}(적정 Lv.${recommendedLevel(run.danger)})`} · 수입 ${run.runGold}G`, `${run.duel ? run.placeShort : `${run.placeShort}(Lv.${recommendedLevel(run.danger)})`} · Income ${run.runGold}G`));

    const lg = k(this.add.graphics());
    lg.fillStyle(PALETTE.panelDark, 1).fillRect(284, HUD_Y + 12, 400, 96);
    run.log.slice(-4).forEach((line, i, arr) => {
      const t = k(text(this, 296, HUD_Y + 20 + i * 21, line, 12, i === arr.length - 1 ? INK.text : INK.faint));
      let v = line;
      while (t.width > 376 && v.length > 1) t.setText(`${(v = v.slice(0, -1))}…`);
    });

    this.skillButtons(700, HUD_Y + 12, 244, 46, true).forEach(k);
    this.drawDpad().forEach(k);
    k(button(this, 700, HUD_Y + 64, 76, 44, L(`공격 Z`, `Attack Z`), () => this.perform({ type: 'attack' }), { primary: true }));
    k(button(this, 784, HUD_Y + 64, 76, 44, L(`가방 B`, `Bag B`), () => this.showBag()));
    if (run.guardTurns > 0) k(text(this, 204, HUD_Y + 15, L(`무적 ${run.guardTurns}턴`, `Guard ${run.guardTurns}t`), 12, INK.gate, true));
    k(button(this, 868, HUD_Y + 64, 76, 44, L(`대기 Spc`, `Wait Spc`), () => this.perform({ type: 'wait' })));
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
    const gradeText = k(text(this, 14 + nameText.width + 8, 13, L(`${gradeIn(state, h)}급 · Lv.${h.level}`, `${gradeIn(state, h)}-Rank · Lv.${h.level}`), 12, INK.rust, true));
    // Long lines (gates, big earnings) lose the words the bag button already shows.
    const room = GW - 14 - (gradeText.x + gradeText.width + 10);
    const full = L(`${run.duel ? run.placeShort : `${run.placeShort}(적정 Lv.${recommendedLevel(run.danger)})`} · 수입 ${run.runGold}G · 물약 ${this.bagLine()}`, `${run.duel ? run.placeShort : `${run.placeShort}(Lv.${recommendedLevel(run.danger)})`} · Income ${run.runGold}G · Pots ${this.bagLine()}`) + (h.rescues ? L(` · 지원 ${h.rescues}`, ` · Rescue ${h.rescues}`) : '');
    const status = k(text(this, GW - 14, 13, full, 12, INK.gold).setOrigin(1, 0));
    if (status.width > room) status.setText(L(`${run.duel ? run.placeShort : `${run.placeShort}(적정 Lv.${recommendedLevel(run.danger)})`} · ${run.runGold}G`, `${run.duel ? run.placeShort : `${run.placeShort}(Lv.${recommendedLevel(run.danger)})`} · ${run.runGold}G`));
    k(text(this, 14, 38, L('체력', 'HP'), 12, INK.quiet));
    k(bar(this, 52, 41, 300, 8, h.hp / h.maxHp, PALETTE.hp));
    k(text(this, GW - 14, 38, `${h.hp}/${h.maxHp}`, 12, INK.text).setOrigin(1, 0));
    k(text(this, 14, 58, L('마나', 'MP'), 12, INK.quiet));
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
    if (moveControl() === 'dpad') {
      this.drawDpad().forEach(k);
    } else {
      g.lineStyle(2, PALETTE.line, 1).strokeCircle(cx, cy, 60);
      g.fillStyle(PALETTE.dim, 1).fillCircle(cx, cy, 20);
      k(text(this, cx, P_CTL_Y + 172, L('여기를 끌어서 이동', 'Drag here to move'), 12, INK.faint).setOrigin(0.5, 0));
    }
    const bw = GW - 14 - P_BTN_X;
    this.skillButtons(P_BTN_X, P_CTL_Y + 18, bw, 66, false).forEach(k);
    const tw = (bw - 12) / 3;
    const attack = h.cls === 'archer' ? L('공격\n(3칸)', 'Attack\n(3 tiles)') : L('공격\n(옆 칸)', 'Attack\n(adjacent)');
    k(button(this, P_BTN_X, P_CTL_Y + 94, tw, 52, attack, () => this.perform({ type: 'attack' }), { primary: true }));
    k(button(this, P_BTN_X + tw + 6, P_CTL_Y + 94, tw, 52, L(`가방\n물약 ${h.bag.hp + h.bag.mp + h.bag.guard}`, `Bag\nPots ${h.bag.hp + h.bag.mp + h.bag.guard}`), () => this.showBag()));
    if (run.guardTurns > 0) k(text(this, 14, P_TOP_H + 8, L(`무적 ${run.guardTurns}턴`, `Guard ${run.guardTurns}t`), 12, INK.gate, true));
    k(button(this, P_BTN_X + 2 * (tw + 6), P_CTL_Y + 94, tw, 52, L('대기\n(한 턴)', 'Wait\n(1 turn)'), () => this.perform({ type: 'wait' })));
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
        const label = i < open ? L('빈 칸\n레벨업 때', 'Empty\nLv up') : L(`Lv.${i === 1 ? 5 : 10}에\n열림`, `Opens\nLv.${i === 1 ? 5 : 10}`);
        return button(this, bx, y, bw, hgt, label, () => {}, { enabled: false });
      }
      const cost = skillCost(s);
      const key = keysShown ? `${i + 1} ` : '';
      const wait = this.run.cooldowns[s.id] ?? 0;
      const second = wait > 0 ? L(`대기 ${wait}턴`, `Ready in ${wait}`) : L(`${s.lv}단·마나${cost}`, `Lv${s.lv}·MP${cost}`);
      return button(this, bx, y, bw, hgt, `${key}${SKILLS[s.id].name}\n${second}`, () => this.perform({ type: 'skill', slot: i }), {
        enabled: h.mp >= cost && wait <= 0,
      });
    });
  }

  /** Effects the hunter has up right now, for the status line. */
  private buffLine(): string {
    const b = this.run.buffs;
    const parts: string[] = [];
    if (b.stance) parts.push(L(`반격 ${b.stance.turns}`, `Riposte ${b.stance.turns}`));
    if (b.rage) parts.push(L(`함성 ${b.rage.turns}`, `War cry ${b.rage.turns}`));
    if (b.shield) parts.push(L(`보호막 ${b.shield.turns}`, `Shield ${b.shield.turns}`));
    if (b.block) parts.push(L(`막기 ${b.block.charges}회`, `Block x${b.block.charges}`));
    if (b.defUp) parts.push(L(`방어+${b.defUp.amount} ${b.defUp.turns}`, `DEF+${b.defUp.amount} ${b.defUp.turns}`));
    if (b.sanctuary) parts.push(L(`성역 ${b.sanctuary.turns}`, `Sanctuary ${b.sanctuary.turns}`));
    if (this.run.traps.length) parts.push(L(`덫 ${this.run.traps.length}`, `Traps ${this.run.traps.length}`));
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
      if (msg) this.run.log.push(L(`카드 선택: ${msg}.`, `Card: ${msg}.`));
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
    const more = h.picks > 1 ? L(` · 남은 선택 ${h.picks}`, ` · ${h.picks} picks left`) : '';
    this.dialog(L(`Lv.${h.level} 카드 고르기`, `Lv.${h.level} Pick a card`), [L(`스킬 칸 ${h.skills.length}/${slotCount(h.level)}${more}`, `Skill slots ${h.skills.length}/${slotCount(h.level)}${more}`)], buttons, INK.gold);
  }

  private showReplace(card: number, pick: (i: number, replace?: number) => void) {
    const h = this.run.hunter;
    const buttons: Array<[string, () => void, boolean?, boolean?]> = h.skills.map((s, j) => [L(`${skillLabel(s)}단계 버리고 바꾸기`, `Replace ${skillLabel(s)}`), () => pick(card, j)]);
    buttons.push([L('다른 카드 고르기', 'Pick another card'), () => {
      this.closeOverlay();
      this.showCards();
    }, true]);
    this.dialog(L('어떤 스킬과 바꿀까?', 'Replace which skill?'), [L('버린 스킬의 강화는 사라진다.', 'Upgrades on the dropped skill are lost.')], buttons, INK.gold);
  }

  /** The wandering merchant's wares, paid from this run's earnings. */
  private showMerchant() {
    const run = this.run;
    const m = run.merchant;
    if (!m) return;
    this.joyClear();
    const buttons: Array<[string, () => void, boolean?, boolean?]> = m.offers.map((o, i) => [
      m.sold[i] ? L(`${offerLabel(o)} · 판매 완료`, `${offerLabel(o)} · Sold`) : `${offerLabel(o)} · ${o.price}G`,
      () => {
        run.buyOffer(i);
        this.closeOverlay();
        this.redraw();
      },
      false,
      !m.sold[i] && run.runGold >= o.price,
    ]);
    buttons.push([L('거래 끝내기 (상인이 떠남)', 'Done trading (merchant leaves)'), () => {
      run.leaveMerchant();
      this.closeOverlay();
      this.redraw();
    }, true]);
    this.dialog(L('떠돌이 상인', 'Wandering Merchant'), [L(`이번 수입 ${run.runGold}G로 살 수 있다.`, `Pay with this run's income: ${run.runGold}G.`), L('거래를 끝내면 상인은 떠난다.', 'The merchant leaves when you are done.')], buttons, INK.gold);
  }

  /** Floating numbers, flashes, shakes and sounds for what just happened. */
  private playEvents(events: RunEvent[]) {
    const cam = this.cameras.main;
    const at = this.run.pos;
    let hurt = 0;
    for (const e of events) {
      switch (e.type) {
        case 'element':
          this.floatText(e.x, e.y - 1, e.weak ? L('약점!', 'Weak!') : L('저항', 'Resist'), e.weak ? INK.gold : '#9a8f84');
          break;
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
          this.floatText(e.x, e.y, L('빗나감', 'Miss'), INK.faint);
          break;
        case 'dodge':
          this.floatText(at.x, at.y, L('회피', 'Dodge'), INK.gate);
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
          this.floatText(at.x, at.y, L('막음', 'Block'), INK.gate);
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
          this.notice(lootNotice(e.item, e.got, e.count, bagMax(this.run.hunter)));
          break;
        case 'stone':
          this.floatText(e.x, e.y, L(`마력석 +${e.amount}`, `Stone +${e.amount}`), '#b98cff');
          break;
        case 'gold':
          this.notice({ heading: L('보물상자', 'Chest'), color: INK.gold, lines: [[`+${e.amount}G`, INK.gold, 20]], ms: 1400 });
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
          this.floatText(at.x, at.y, L('긴급 지원!', 'Rescue!'), INK.gold);
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
          this.floatText(e.x, e.y, L('무효', 'Immune'), INK.faint);
          sfx.block();
          break;
        case 'stalker':
          cam.shake(500, 0.01);
          cam.flash(400, 90, 30, 140);
          sfx.curse();
          this.notice({
            heading: L(`${e.nth}차 던전 붕괴!`, `Dungeon collapse #${e.nth}!`),
            color: '#c98bff',
            lines: [
              [e.nth > 1 ? L('더 강한 심연의 추적자가 나타났다.', 'A stronger Abyss Stalker appeared.') : L('심연의 추적자가 나타났다.', 'An Abyss Stalker appeared.'), INK.text],
              [L('쓰러뜨릴 수 없는 적이 당신을 찾아 나섰다.', 'An enemy that cannot be killed is hunting you.'), INK.quiet],
              [L('계단을 찾아 이 층을 떠나라!', 'Find the stairs and leave this floor!'), INK.red, 15],
            ],
            ms: 3200,
          });
          break;
        case 'wave':
          if (!e.cleared && e.wave > 1) {
            sfx.curse();
            this.notice({ heading: L(`${e.wave}웨이브`, `Wave ${e.wave}`), color: INK.red, lines: [[L(`적 ${this.run.monsters.length}마리`, `${this.run.monsters.length} foes`), INK.text, 15]], ms: 1400 });
          } else if (e.cleared) {
            cam.flash(250, 229, 174, 70);
            sfx.levelup();
          }
          break;
        case 'warn':
          if (this.run.isVisible(e.x, e.y)) {
            this.floatText(e.x, e.y - 1, e.name, '#ff7a5a');
            sfx.warn();
          }
          break;
        case 'interrupt':
          this.floatText(e.x, e.y - 1, L('끊음!', 'Broken!'), '#8fd3ff');
          this.burst(e.x, e.y, false);
          sfx.interrupt();
          break;
        case 'blast':
          for (const t of e.tiles) if (this.run.isVisible(t.x, t.y)) this.blastFlash(t.x, t.y);
          cam.shake(140, 0.005);
          sfx.blast();
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

  /** An orange blink over a tile a wound-up move just hit. */
  private blastFlash(x: number, y: number) {
    const r = this.world(this.add.rectangle(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE, TILE, 0xff7a30, 0.6).setDepth(25));
    this.tweens.add({ targets: r, alpha: 0, duration: 260, onComplete: () => r.destroy() });
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
    banner.add(title(this, 0, -24, L(`레벨 업!  Lv.${level}`, `Level up!  Lv.${level}`), 23, INK.gold).setOrigin(0.5, 0));
    banner.add(text(this, 0, 10, L('체력·마나 모두 회복', 'HP and MP restored'), 12, INK.gate, true).setOrigin(0.5, 0));
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
    if (this.run.survival) return this.drawWaveCount();
    if (this.run.duel) return;
    if (this.run.daily) this.drawDailyScore();
    const run = this.run;
    const r = this.minimapRect();
    const x = r ? r.x + r.w : GW - 10;
    const y = r ? r.y + r.h + 4 : 8;
    const left = run.stalkerIn;
    const label = L(`${run.stalkers + 1}차 던전 붕괴까지 ${left}턴`, `Collapse #${run.stalkers + 1} in ${left} turns`);
    const color = run.stalkers > 0 || left <= 30 ? '#e0574f' : INK.quiet;
    const t = this.ui(text(this, x, y, label, 12, color).setOrigin(1, 0).setDepth(30));
    t.setBackgroundColor('#000000aa').setPadding(4, 2, 4, 2);
    this.dynamic.push(t);
  }

  /** Arena: the wave and how many of its foes are still standing, where the collapse clock goes. */
  private drawWaveCount() {
    const run = this.run;
    const sv = run.survival!;
    if (run.status !== 'playing' || sv.wave < 1) return;
    const r = this.minimapRect();
    const x = r ? r.x + r.w : GW - 10;
    const y = r ? r.y + r.h + 4 : 8;
    const left = run.monsters.length;
    const total = sv.foes && sv.foes >= left ? `/${sv.foes}` : '';
    const label = L(`${sv.wave}웨이브 · 남은 적 ${left}${total}`, `Wave ${sv.wave} · ${left}${total} foes left`);
    const t = this.ui(text(this, x, y, label, 13, left <= 2 ? INK.gold : INK.text, true).setOrigin(1, 0).setDepth(30));
    t.setBackgroundColor('#000000aa').setPadding(5, 3, 5, 3);
    this.dynamic.push(t);
  }

  /** Today's rift: the score so far, under the collapse clock. */
  private drawDailyScore() {
    const run = this.run;
    const r = this.minimapRect();
    const x = r ? r.x + r.w : GW - 10;
    const y = (r ? r.y + r.h + 4 : 8) + 24;
    const label = L(`균열 점수 ${run.dailyScore} · 처치 ${run.daily!.kills}`, `Rift score ${run.dailyScore} · ${run.daily!.kills} kills`);
    const t = this.ui(text(this, x, y, label, 12, INK.gold).setOrigin(1, 0).setDepth(30));
    t.setBackgroundColor('#000000aa').setPadding(4, 2, 4, 2);
    this.dynamic.push(t);
  }

  /** Cast out of today's rift: alive, score kept, income lost. */
  private showDailyFall() {
    const run = this.run;
    const d = run.daily!;
    this.joyClear();
    this.dialog(L('균열에서 쓰러졌다', 'Fell in the rift'), [
      L(`${run.placeName}에서 쓰러져 균열 밖으로 밀려났다. 목숨은 건졌다.`, `Fell on ${run.placeName} and was cast out of the rift. You survived.`),
      L(`점수 ${run.dailyScore}점 (처치 ${d.kills} · 돌파 ${d.cleared}층)은 기록된다.`, `Score ${run.dailyScore} (${d.kills} kills · ${d.cleared} floors) still counts.`),
      L('이번 탐험의 수입과 마력석은 잃었다.', "This run's income and mana stones are lost."),
    ], [[L('본부로 돌아가기', 'Back to HQ'), () => { this.closeOverlay(); this.finishReturn(); }, true]], INK.red);
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
    push(title(this, GW / 2, y + 16, L('가방', 'Bag'), 20, INK.text).setOrigin(0.5, 0));
    drawPaperDoll(this, x + 14, y + 52, w - 28, h).forEach((d) => push(d));
    let by = y + 52 + DOLL_H + 10;
    push(text(this, GW / 2, by, L('물약을 마시면 한 턴이 지나갑니다.', 'Drinking a potion takes a turn.'), 12, INK.faint).setOrigin(0.5, 0));
    by += 22;
    const pad = PORTRAIT ? 14 : 40;
    CONSUMABLE_KINDS.forEach((kind) => {
      const label = L(`${CONSUMABLES[kind].name} ${h.bag[kind]}개 · ${CONSUMABLES[kind].describe}`, `${CONSUMABLES[kind].name} x${h.bag[kind]} · ${CONSUMABLES[kind].describe}`) + (PORTRAIT ? '' : ` (${keys[kind]})`);
      push(button(this, x + pad, by, w - pad * 2, btnH, label, () => {
        this.closeOverlay();
        this.perform({ type: 'use', item: kind });
      }, { enabled: h.bag[kind] > 0 }));
      by += btnH + 8;
    });
    push(button(this, x + pad, by, w - pad * 2, btnH, L('닫기', 'Close'), () => {
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
    this.dialog(L('게이트 클리어!', 'Gate cleared!'), [
      L(`${gateName(run.gate)}의 주인을 쓰러뜨렸다. 이번 수입 ${run.runGold}G`, `You beat the master of the ${gateName(run.gate)}. Income ${run.runGold}G`),
      L(`클리어 보상 ${gateClearGold(run.gate)}G${run.gate.rival ? '(가로채기 +30%)' : ''}와 장비 하나를 챙겨서 나간다.`, `Leave with the ${gateClearGold(run.gate)}G reward${run.gate.rival ? ' (stolen +30%)' : ''} and one piece of gear.`),
      L('남아도 보상은 사라지지 않는다. 나중에 계단에서 나갈 수 있다.', 'Staying keeps the reward. You can leave by the stairs later.'),
    ], [
      [L('보상 받고 귀환하기', 'Take reward and return'), () => { this.closeOverlay(); run.clearGate(); this.finishReturn(true); }, true],
      [L('남아서 더 둘러보기', 'Stay and explore'), () => { this.closeOverlay(); run.stay(); this.redraw(); }],
    ], INK.gold);
  }

  /** The challenge is over: say how it went, then back to the agency. */
  private showDuelEnd() {
    const d = this.run.duel!;
    this.joyClear();
    const lines = d.won
      ? [L(`${d.agency}의 ${d.rank}위 ${d.name}을(를) 꺾었다!`, `You beat #${d.rank} ${d.name} of ${d.agency}!`), L('이제 순위표에서 그보다 위에 선다.', 'You now stand above them in the ranking.'), d.rank === 1 ? L('협회 1위. 그래, 너였구나.', 'Association #1. So it was you.') : L('다음 랭커에게는 내일 도전할 수 있다.', 'You can challenge the next ranker tomorrow.')]
      : [L(`${d.name}에게 졌다.`, `Lost to ${d.name}.`), L('심판이 결투를 멈춰 목숨은 건졌다.', 'The referee stopped the duel; you survived.'), L('더 강해져서 내일 다시 도전하자.', 'Get stronger and try again tomorrow.')];
    this.dialog(d.won ? L('도전 성공!', 'Challenge won!') : L('도전 실패', 'Challenge lost'), lines, [[L('본부로 돌아가기', 'Back to HQ'), () => { this.closeOverlay(); this.finishReturn(); }, true]], d.won ? INK.gold : INK.red);
  }

  /** A wave is down: show what was banked, then go on or go home. */
  private showWaveClear() {
    const run = this.run;
    const h = run.hunter;
    const sv = run.survival!;
    const next = sv.wave + 1;
    const r = waveReward(sv.wave);
    const lines = [
      L(`${sv.wave}웨이브 돌파! 지금까지 수입 ${run.runGold}G · 마력석 ${run.stones}`, `Wave ${sv.wave} cleared! Income so far ${run.runGold}G · Stones ${run.stones}`),
      L(`체력 ${h.hp}/${h.maxHp} · 마나 ${h.mp}/${h.maxMp} · 물약 ${this.bagLine()}`, `HP ${h.hp}/${h.maxHp} · MP ${h.mp}/${h.maxMp} · Pots ${this.bagLine()}`),
      L(`최고 기록 ${h.arenaBest ?? sv.wave}웨이브`, `Best ${h.arenaBest ?? sv.wave} waves`) + (r.tier ? L(' · 기념 장비 획득!', ' · Prize gear!') : ''),
      next % 5 === 0 ? L(`다음은 ${next}웨이브: 챔피언이 나온다! (돌파하면 마력석)`, `Next, wave ${next}: a champion comes! (Mana stones if you win)`) : L(`다음은 ${next}웨이브. 쓰러지면 그 웨이브 수입만 잃는다.`, `Next, wave ${next}. Fall and you lose only that wave's income.`),
    ];
    this.dialog(L('웨이브 돌파', 'Wave cleared'), lines, [
      [L(`다음 웨이브 (${next})`, `Next wave (${next})`), () => { this.closeOverlay(); run.climb(); this.redraw(); }, true],
      [L('귀환하기', 'Return'), () => { this.closeOverlay(); run.retreat(); this.finishReturn(); }],
    ], INK.gold);
  }

  /** Fell in the arena: pulled out alive, keeping what was banked. */
  private showArenaFall() {
    const run = this.run;
    const sv = run.survival!;
    this.joyClear();
    this.dialog(L('아레나에서 쓰러졌다', 'Fell in the arena'), [
      L(`${sv.wave}웨이브에서 쓰러져 심판이 끌어냈다. 목숨은 건졌다.`, `Fell in wave ${sv.wave}; the referee pulled you out alive.`),
      L(`${sv.wave - 1}웨이브까지의 수입 ${run.runGold}G · 마력석 ${run.stones}개는 챙겼다.`, `Kept ${run.runGold}G and ${run.stones} stones from the first ${sv.wave - 1} waves.`),
      L(`최고 기록 ${run.hunter.arenaBest ?? 0}웨이브. 내일 다시 도전할 수 있다.`, `Best ${run.hunter.arenaBest ?? 0} waves. Try again tomorrow.`),
    ], [[L('본부로 돌아가기', 'Back to HQ'), () => { this.closeOverlay(); this.finishReturn(); }, true]], INK.red);
  }

  private showStairs() {
    const run = this.run;
    const h = run.hunter;
    if (run.survival) return this.showWaveClear();
    if (run.gateCleared) return this.showGateClear();
    const lines = [
      L(`${run.placeName} 돌파! 이번 수입 ${run.runGold}G (+돌파 보상 ${10 * run.danger}G)`, `${run.placeName} cleared! Income ${run.runGold}G (+${10 * run.danger}G bonus)`),
      L(`체력 ${h.hp}/${h.maxHp} · 마나 ${h.mp}/${h.maxMp} · 물약 ${this.bagLine()}`, `HP ${h.hp}/${h.maxHp} · MP ${h.mp}/${h.maxMp} · Pots ${this.bagLine()}`),
      L('죽으면 이번 수입은 모두 잃습니다.', 'Die and you lose all of this run’s income.'),
    ];
    if (run.inAbyss && run.abyssRules.length) {
      const bonus = Math.round(run.abyssRules.length * ABYSS_GOLD_PER_RULE * 100);
      lines.push(L(`심연 규칙: ${rulesLine(run.abyssRules)} · 수입 +${bonus}%`, `Abyss rules: ${rulesLine(run.abyssRules)} · Income +${bonus}%`));
      const next = ABYSS_RULE_EVERY - (abyssDepth(run.floor) % ABYSS_RULE_EVERY);
      lines.push(next === 1 ? L('다음 층에서 규칙이 하나 더 붙는다.', 'One more rule joins on the next floor.') : L(`${next}층 더 가면 규칙이 하나 더 붙는다.`, `Another rule joins in ${next} floors.`));
    }
    const buttons: Array<[string, () => void, boolean?]> = [];
    if (run.gate) lines.push(L('지금 나가면 이 게이트는 닫힙니다.', 'Leaving now closes this gate.'));
    if (run.daily) {
      lines.splice(2, 1, L(`균열 점수 ${run.dailyScore} · 이 층을 넘기면 +100 · ${run.turn}턴`, `Rift score ${run.dailyScore} · +100 for leaving this floor · ${run.turn} turns`));
      lines.push(L(`오늘의 규칙: ${run.daily.rules.map((r) => DAILY_RULES[r].name).join(' · ')} · 쓰러져도 점수는 남는다.`, `Rules: ${run.daily.rules.map((r) => DAILY_RULES[r].name).join(' · ')} · Falling keeps the score.`));
      if (run.isTopFloor) lines.push(L(`마지막 층! 지금 나가면 ${run.turn}턴 만에 5층 돌파: 빠를수록 보너스 점수.`, `Last floor! Leave now to clear all 5 in ${run.turn} turns: faster means more bonus.`));
    }
    if (!run.isTopFloor) {
      const next = run.floor + 1;
      const label = run.gate ? L(`더 들어가기 (${next}층)`, `Go deeper (${next}F)`)
        : next > TOP_FLOOR ? L(`${next === TOP_FLOOR + 1 ? '심연으로' : '더 올라가기'} (심연 ${next - TOP_FLOOR}층)`, `${next === TOP_FLOOR + 1 ? 'Into the abyss' : 'Climb on'} (Abyss ${next - TOP_FLOOR}F)`)
        : L(`더 올라가기 (${next}층)`, `Climb on (${next}F)`);
      buttons.push([label, () => { this.closeOverlay(); run.climb(); this.redraw(); }, true]);
    } else if (!run.daily) {
      lines.push(L('지금 갈 수 있는 탑의 꼭대기입니다.', 'This is the top of the tower for now.'));
    }
    buttons.push([L('귀환하기', 'Return'), () => { this.closeOverlay(); run.retreat(); this.finishReturn(); }]);
    buttons.push([L('이 층을 더 둘러보기', 'Explore this floor'), () => { this.closeOverlay(); run.stay(); this.redraw(); }]);
    this.dialog(L('계단에 도착했다', 'You reached the stairs'), lines, buttons);
  }

  private showChoice() {
    const run = this.run;
    const c = run.pendingChoice!;
    const tag = c.hunter.origin === 'rival' ? L(`${run.hunter.name}의 라이벌`, `${run.hunter.name}'s rival`) : L('옛 동료', 'Former ally');
    const pick = (i: number) => () => {
      this.closeOverlay();
      run.resolveChoice(i);
      this.redraw();
    };
    this.dialog(
      L(`[${tag}] ${c.hunter.name}을(를) 쓰러뜨렸다`, `[${tag}] You beat ${c.hunter.name}`),
      [L(`${agencyOf(state, c.hunter.id).name} 소속 · Lv.${c.hunter.level}`, `${agencyOf(state, c.hunter.id).name} · Lv.${c.hunter.level}`), c.hunter.origin === 'rival' ? L('보상을 받고 보내주면 훨씬 강해져서 다시 나타난다 (능력치 +25%).', 'Take a reward and let them go: they come back much stronger (stats +25%).') : L('보상을 받고 보내주면 더 강해져서 다시 나타난다 (능력치 +15%).', 'Take a reward and let them go: they come back stronger (stats +15%).'), L('완전히 쓰러뜨리면 다시는 만나지 않는다.', 'Finish them and you will never meet again.')],
      [
        [`${REWARDS[c.rewards[0]].label}: ${REWARDS[c.rewards[0]].describe(c.hunter.level)}`, pick(0), true],
        [`${REWARDS[c.rewards[1]].label}: ${REWARDS[c.rewards[1]].describe(c.hunter.level)}`, pick(1), true],
        [L(`완전한 사망: 경험치 +${c.finishExp}`, `Finish them: EXP +${c.finishExp}`), pick(2)],
      ],
      '#d79bff',
    );
  }

  private newsLines(n: AfterRunNews): string[] {
    const msgs: string[] = [];
    for (const name of n.finished) msgs.push(L(`${name}은(는) 명예의 전당에 이름만 남겼다.`, `${name} lives on only in the Hall of Fame.`));
    for (const name of n.grewStronger) msgs.push(L(`${name}은(는) 경쟁사에서 훨씬 강해졌다.`, `${name} grew much stronger at their rival agency.`));
    if (n.rivalCreated) msgs.push(L(`S급 승급 소식에 ${state.rival.name}이(가) 라이벌 ${n.rivalCreated.name}을(를) 내세웠다!`, `Hearing of the S-Rank promotion, ${state.rival.name} fielded a rival: ${n.rivalCreated.name}!`));
    msgs.push(...n.gateNews);
    for (const d of n.dispatched ?? []) msgs.push(L(`${d.name}이(가) 파견에서 돌아왔다. 수입 ${d.earned}G 중 ${d.tribute}G 상납 · 경험치 +${d.exp}.`, `${d.name} is back from dispatch. Paid ${d.tribute}G of ${d.earned}G · EXP +${d.exp}.`));
    return msgs;
  }

  /** Writes this run's kills into the monster codex, once. Returns kinds seen for the first time. */
  private recordCodex(): string[] {
    if (this.codexDone) return [];
    this.codexDone = true;
    return recordKills(state, this.run.tally).filter((id) => CODEX_IDS.includes(id));
  }

  private codexDone = false;

  private finishReturn(cleared = false) {
    const run = this.run;
    const duelWon = run.duel ? settleDuel(state, run.duel) : false;
    const waves = run.survival ? (run.survival.fell ? run.survival.wave - 1 : run.survival.wave) : 0;
    const inTower = !run.gate && !run.duel && !run.survival && !run.daily;
    const fresh = this.recordCodex();
    // Today's rift: the score first, since a better one pays stones on top of the run's.
    const daily = run.daily ? settleDaily(state, run.daily, run.turn, run.hunter.name) : undefined;
    const r = settleReturn(state, rng, run.runGold, run.encounters, cleared, run.stones, {
      kills: run.tally, floor: inTower ? run.floor : 0, gate: cleared && !!run.gate, waves, gold: run.runGold,
    });
    const stolen = cleared && run.gate?.rival ? L(` ${run.gate.rival.agency}보다 먼저 해냈다!`, ` Beat ${run.gate.rival.agency} to it!`) : '';
    const where = daily && run.daily
      ? L(`오늘의 균열(${dateLabel(run.daily.date)}) ${daily.score}점 · 처치 ${run.daily.kills} · 돌파 ${run.daily.cleared}층.`, `Today's Rift (${dateLabel(run.daily.date)}): ${daily.score} points · ${run.daily.kills} kills · ${run.daily.cleared} floors.`)
      : run.survival
      ? L(`생존 아레나 ${run.survival.fell ? run.survival.wave - 1 : run.survival.wave}웨이브 돌파 (최고 ${run.hunter.arenaBest ?? 0}).`, `Survival Arena: ${run.survival.fell ? run.survival.wave - 1 : run.survival.wave} waves (best ${run.hunter.arenaBest ?? 0}).`)
      : run.duel
      ? (duelWon ? L(`${run.duel.rank}위 ${run.duel.name}에게 도전해 이겼다! 지금 ${gradeIn(state, run.hunter)}급.`, `Challenged #${run.duel.rank} ${run.duel.name} and won! Now ${gradeIn(state, run.hunter)}-Rank.`) : L(`${run.duel.rank}위 ${run.duel.name}에게 도전했지만 졌다.`, `Challenged #${run.duel.rank} ${run.duel.name} and lost.`))
      : run.gate ? (cleared ? L(`${gateName(run.gate)} 클리어!${stolen}`, `${gateName(run.gate)} cleared!${stolen}`) : L(`${run.placeName}에서 귀환.`, `Returned from ${run.placeName}.`)) : L(`${run.placeName}에서 귀환.`, `Returned from ${run.placeName}.`);
    const msgs = [
      L(`${where} 수입 ${r.earned}G 중 ${r.tribute}G(${Math.round(r.rate * 100)}%) 상납.`, `${where} Paid ${r.tribute}G (${Math.round(r.rate * 100)}%) of ${r.earned}G to the agency.`),
    ];
    if (daily) {
      msgs.unshift(daily.dayBest && daily.previousBest === 0
        ? L(`오늘의 균열 첫 기록 ${daily.score}점${daily.record ? ' (에이전시 신기록!)' : ''}. 마력석 +${daily.stones}`, `First score in today's rift: ${daily.score}${daily.record ? ' (agency record!)' : ''}. Mana stones +${daily.stones}`)
        : daily.dayBest
        ? L(`오늘의 균열 최고 점수 갱신! ${daily.previousBest} → ${daily.score}점${daily.record ? ' (에이전시 신기록!)' : ''}. 마력석 +${daily.stones}`, `New best for today's rift! ${daily.previousBest} → ${daily.score}${daily.record ? ' (agency record!)' : ''}. Mana stones +${daily.stones}`)
        : L(`오늘의 균열 ${daily.score}점. 오늘 최고 ${daily.previousBest}점은 못 넘었다.`, `Today's rift: ${daily.score}. Did not beat today's best of ${daily.previousBest}.`));
    }
    for (const id of fresh) msgs.push(L(`도감 등록: ${MONSTERS[id].name}`, `New in the codex: ${MONSTERS[id].name}`));
    for (const q of r.quests ?? []) msgs.unshift(L(`의뢰 완료: ${questText(q)}! 보상 ${questReward(q)}.`, `Quest done: ${questText(q)}! Reward ${questReward(q)}.`));
    if (r.agencyUp) msgs.unshift(levelUpMessage(r.agencyUp));
    if (run.spare.length) {
      const kept = storeSpare(state, run.spare);
      msgs.push(kept === run.spare.length
        ? L(`쓰지 않는 장비 ${kept}개를 창고에 넣었다.`, `Put ${kept} spare piece${kept > 1 ? 's' : ''} of gear in storage.`)
        : L(`쓰지 않는 장비 ${kept}개를 창고에 넣었다. 창고가 가득 차서 ${run.spare.length - kept}개는 버렸다.`, `Stored ${kept} spare piece(s); storage is full, so ${run.spare.length - kept} were thrown away.`));
    }
    if (r.backing > 0) msgs.push(L(`협회 후원 +${r.backing}G.`, `Association backing +${r.backing}G.`));
    if (r.promotedTo) {
      msgs.push(L(`등급 재심사: ${r.promotedFrom}급 → ${r.promotedTo}급! 재계약 지원금 ${r.signingSupport}G.`, `Re-graded: ${r.promotedFrom} → ${r.promotedTo}! Re-signing bonus ${r.signingSupport}G.`));
    }
    if (r.stones > 0) msgs.push(L(`마력석 ${r.stones}개를 에이전시 창고에 넣었다. (보유 ${state.agent.stones}개)`, `Stored ${r.stones} mana stones at the agency. (Total ${state.agent.stones})`));
    const pots = run.hunter.bag.hp;
    msgs.push(L(`남은 물약은 모두 두고 왔다. 가방에는 체력 물약 ${pots}개만 챙겼다.`, `Left the other potions behind; the bag holds ${pots} HP potion${pots > 1 ? 's' : ''}.`));
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
    const killer = run.killer ?? L('알 수 없는 적', 'an unknown enemy');
    const fresh = this.recordCodex();
    const d = settleDeath(state, rng, killer, run.encounters);
    state.run = undefined;
    persist();
    const legend = h.everSSS;
    const fateLine = d.scouted
      ? L(`지나가던 ${d.agency}이(가) ${h.name}을(를) 구해 데려갔다...`, `${d.agency}, passing by, saved ${h.name} and took them away...`)
      : L(`${h.name}의 이름은 기록으로만 남는다.`, `${h.name} lives on only in the records.`);
    const msgs = [
      d.scouted ? L(`${h.name}은(는) ${d.agency}에 스카웃됐다. 언젠가 적으로 만날지도.`, `${h.name} was scouted by ${d.agency}. You may meet as enemies one day.`) : L(`${h.name}의 기록이 남았다.`, `${h.name}'s record remains.`),
      ...(d.newGear?.length ? [L(`${d.agency}이(가) ${h.name}에게 새 장비를 맞춰 줬다: ${d.newGear.map((g) => g.name).join(', ')}.`, `${d.agency} geared up ${h.name}: ${d.newGear.map((g) => g.name).join(', ')}.`)] : []),
      ...this.newsLines(d),
      ...fresh.map((id) => L(`도감 등록: ${MONSTERS[id].name}`, `New in the codex: ${MONSTERS[id].name}`)),
    ];
    this.dialog(
      legend ? L('그래, 너였구나.', 'So it was you.') : L('넌 주인공이 아니었네...', "You weren't the protagonist..."),
      [
        L(`${h.name} · ${grade}급 · Lv.${h.level}`, `${h.name} · ${grade}-Rank · Lv.${h.level}`),
        L(`${run.placeName}에서 ${killer}에게 쓰러졌다.`, `Fell to ${killer} at ${run.placeName}.`),
        L(`처치 ${h.kills}마리 · 최고 ${h.bestFloor}층 · 기록 점수 ${score}`, `Kills ${h.kills} · Best ${h.bestFloor}F · Score ${score}`),
        fateLine,
      ],
      [[L('본부로 돌아가기', 'Back to HQ'), () => this.scene.start('HQ', { messages: msgs }), true]],
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

/** A 40×44 pixel potion bottle, or a rolled scroll for the return scroll. */
function drawItemIcon(kind: ConsumableKind) {
  return (g: Phaser.GameObjects.Graphics, x: number, y: number) => paintConsumable(g, kind, x, y);
}

function gearNotice(gear: Gear, equipped: boolean, old?: Gear): Notice {
  const color = tierColor(gear.tier);
  const slot = L(`${GEAR_SLOT_NAMES[gear.slot]} · ${gear.tier}단계`, `${GEAR_SLOT_NAMES[gear.slot]} · Tier ${gear.tier}`);
  if (!equipped) {
    return {
      heading: L('장비 발견', 'Gear found'),
      color: INK.quiet,
      icon: drawGearIcon(gear),
      lines: [
        [slot, INK.faint],
        [gearLabel(gear), color, 15],
        [describeGear(gear), INK.text],
        [old ? L(`지금 쓰는 ${gearLabel(old)}이(가) 더 좋아서 두고 왔다.`, `Your ${gearLabel(old)} is better, so you left it.`) : L('쓸 일이 없어 두고 왔다.', 'No use for it, so you left it.'), INK.faint],
      ],
      ms: 1800,
    };
  }
  const lines: Notice['lines'] = [[slot, INK.faint], [gearLabel(gear), color, 15], [describeGear(gear), INK.text]];
  const diff = gearDiff(gear, old);
  if (diff) lines.push([L(`능력치 변화  ${diff}`, `Stat change  ${diff}`), INK.gate]);
  if (old) lines.push([L(`이전 장비 ${gearLabel(old)}은(는) 버렸다.`, `Discarded the old ${gearLabel(old)}.`), INK.faint]);
  return { heading: old ? L('장비 업그레이드!', 'Gear upgrade!') : L('새 장비 장착!', 'New gear equipped!'), color: INK.gold, icon: drawGearIcon(gear), lines };
}

function lootNotice(item: ConsumableKind, got: boolean, count: number, max: number): Notice {
  const c = CONSUMABLES[item];
  return {
    heading: got ? L('아이템 획득!', 'Item found!') : L('가방이 가득 찼다', 'Bag is full'),
    color: got ? INK.gold : INK.quiet,
    icon: drawItemIcon(item),
    lines: [
      [c.name, INK.text, 15],
      [c.describe, INK.gate],
      [got ? L(`가방 ${count}/${max}`, `Bag ${count}/${max}`) : L(`가방 ${count}/${max} · 두고 왔다`, `Bag ${count}/${max} · left behind`), got ? INK.quiet : INK.red],
    ],
  };
}

const CURSE_NAMES: Record<CurseKind, string> = {
  drain: L('흡혈의 저주', 'Curse of Draining'),
  mana: L('마력 소멸의 저주', 'Curse of Mana Loss'),
  greed: L('탐욕의 저주', 'Curse of Greed'),
  ambush: L('매복의 저주', 'Curse of Ambush'),
};

function curseNotice(curse: CurseKind, detail: string): Notice {
  return {
    heading: L(`저주! ${CURSE_NAMES[curse]}`, `Cursed! ${CURSE_NAMES[curse]}`),
    color: INK.red,
    lines: [
      [detail, INK.red, 15],
      [CURSES[curse], INK.quiet],
    ],
    ms: 2800,
  };
}
