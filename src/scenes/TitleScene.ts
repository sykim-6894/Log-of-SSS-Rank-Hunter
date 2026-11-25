import * as Phaser from 'phaser';
import { SAVE_SLOTS } from '../core/save';
import { GH, GW, PORTRAIT } from '../game/layout';
import { slotLabel } from '../game/slots';
import { hadGame, loadSlot, resetGame, slotInfo, takeSkipTitle } from '../game/store';
import { button, dots, INK, PALETTE, panel, text, title } from '../game/ui';
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
    this.cameras.main.setBackgroundColor(PALETTE.bg);
    const w = Math.min(GW - 40, 420);
    const x = (GW - w) / 2;
    const top = PORTRAIT ? 150 : 90;
    title(this, GW / 2, top, L('주인공을 찾습니다', 'Wanted: The Protagonist'), PORTRAIT ? 28 : 36, INK.text).setOrigin(0.5, 0);
    text(this, GW / 2, top + (PORTRAIT ? 44 : 54), L('— SSS급 헌터 에이전시', '— SSS-Rank Hunter Agency'), 14, INK.rust).setOrigin(0.5, 0);
    dots(this, x, top + (PORTRAIT ? 78 : 92), w);
    const by = top + (PORTRAIT ? 104 : 120);

    if (this.data_.loading) return this.drawSlots(x, by, w);

    const going = hadGame();
    button(this, x, by, w, 54, L('이어하기', 'Continue'), () => this.scene.start('HQ'), { primary: true, size: 18, enabled: going });
    const armed = !!this.data_.armNew;
    button(this, x, by + 66, w, 54, armed ? L('정말 새로 시작할까요? (한 번 더 누르기)', 'Really start over? (tap again)') : L('새로 시작하기', 'New Game'), () => {
      if (going && !armed) return this.scene.restart({ armNew: true });
      resetGame();
      this.scene.start('HQ');
    }, { size: armed ? 14 : 18 });
    const anySaved = Array.from({ length: SAVE_SLOTS }, (_, i) => slotInfo(i)).some((s) => !!s);
    button(this, x, by + 132, w, 54, L('불러오기', 'Load'), () => this.scene.restart({ loading: true }), { size: 18, enabled: anySaved });
    const note = armed
      ? L('진행 중인 게임은 사라집니다. 저장 슬롯에 남긴 기록은 그대로예요.', 'The game in progress will be lost. Save slots are kept.')
      : anySaved ? L('불러오기: 본부 [설정]에서 저장해 둔 슬롯을 엽니다.', 'Load: opens a slot saved from [Settings] at HQ.') : L('본부 [설정]에서 슬롯 3개에 따로 저장할 수 있어요.', 'You can save to 3 slots from [Settings] at HQ.');
    text(this, GW / 2, by + 200, this.data_.note ?? note, 12, armed ? INK.red : INK.faint)
      .setOrigin(0.5, 0).setWordWrapWidth(w, true).setAlign('center');
    // Language, so a first visit in the wrong one is one tap away.
    const other: Lang = lang() === 'en' ? 'ko' : 'en';
    button(this, GW / 2 - 70, GH - 70, 140, 36, other === 'en' ? 'English' : '한국어', () => {
      localStorage.setItem(LANG_KEY, other);
      location.reload();
    }, { size: 13 });
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
