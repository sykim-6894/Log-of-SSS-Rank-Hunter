import * as Phaser from 'phaser';
import { activeHunter, AfterRunNews, gradeIn, settleDeath, settleReturn } from '../core/agency';
import { MAP_H, MAP_W, Tile } from '../core/dungeon';
import { hallOfFameScore } from '../core/hunter';
import { Action, REWARDS, SKILL_COST, SKILL_NAME, TowerRun } from '../core/run';
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
const P_BTN_X = GW - 212; // action buttons start here
const P_ZOOM = 1.25;
const JOY_RADIUS = 44;
const JOY_DEADZONE = 14;
const JOY_REPEAT_MS = 170;

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
    halted: boolean;
    gfx: Phaser.GameObjects.Graphics;
    timer: Phaser.Time.TimerEvent | null;
  } | null = null;
  /** Portrait only: a fixed camera for the HUD while the main camera follows the hunter. */
  private uiCam: Phaser.Cameras.Scene2D.Camera | null = null;

  constructor() {
    super('Tower');
  }

  create() {
    this.cameras.main.setBackgroundColor(PALETTE.bg);
    this.joy = null;
    this.run = new TowerRun(activeHunter(state)!, rng, { rivals: state.rival.roster, rivalAgency: state.rival.name });
    this.overlay = [];
    this.dynamic = [];
    this.uiCam = null;
    if (PORTRAIT) {
      const cam = this.cameras.main;
      cam.setViewport(0, P_TOP_H, GW, P_MAP_H).setZoom(P_ZOOM).setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
      this.uiCam = this.cameras.add(0, 0, GW, GH);
    }
    this.mapLayer = this.world(this.add.graphics());

    const keys: Record<string, Action> = {
      ArrowUp: { type: 'move', dx: 0, dy: -1 },
      ArrowDown: { type: 'move', dx: 0, dy: 1 },
      ArrowLeft: { type: 'move', dx: -1, dy: 0 },
      ArrowRight: { type: 'move', dx: 1, dy: 0 },
      w: { type: 'move', dx: 0, dy: -1 },
      s: { type: 'move', dx: 0, dy: 1 },
      a: { type: 'move', dx: -1, dy: 0 },
      d: { type: 'move', dx: 1, dy: 0 },
      q: { type: 'skill' },
      e: { type: 'potion' },
      ' ': { type: 'wait' },
    };
    this.input.keyboard?.on('keydown', (ev: KeyboardEvent) => {
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
    if (!this.joyArea(p) || this.overlay.length || this.joy) return;
    const gfx = this.ui(this.add.graphics().setDepth(50));
    this.joy = { id: p.id, ox: p.x, oy: p.y, dir: null, used: false, halted: false, gfx, timer: null };
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
    joy.halted = false;
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

  /** One held-joystick step. Stops by itself when a new enemy comes into view. */
  private joyStep() {
    const joy = this.joy;
    if (!joy || !joy.dir || joy.halted) return;
    if (this.overlay.length || this.run.status !== 'playing') return this.joyClear();
    const before = this.visibleEnemies();
    this.perform({ type: 'move', dx: joy.dir.dx, dy: joy.dir.dy });
    if (this.joy && this.visibleEnemies() > before) this.joy.halted = true;
  }

  private visibleEnemies() {
    return this.run.monsters.filter((m) => this.run.isVisible(m.x, m.y)).length;
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

  private perform(action: Action) {
    if (this.overlay.length) return;
    this.run.act(action);
    this.redraw();
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
    const g = this.mapLayer;
    g.clear();
    this.clearDynamic();

    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (!run.seen[y][x]) continue;
        const tile = run.map.tiles[y][x];
        if (tile === Tile.Wall && !this.touchesFloor(x, y)) continue;
        this.drawTile(g, x, y, tile, run.isVisible(x, y));
      }
    }

    for (const m of run.monsters) {
      if (!run.isVisible(m.x, m.y)) continue;
      const color = m.hunter ? '#d79bff' : m.kind.boss ? INK.red : m.awake ? INK.rust : '#c9a46a';
      this.keep(this.glyph(m.x, m.y, m.kind.glyph, color, m.kind.boss ? 24 : 15));
      const hpRatio = m.hp / m.maxHp;
      if (hpRatio < 1) {
        const hb = this.keep(this.add.graphics());
        hb.fillStyle(0x000000, 1);
        hb.fillRect(m.x * TILE + 2, m.y * TILE + TILE - 4, TILE - 5, 3);
        hb.fillStyle(PALETTE.hp, 1);
        hb.fillRect(m.x * TILE + 2, m.y * TILE + TILE - 4, (TILE - 5) * hpRatio, 3);
      }
    }
    this.keep(this.glyph(run.pos.x, run.pos.y, '@', INK.gate, 18));
    if (PORTRAIT) this.cameras.main.centerOn(run.pos.x * TILE + TILE / 2, run.pos.y * TILE + TILE / 2);

    if (PORTRAIT) this.drawHudPortrait();
    else this.drawHud();

    if (run.status === 'onStairs' && !this.overlay.length) this.showStairs();
    if (run.status === 'dead' && !this.overlay.length) this.showDeath();
    if (run.status === 'choosing' && !this.overlay.length) this.showChoice();
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

  private touchesFloor(x: number, y: number): boolean {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const t = this.run.map.tiles[y + dy]?.[x + dx];
        if (t !== undefined && t !== Tile.Wall) return true;
      }
    }
    return false;
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
    k(text(this, 16, HUD_Y + 88, `${run.floor}층 · 수입 ${run.runGold}G · 포션 ${h.potions}` + (h.rescues ? ` · 지원 ${h.rescues}` : ''), 12, INK.gold));

    const lg = k(this.add.graphics());
    lg.fillStyle(PALETTE.panelDark, 1).fillRect(284, HUD_Y + 12, 400, 96);
    run.log.slice(-4).forEach((line, i, arr) =>
      k(text(this, 296, HUD_Y + 20 + i * 21, line, 12, i === arr.length - 1 ? INK.text : INK.faint)),
    );

    k(button(this, 700, HUD_Y + 12, 120, 46, `${SKILL_NAME} Q\n마나 ${SKILL_COST}`, () => this.perform({ type: 'skill' })));
    k(button(this, 828, HUD_Y + 12, 116, 46, `포션 E`, () => this.perform({ type: 'potion' })));
    k(button(this, 700, HUD_Y + 64, 244, 44, `대기  Space`, () => this.perform({ type: 'wait' })));
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
    k(text(this, 14 + nameText.width + 8, 13, `${gradeIn(state, h)}급 · Lv.${h.level}`, 12, INK.rust, true));
    k(text(this, GW - 14, 13, `${run.floor}층 · 수입 ${run.runGold}G · 포션 ${h.potions}` + (h.rescues ? ` · 지원 ${h.rescues}` : ''), 12, INK.gold).setOrigin(1, 0));
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
    k(button(this, P_BTN_X, P_CTL_Y + 22, 96, 72, `${SKILL_NAME}\n마나 ${SKILL_COST}`, () => this.perform({ type: 'skill' }), { enabled: h.mp >= SKILL_COST }));
    k(button(this, GW - 110, P_CTL_Y + 22, 96, 72, `포션\n${h.potions}개`, () => this.perform({ type: 'potion' }), { enabled: h.potions > 0 }));
    k(button(this, P_BTN_X, P_CTL_Y + 104, GW - 14 - P_BTN_X, 56, '대기 (한 턴)', () => this.perform({ type: 'wait' })));
  }

  private closeOverlay() {
    this.overlay.forEach((o) => o.destroy());
    this.overlay = [];
  }

  private dialog(heading: string, lines: string[], buttons: Array<[string, () => void, boolean?]>, headingColor: string = INK.text) {
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
    buttons.forEach(([label, fn, primary], i) => {
      push(button(this, x + pad, ly + 16 + i * 58, w - pad * 2, 48, label, fn, { primary: !!primary, size: 12 }));
    });
  }

  private showStairs() {
    const run = this.run;
    const h = run.hunter;
    const lines = [
      `${run.floor}층 돌파! 이번 수입 ${run.runGold}G (+돌파 보상 ${10 * run.floor}G)`,
      `체력 ${h.hp}/${h.maxHp} · 마나 ${h.mp}/${h.maxMp} · 포션 ${h.potions}개`,
      '죽으면 이번 수입은 모두 잃습니다.',
    ];
    const buttons: Array<[string, () => void, boolean?]> = [];
    if (!run.isTopFloor) {
      buttons.push([`더 올라가기 (${run.floor + 1}층)`, () => { this.closeOverlay(); run.climb(); this.redraw(); }, true]);
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
    return msgs;
  }

  private finishReturn() {
    const run = this.run;
    const r = settleReturn(state, rng, run.runGold, run.encounters);
    const msgs = [
      `${run.floor}층에서 귀환. 수입 ${r.earned}G 중 ${r.tribute}G(${Math.round(r.rate * 100)}%) 상납.`,
    ];
    if (r.promotedTo) {
      msgs.push(`등급 재심사: ${r.promotedFrom}급 → ${r.promotedTo}급! 재계약 지원금 ${r.signingSupport}G.`);
    }
    msgs.push(...this.newsLines(r));
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
    persist();
    const legend = h.everSSS;
    const fateLine = d.scouted
      ? `지나가던 ${state.rival.name}이(가) ${h.name}을(를) 구해 데려갔다...`
      : `${h.name}의 이름은 기록으로만 남는다.`;
    const msgs = [
      d.scouted ? `${h.name}은(는) ${state.rival.name}에 스카웃됐다. 언젠가 적으로 만날지도.` : `${h.name}의 기록이 남았다.`,
      ...this.newsLines(d),
    ];
    this.dialog(
      legend ? '그래, 너였구나.' : '넌 주인공이 아니었네...',
      [
        `${h.name} · ${grade}급 · Lv.${h.level}`,
        `${run.floor}층에서 ${killer}에게 쓰러졌다.`,
        `처치 ${h.kills}마리 · 최고 ${h.bestFloor}층 · 기록 점수 ${score}`,
        fateLine,
      ],
      [['본부로 돌아가기', () => this.scene.start('HQ', { messages: msgs }), true]],
      legend ? INK.gold : INK.red,
    );
  }
}
