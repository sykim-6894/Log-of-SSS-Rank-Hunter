import * as Phaser from 'phaser';
import { buyPotion, POTION_PRICE, train, TRAINING, trainingCost } from '../core/agency';
import { combatPower, expToNext, GRADE_THRESHOLDS, gradeOf, TrainingKind, TRIBUTE_RATE } from '../core/hunter';
import { isNewAgency, persist, rng, state } from '../game/store';
import { bar, button, dots, INK, PALETTE, panel, text, title } from '../game/ui';

export interface HQData {
  messages?: string[];
}

let welcomed = false;

/** The agency office: the hunter's license, investments, the shop, the hall of fame. */
export class HQScene extends Phaser.Scene {
  private messages: string[] = [];

  constructor() {
    super('HQ');
  }

  init(data: HQData) {
    this.messages = data.messages ?? [];
    if (!welcomed && isNewAgency && this.messages.length === 0) {
      this.messages = [
        `${state.agent.name} 설립. 첫 헌터 ${state.hunter.name}와(과) 계약했다.`,
        '훈련으로 키우고, 성장의 탑에 보내 돈을 벌어오게 하자.',
      ];
    }
    welcomed = true;
  }

  private refresh(messages: string[] = this.messages) {
    persist();
    this.scene.restart({ messages });
  }

  create() {
    this.cameras.main.setBackgroundColor(PALETTE.bg);
    this.drawHeader();
    this.drawLicense(24, 96);
    this.drawTraining(24, 400);
    this.drawShop(24, 588);
    this.drawHallOfFame(488, 96);
    this.drawLog(488, 492);

    button(this, 488, 600, 448, 64, '▶  성장의 탑 입장', () => {
      persist();
      this.scene.start('Tower');
    }, { primary: true, size: 24 });

    text(this, 480, 694, '방향키·WASD 이동/공격   Q 회전베기   E 포션   Space 대기   화면 터치로도 이동', 12, INK.faint).setOrigin(0.5, 0);
  }

  private drawHeader() {
    const { agent } = state;
    title(this, 24, 18, 'SSS급 헌터의 성장기', 30, INK.text);
    text(this, 26, 58, '— 과연 너일까', 12, INK.rust);
    text(this, 936, 22, agent.name, 12, INK.quiet).setOrigin(1, 0);
    title(this, 936, 42, `운영 자금 ${agent.gold}G`, 15, INK.gold).setOrigin(1, 0);
    dots(this, 24, 82, 912);
  }

  /** The hunter as a paper license card with a stamped grade. */
  private drawLicense(x: number, y: number) {
    const h = state.hunter;
    const w = 440;
    const ht = 284;
    const power = combatPower(h);
    const grade = gradeOf(power);
    const next = [...GRADE_THRESHOLDS].reverse().find(([, min]) => min > power);

    const g = this.add.graphics();
    g.fillStyle(PALETTE.shadow, 1).fillRect(x + 4, y + 4, w, ht);
    g.fillStyle(PALETTE.paper, 1).fillRect(x, y, w, ht);
    g.lineStyle(2, PALETTE.paperLine, 1).strokeRect(x + 6, y + 6, w - 12, ht - 12);
    g.fillStyle(PALETTE.ink, 1).fillRect(x, y, w, 26);
    text(this, x + 12, y + 7, '헌터 자격증', 12, '#e6dac0', true);
    text(this, x + w - 12, y + 7, `No.${String(state.hunterNumber).padStart(4, '0')}`, 12, '#b9a98a').setOrigin(1, 0);

    // Portrait slot
    const px = x + 18;
    const py = y + 40;
    g.fillStyle(0xcfc1a3, 1).fillRect(px, py, 72, 88);
    g.lineStyle(2, PALETTE.ink, 1).strokeRect(px, py, 72, 88);
    g.fillStyle(PALETTE.ink, 1).fillRect(px + 26, py + 18, 20, 20).fillRect(px + 16, py + 44, 40, 34);

    title(this, x + 106, y + 40, h.name, 23, INK.ink);
    text(this, x + 106, y + 72, `Lv.${h.level}   경험치 ${h.exp}/${expToNext(h.level)}`, 12, INK.inkQuiet);
    text(this, x + 106, y + 92, `소속 ${state.agent.name}`, 12, INK.inkQuiet);
    text(this, x + 106, y + 112, `계약 ${state.contractGrade}급 · 상납 ${Math.round(TRIBUTE_RATE[state.contractGrade] * 100)}%`, 12, INK.inkQuiet);

    // Grade stamp
    const stamp = this.add.container(x + w - 70, y + 82).setAngle(-9);
    const sg = this.add.graphics();
    sg.lineStyle(3, 0xb8362b, 0.9).strokeRect(-40, -38, 80, 76);
    sg.lineStyle(1, 0xb8362b, 0.9).strokeRect(-35, -33, 70, 66);
    stamp.add(sg);
    stamp.add(title(this, 0, -6, grade, 45, INK.stamp).setOrigin(0.5));
    stamp.add(text(this, 0, 22, '등급', 12, INK.stamp, true).setOrigin(0.5));

    dots(this, x + 18, y + 142, w - 36, PALETTE.paperLine);
    text(this, x + 18, y + 154, `체력 ${h.hp}/${h.maxHp}`, 12, INK.ink);
    bar(this, x + 120, y + 156, 150, 8, h.hp / h.maxHp, PALETTE.hp);
    text(this, x + 18, y + 174, `마나 ${h.mp}/${h.maxMp}`, 12, INK.ink);
    bar(this, x + 120, y + 176, 150, 8, h.mp / h.maxMp, PALETTE.mp);
    text(this, x + 296, y + 154, `공격 ${h.atk}`, 12, INK.ink);
    text(this, x + 296, y + 174, `방어 ${h.def}`, 12, INK.ink);
    text(this, x + 360, y + 154, `포션 ${h.potions}`, 12, INK.ink);
    text(this, x + 360, y + 174, `${h.gold}G`, 12, INK.ink);

    dots(this, x + 18, y + 198, w - 36, PALETTE.paperLine);
    title(this, x + 18, y + 210, `전투력 ${power}`, 15, INK.ink);
    text(this, x + w - 18, y + 213, next ? `다음 ${next[0]}급까지 ${next[1] - power}` : '최고 등급', 12, INK.inkQuiet).setOrigin(1, 0);
    text(this, x + 18, y + 240, `처치 ${h.kills}  ·  최고 ${h.bestFloor}층  ·  누적 상납 ${h.totalTribute}G`, 12, INK.inkQuiet);
  }

