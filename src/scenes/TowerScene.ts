import * as Phaser from 'phaser';
import { activeHunter, AfterRunNews, gradeIn, settleDeath, settleReturn } from '../core/agency';
import { MAP_H, MAP_W, Tile } from '../core/dungeon';
import { hallOfFameScore } from '../core/hunter';
import { Action, REWARDS, SKILL_COST, SKILL_NAME, TowerRun } from '../core/run';
import { persist, rng, state } from '../game/store';
import { bar, button, FONT, INK, PALETTE, panel, text, title } from '../game/ui';

const TILE = 24;
const HUD_Y = MAP_H * TILE; // 600

/** One trip up the Tower of Growth. Draws the TowerRun and turns input into actions. */
export class TowerScene extends Phaser.Scene {
  private run!: TowerRun;
  private mapLayer!: Phaser.GameObjects.Graphics;
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private overlay: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('Tower');
  }

  create() {
    this.cameras.main.setBackgroundColor(PALETTE.bg);
    this.run = new TowerRun(activeHunter(state)!, rng, { rivals: state.rival.roster, rivalAgency: state.rival.name });
    this.mapLayer = this.add.graphics();

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

    // Tap or click on the map: step one tile toward that point.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y >= HUD_Y || this.overlay.length) return;
      const tx = Math.floor(p.x / TILE);
      const ty = Math.floor(p.y / TILE);
      const dx = tx - this.run.pos.x;
      const dy = ty - this.run.pos.y;
      if (dx === 0 && dy === 0) return this.perform({ type: 'wait' });
      if (Math.abs(dx) >= Math.abs(dy)) this.perform({ type: 'move', dx: Math.sign(dx), dy: 0 });
      else this.perform({ type: 'move', dx: 0, dy: Math.sign(dy) });
    });

    this.redraw();
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

    this.drawHud();

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

  private closeOverlay() {
    this.overlay.forEach((o) => o.destroy());
    this.overlay = [];
  }

  private dialog(heading: string, lines: string[], buttons: Array<[string, () => void, boolean?]>, headingColor: string = INK.text) {
    const o = this.overlay;
    const shade = this.add.graphics();
    shade.fillStyle(0x000000, 0.7);
    shade.fillRect(0, 0, 960, 720);
    shade.setInteractive(new Phaser.Geom.Rectangle(0, 0, 960, 720), Phaser.Geom.Rectangle.Contains);
    o.push(shade);
    const w = 520;
    const hgt = 100 + lines.length * 24 + buttons.length * 58;
    const x = (960 - w) / 2;
    const y = (720 - hgt) / 2;
    o.push(panel(this, x, y, w, hgt));
    o.push(title(this, 480, y + 24, heading, 23, headingColor).setOrigin(0.5, 0));
    lines.forEach((l, i) => o.push(text(this, 480, y + 66 + i * 24, l, 12, INK.quiet).setOrigin(0.5, 0)));
    buttons.forEach(([label, fn, primary], i) => {
      o.push(button(this, x + 40, y + 82 + lines.length * 24 + i * 58, w - 80, 48, label, fn, { primary: !!primary, size: 12 }));
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
