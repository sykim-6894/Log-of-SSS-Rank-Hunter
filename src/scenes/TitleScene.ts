import * as Phaser from 'phaser';
import { SAVE_SLOTS } from '../core/save';
import { GH, GW, PORTRAIT } from '../game/layout';
import { slotLabel } from '../game/slots';
import { hadGame, loadSlot, resetGame, slotInfo, takeSkipTitle } from '../game/store';
import { button, dots, INK, PALETTE, panel, text, title } from '../game/ui';

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
    this.cameras.main.setBackgroundColor(PALETTE.bg);
    const w = Math.min(GW - 40, 420);
    const x = (GW - w) / 2;
    const top = PORTRAIT ? 150 : 90;
    title(this, GW / 2, top, 'SSS급 헌터의 성장기', PORTRAIT ? 28 : 36, INK.text).setOrigin(0.5, 0);
    text(this, GW / 2, top + (PORTRAIT ? 44 : 54), '— 과연 너일까', 14, INK.rust).setOrigin(0.5, 0);
    dots(this, x, top + (PORTRAIT ? 78 : 92), w);
    const by = top + (PORTRAIT ? 104 : 120);

    if (this.data_.loading) return this.drawSlots(x, by, w);

    const going = hadGame();
    button(this, x, by, w, 54, '이어하기', () => this.scene.start('HQ'), { primary: true, size: 18, enabled: going });
    const armed = !!this.data_.armNew;
    button(this, x, by + 66, w, 54, armed ? '정말 새로 시작할까요? (한 번 더 누르기)' : '새로 시작하기', () => {
      if (going && !armed) return this.scene.restart({ armNew: true });
      resetGame();
      this.scene.start('HQ');
    }, { size: armed ? 14 : 18 });
    const anySaved = Array.from({ length: SAVE_SLOTS }, (_, i) => slotInfo(i)).some((s) => !!s);
    button(this, x, by + 132, w, 54, '불러오기', () => this.scene.restart({ loading: true }), { size: 18, enabled: anySaved });
    const note = armed
      ? '진행 중인 게임은 사라집니다. 저장 슬롯에 남긴 기록은 그대로예요.'
      : anySaved ? '불러오기: 본부 [설정]에서 저장해 둔 슬롯을 엽니다.' : '본부 [설정]에서 슬롯 3개에 따로 저장할 수 있어요.';
    text(this, GW / 2, by + 200, this.data_.note ?? note, 12, armed ? INK.red : INK.faint)
      .setOrigin(0.5, 0).setWordWrapWidth(w, true).setAlign('center');
  }

  private drawSlots(x: number, y: number, w: number) {
    panel(this, x - 10, y - 10, w + 20, 40 + SAVE_SLOTS * 66, '불러오기');
    for (let i = 0; i < SAVE_SLOTS; i++) {
      const s = slotInfo(i);
      button(this, x, y + 16 + i * 66, w, 56, slotLabel(i, s), () => {
        if (loadSlot(i)) this.scene.start('HQ', { messages: [`${i + 1}번 슬롯을 불러왔다.`] });
        else this.scene.restart({ note: '그 슬롯은 읽을 수 없어요.' });
      }, { size: 12, enabled: !!s });
    }
    const note = this.data_.note;
    if (note) text(this, GW / 2, y + 40 + SAVE_SLOTS * 66, note, 12, INK.red).setOrigin(0.5, 0);
    button(this, x, Math.min(GH - 80, y + 60 + SAVE_SLOTS * 66), w, 46, '돌아가기', () => this.scene.restart({}), { size: 15 });
  }
}