  private drawTraining(x: number, y: number) {
    const { agent, hunter } = state;
    panel(this, x, y, 440, 172, '에이전시 투자');
    text(this, x + 426, y + 16, '운영 자금에서 지출', 12, INK.faint).setOrigin(1, 0);
    const kinds: TrainingKind[] = ['atk', 'def', 'hp', 'mp'];
    kinds.forEach((kind, i) => {
      const cost = trainingCost(hunter, kind);
      const t = TRAINING[kind];
      const bx = x + 16 + (i % 2) * 208;
      const by = y + 40 + Math.floor(i / 2) * 62;
      button(this, bx, by, 200, 52, `${t.label}  ${cost}G\n${t.describe}`, () => {
        if (train(state, kind)) this.refresh([`${t.label} 완료. ${t.describe}`]);
      }, { enabled: agent.gold >= cost });
    });
  }

  private drawShop(x: number, y: number) {
    const { hunter } = state;
    panel(this, x, y, 440, 76, '상점');
    text(this, x + 16, y + 22, '회복 포션', 12, INK.text, true);
    text(this, x + 16, y + 42, '체력 40% 회복 · 헌터 소지금으로 구매', 12, INK.quiet);
    button(this, x + 268, y + 16, 156, 44, `구매  ${POTION_PRICE}G`, () => {
      const r = buyPotion(state, rng);
      if (!r.ok) return;
      const msg = r.agentPaid > 0 ? `에이전트가 ${r.agentPaid}G를 지원했다. (헌터 부담 ${r.hunterPaid}G)` : `포션 구매. -${r.hunterPaid}G`;
      this.refresh([msg]);
    }, { enabled: hunter.gold >= POTION_PRICE });
  }

  private drawHallOfFame(x: number, y: number) {
    const w = 448;
    panel(this, x, y, w, 380, '명예의 전당');
    const cols = { rank: x + 18, grade: x + 54, name: x + 100, lv: x + 174, floor: x + 206, score: x + 252, fate: x + w - 18 };
    const hy = y + 22;
    text(this, cols.rank, hy, '순위', 12, INK.faint);
    text(this, cols.grade, hy, '등급', 12, INK.faint);
    text(this, cols.name, hy, '이름', 12, INK.faint);
    text(this, cols.lv, hy, 'Lv', 12, INK.faint);
    text(this, cols.floor, hy, '최고', 12, INK.faint);
    text(this, cols.score, hy, '점수', 12, INK.faint);
    text(this, cols.fate, hy, '최후', 12, INK.faint).setOrigin(1, 0);
    dots(this, x + 16, hy + 20, w - 32);

    if (state.hallOfFame.length === 0) {
      text(this, x + w / 2, y + 180, '아직 이름을 남긴 헌터가 없다.', 12, INK.faint).setOrigin(0.5);
      text(this, x + w / 2, y + 202, '첫 번째 전설은 누가 될까.', 12, INK.faint).setOrigin(0.5);
    }
    state.hallOfFame.forEach((e, i) => {
      const ry = hy + 32 + i * 32;
      const rankGrade = i === 0 ? 'SSS' : i < 4 ? 'SS' : 'S';
      const color = i === 0 ? INK.gold : INK.text;
      text(this, cols.rank, ry, `${i + 1}`, 12, color, true);
      text(this, cols.grade, ry, rankGrade, 12, i === 0 ? INK.gold : INK.rust, true);
      text(this, cols.name, ry, e.name, 12, color, i === 0);
      text(this, cols.lv, ry, `${e.level}`, 12, INK.quiet);
      text(this, cols.floor, ry, `${e.bestFloor}층`, 12, INK.quiet);
      text(this, cols.score, ry, `${e.score}`, 12, INK.quiet);
      text(this, cols.fate, ry, e.fate, 12, INK.faint).setOrigin(1, 0);
      if (i < state.hallOfFame.length - 1) dots(this, x + 16, ry + 22, w - 32, PALETTE.dim);
    });
  }

  private drawLog(x: number, y: number) {
    panel(this, x, y, 448, 88, '업무 일지');
    const lines = this.messages.slice(-3);
    if (lines.length === 0) text(this, x + 18, y + 22, '특이사항 없음.', 12, INK.faint);
    lines.forEach((m, i) => text(this, x + 18, y + 20 + i * 20, `· ${m}`, 12, i === 0 ? INK.text : INK.quiet));
  }
}
