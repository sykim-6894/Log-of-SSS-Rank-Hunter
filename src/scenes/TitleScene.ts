import * as Phaser from 'phaser';
import { SAVE_SLOTS } from '../core/save';
import { fitCamera, GH, GW, PORTRAIT } from '../game/layout';
import { slotLabel } from '../game/slots';
import { hadGame, loadSlot, resetGame, slotInfo, takeSkipTitle } from '../game/store';
import { button, dots, INK, PALETTE, panel, text, title } from '../game/ui';
import { drawLook, LOOKS } from '../game/looks';
import { L, Lang, lang, LANG_KEY } from '../core/lang';

interface TitleData {
  /** Showing the list of save slots to load. */
  loading?: boolean;
  /** "새로 시작하기" was pressed once over a game in progress: the next press confirms. */
  armNew?: boolean;
  note?: string;
}

/** First screen: continue, start over, or load one of the hand-made saves. */
export class TitleScene extends Phaser.Scene {
  private data_: TitleData = {};

  constructor() {
    super('Title');
  }

  init(data: TitleData) {
    this.data_ = data ?? {};
  }

  create() {
    // Reloaded only to switch layouts after a rotation: go straight back to the office.
    if (takeSkipTitle()) return this.scene.start('HQ');
    fitCamera(this.cameras.main).setBackgroundColor(PALETTE.bg);
    const w = Math.min(GW - 40, 420);
    const x = (GW - w) / 2;
    // Key art: the four hunters in front of an open gate.
    const artTop = PORTRAIT ? 70 : 24;
    this.drawArt(GW / 2, artTop);
    const top = artTop + (PORTRAIT ? 230 : 196);
    title(this, GW / 2, top, L('주인공을 찾습니다', 'Wanted: The Protagonist'), PORTRAIT ? 28 : 36, INK.text).setOrigin(0.5, 0);
    text(this, GW / 2, top + (PORTRAIT ? 44 : 54), L('— SSS급 헌터 에이전시', '— SSS-Rank Hunter Agency'), 14, INK.rust).setOrigin(0.5, 0);
    dots(this, x, top + (PORTRAIT ? 78 : 92), w);
    const by = top + (PORTRAIT ? 104 : 120);

    if (this.data_.loading) return this.drawSlots(x, by, w);

    const going = hadGame();
    // A first visit has nothing to continue: "New Game" leads instead.
    const row = going ? 66 : 0;
    if (going) button(this, x, by, w, 54, L('이어하기', 'Continue'), () => this.scene.start('HQ'), { primary: true, size: 18 });
    const armed = !!this.data_.armNew;
    button(this, x, by + row, w, 54, armed ? L('정말 새로 시작할까요? (한 번 더 누르기)', 'Really start over? (tap again)') : L('새로 시작하기', 'New Game'), () => {
      if (going && !armed) return this.scene.restart({ armNew: true });
      resetGame();
      this.scene.start('HQ');
    }, { size: armed ? 14 : 18, primary: !going });
    const anySaved = Array.from({ length: SAVE_SLOTS }, (_, i) => slotInfo(i)).some((s) => !!s);
    button(this, x, by + row + 66, w, 54, L('불러오기', 'Load'), () => this.scene.restart({ loading: true }), { size: 18, enabled: anySaved });
    const note = armed
      ? L('진행 중인 게임은 사라집니다. 저장 슬롯에 남긴 기록은 그대로예요.', 'The game in progress will be lost. Save slots are kept.')
      : anySaved ? L('불러오기: 본부 [설정]에서 저장해 둔 슬롯을 엽니다.', 'Load: opens a slot saved from [Settings] at HQ.') : L('본부 [설정]에서 슬롯 3개에 따로 저장할 수 있어요.', 'You can save to 3 slots from [Settings] at HQ.');
    text(this, GW / 2, by + row + 134, this.data_.note ?? note, 12, armed ? INK.red : INK.faint)
      .setOrigin(0.5, 0).setWordWrapWidth(w, true).setAlign('center');
    // Language, so a first visit in the wrong one is one tap away.
    const other: Lang = lang() === 'en' ? 'ko' : 'en';
    button(this, GW / 2 - 70, GH - 70, 140, 36, other === 'en' ? 'English' : '한국어', () => {
      localStorage.setItem(LANG_KEY, other);
      location.reload();
    }, { size: 13 });
  }

