import * as Phaser from 'phaser';
import { recordDeath, settleReturn } from '../core/agency';
import { MAP_H, MAP_W, Tile } from '../core/dungeon';
import { combatPower, gradeOf, hallOfFameScore } from '../core/hunter';
import { Action, SKILL_COST, SKILL_NAME, TowerRun } from '../core/run';
import { persist, rng, state } from '../game/store';
import { bar, button, COLORS, FONT, panel, text } from '../game/ui';

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
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.run = new TowerRun(state.hunter, rng);
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
        const visible = run.isVisible(x, y);
        const tile = run.map.tiles[y][x];
        if (tile === Tile.Wall && !this.touchesFloor(x, y)) continue;
        let color = tile === Tile.Wall ? 0x6b5d4f : 0x353c4c;
        if (!visible) color = tile === Tile.Wall ? 0x2e2924 : 0x1c2029;
        g.fillStyle(color, 1);
        g.fillRect(x * TILE, y * TILE, TILE - 1, TILE - 1);
        if (tile === Tile.Stairs) {
          g.fillStyle(run.bossAlive ? 0x7a5c1e : COLORS.gold, visible ? 1 : 0.5);
          g.fillTriangle(x * TILE + 4, y * TILE + TILE - 5, x * TILE + TILE / 2, y * TILE + 4, x * TILE + TILE - 5, y * TILE + TILE - 5);
        }
      }
    }

    for (const m of run.monsters) {
      if (!run.isVisible(m.x, m.y)) continue;
      const color = m.kind.boss ? '#ff6b6b' : m.awake ? '#f29f4e' : '#c7a26b';
      this.keep(this.glyph(m.x, m.y, m.kind.glyph, color, m.kind.boss ? 20 : 17));
      const hpRatio = m.hp / m.maxHp;
      if (hpRatio < 1) {
        const hb = this.keep(this.add.graphics());
        hb.fillStyle(0x000000, 1);
        hb.fillRect(m.x * TILE + 2, m.y * TILE + TILE - 4, TILE - 5, 3);
        hb.fillStyle(COLORS.danger, 1);
        hb.fillRect(m.x * TILE + 2, m.y * TILE + TILE - 4, (TILE - 5) * hpRatio, 3);
      }
    }
    this.keep(this.glyph(run.pos.x, run.pos.y, '@', '#7fb0ff', 20));

    this.drawHud();

    if (run.status === 'onStairs' && !this.overlay.length) this.showStairs();
    if (run.status === 'dead' && !this.overlay.length) this.showDeath();
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
    k(panel(this, 0, HUD_Y, 960, 120));
    k(text(this, 16, HUD_Y + 10, `${h.name}  ${gradeOf(combatPower(h))}급  Lv.${h.level}`, 16, COLORS.text, true));
    k(text(this, 16, HUD_Y + 36, `체력 ${h.hp}/${h.maxHp}`, 13));
    k(bar(this, 110, HUD_Y + 40, 150, 9, h.hp / h.maxHp, COLORS.danger));
    k(text(this, 16, HUD_Y + 56, `마나 ${h.mp}/${h.maxMp}`, 13));
    k(bar(this, 110, HUD_Y + 60, 150, 9, h.mp / h.maxMp, COLORS.mana));
    k(text(this, 16, HUD_Y + 80, `성장의 탑 ${run.floor}층 · 이번 수입 ${run.runGold}G · 포션 ${h.potions}`, 13, '#f2c14e'));

    run.log.slice(-4).forEach((line, i, arr) =>
      k(text(this, 290, HUD_Y + 10 + i * 24, line, 14, i === arr.length - 1 ? COLORS.text : COLORS.quiet)),
    );

    k(button(this, 704, HUD_Y + 12, 116, 44, `${SKILL_NAME} (Q)\n마나 ${SKILL_COST}`, () => this.perform({ type: 'skill' }), { size: 13 }));
    k(button(this, 828, HUD_Y + 12, 116, 44, `포션 (E)`, () => this.perform({ type: 'potion' }), { size: 14 }));
    k(button(this, 704, HUD_Y + 64, 240, 44, `대기 (Space)`, () => this.perform({ type: 'wait' }), { size: 14 }));
  }

  private closeOverlay() {
    this.overlay.forEach((o) => o.destroy());
    this.overlay = [];
  }

  private dialog(title: string, lines: string[], buttons: Array<[string, () => void, boolean?]>, titleColor: string = COLORS.text) {
    const o = this.overlay;
    const shade = this.add.graphics();
    shade.fillStyle(0x000000, 0.65);
    shade.fillRect(0, 0, 960, 720);
    shade.setInteractive(new Phaser.Geom.Rectangle(0, 0, 960, 720), Phaser.Geom.Rectangle.Contains);
    o.push(shade);
    const w = 520;
    const hgt = 94 + lines.length * 26 + buttons.length * 56;
    const x = (960 - w) / 2;
    const y = (720 - hgt) / 2;
    o.push(panel(this, x, y, w, hgt));
    o.push(text(this, 480, y + 22, title, 24, titleColor, true).setOrigin(0.5, 0));
    lines.forEach((l, i) => o.push(text(this, 480, y + 66 + i * 26, l, 15, COLORS.quiet).setOrigin(0.5, 0)));
    buttons.forEach(([label, fn, primary], i) => {
      o.push(button(this, x + 40, y + 80 + lines.length * 26 + i * 56, w - 80, 46, label, fn, { primary: !!primary, size: 16 }));
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

  private finishReturn() {
    const run = this.run;
    const r = settleReturn(state, run.runGold);
    const msgs = [
      `${run.floor}층에서 귀환. 수입 ${r.earned}G 중 ${r.tribute}G(${Math.round(r.rate * 100)}%)를 에이전시에 상납했다.`,
    ];
    if (r.promotedTo) {
      msgs.push(`등급 재심사: ${r.promotedFrom}급 → ${r.promotedTo}급 승급! 재계약으로 상납 비율이 낮아졌다.`);
      if (r.signingSupport > 0) msgs.push(`재계약 기념 아이템 지원금 ${r.signingSupport}G를 받았다.`);
    }
    persist();
    this.scene.start('HQ', { messages: msgs });
  }

  private showDeath() {
    const run = this.run;
    const h = run.hunter;
    const score = hallOfFameScore(h);
    this.dialog(
      '넌 주인공이 아니었네...',
      [
        `${h.name} · ${gradeOf(combatPower(h))}급 · Lv.${h.level}`,
        `${run.floor}층에서 ${run.killer}에게 쓰러졌다.`,
        `처치 ${h.kills}마리 · 최고 ${h.bestFloor}층 · 기록 점수 ${score}`,
        '이번 탑에서 번 돈은 모두 잃었다.',
      ],
      [[
        '본부로 돌아가 새 헌터 고용',
        () => {
          const name = h.name;
          recordDeath(state, rng, run.killer ?? '알 수 없는 적');
          persist();
          this.scene.start('HQ', {
            messages: [`${name}의 기록이 남았다.`, `새 헌터 ${state.hunter.name}와(과) 계약했다.`],
          });
        },
        true,
      ]],
      '#ff6b6b',
    );
  }
}