  /** An open gate glowing behind the four hunters, with sparks drifting up. */
  private drawArt(cx: number, top: number) {
    const gy = top + 92; // gate centre
    const glow = this.add.graphics();
    glow.fillStyle(PALETTE.gate, 0.06).fillEllipse(cx, gy, 300, 210);
    glow.fillStyle(PALETTE.gate, 0.1).fillEllipse(cx, gy, 230, 170);
    this.tweens.add({ targets: glow, alpha: 0.55, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const gate = this.add.graphics();
    gate.fillStyle(0x0d2a2a, 1).fillEllipse(cx, gy, 170, 150);
    gate.fillStyle(0x1d5550, 1).fillEllipse(cx, gy, 140, 124);
    gate.fillStyle(0x3d9f95, 1).fillEllipse(cx, gy, 96, 88);
    gate.fillStyle(PALETTE.gate, 1).fillEllipse(cx, gy, 52, 50);
    gate.fillStyle(0xe8fffb, 1).fillEllipse(cx, gy, 18, 18);
    gate.lineStyle(3, PALETTE.gate, 0.9).strokeEllipse(cx, gy, 170, 150);
    // Stone frame stubs and the floor line
    gate.fillStyle(PALETTE.lineLight, 1).fillRect(cx - 96, gy + 66, 26, 10).fillRect(cx + 70, gy + 66, 26, 10);
    gate.fillStyle(PALETTE.line, 1).fillRect(cx - 170, top + 182, 340, 3);
    for (let i = 0; i < 14; i++) {
      const spark = this.add.rectangle(cx - 70 + ((i * 37) % 140), gy + 40 - ((i * 23) % 60), 3, 3, i % 3 ? PALETTE.gate : 0xe8fffb, 0.9);
      this.tweens.add({ targets: spark, y: spark.y - 70, alpha: 0, duration: 1800 + (i % 5) * 300, delay: i * 180, repeat: -1 });
    }
    // The hunters, 5 screen pixels per pixel, each on a small shadow
    const g = this.add.graphics();
    const scale = 5;
    const step = 72;
    LOOKS.forEach((_, i) => {
      const hx = cx - (step * (LOOKS.length - 1)) / 2 + i * step - 25;
      const hy = top + 182 - 12 * scale;
      g.fillStyle(0x000000, 0.45).fillEllipse(hx + 25, top + 182, 44, 8);
      drawLook(g, i, hx, hy, scale);
    });
  }

  private drawSlots(x: number, y: number, w: number) {
    panel(this, x - 10, y - 10, w + 20, 40 + SAVE_SLOTS * 66, L('불러오기', 'Load'));
    for (let i = 0; i < SAVE_SLOTS; i++) {
      const s = slotInfo(i);
      button(this, x, y + 16 + i * 66, w, 56, slotLabel(i, s), () => {
        if (loadSlot(i)) this.scene.start('HQ', { messages: [L(`${i + 1}번 슬롯을 불러왔다.`, `Loaded slot ${i + 1}.`)] });
        else this.scene.restart({ note: L('그 슬롯은 읽을 수 없어요.', 'That slot could not be read.') });
      }, { size: 12, enabled: !!s });
    }
    const note = this.data_.note;
    if (note) text(this, GW / 2, y + 40 + SAVE_SLOTS * 66, note, 12, INK.red).setOrigin(0.5, 0);
    button(this, x, Math.min(GH - 80, y + 60 + SAVE_SLOTS * 66), w, 46, L('돌아가기', 'Back'), () => this.scene.restart({}), { size: 15 });
  }
}
