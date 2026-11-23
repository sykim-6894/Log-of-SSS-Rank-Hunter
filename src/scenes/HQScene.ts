import * as Phaser from 'phaser';
import { buyPotion, POTION_PRICE, train, TRAINING, trainingCost } from '../core/agency';
import { combatPower, GRADE_THRESHOLDS, gradeOf, TrainingKind, TRIBUTE_RATE } from '../core/hunter';
import { isNewAgency, persist, rng, state } from '../game/store';
import { bar, button, COLORS, panel, text } from '../game/ui';

export interface HQData {
  messages?: string[];
}

let welcomed = false;

/** The agency headquarters: see the hunter, invest, shop, and send them into the tower. */
export class HQScene extends Phaser.Scene {
  private messages: string[] = [];

  constructor() {
    super('HQ');
  }

  init(data: HQData) {
    this.messages = data.messages ?? [];
    if (!welcomed && isNewAgency && this.messages.length === 0) {
      this.messages = [
        `${state.agent.name}을(를) 설립했다. 첫 헌터 ${state.hunter.name}와(과) 계약했다.`,
        '훈련으로 헌터를 키우고, 성장의 탑에 보내 돈을 벌어오게 하자.',
      ];
    }
    welcomed = true;
  }

  private refresh(messages: string[] = this.messages) {
    persist();
    this.scene.restart({ messages });
  }

  create() {
    const { agent, hunter } = state;
    this.cameras.main.setBackgroundColor(COLORS.bg);

    // Header
    text(this, 24, 18, 'SSS급 헌터의 성장기', 26, COLORS.text, true);
    text(this, 24, 54, '과연 너일까', 15, COLORS.quiet);
    text(this, 936, 22, agent.name, 18, COLORS.text, true).setOrigin(1, 0);
    text(this, 936, 50, `에이전시 자금 ${agent.gold}G`, 17, '#f2c14e').setOrigin(1, 0);

    // Hunter card
    panel(this, 24, 88, 440, 300);
    const power = combatPower(hunter);
    const grade = gradeOf(power);
    const next = [...GRADE_THRESHOLDS].reverse().find(([, min]) => min > power);
    text(this, 44, 104, `${hunter.name}`, 22, COLORS.text, true);
    text(this, 444, 106, `${grade}급`, 22, '#4f8cff', true).setOrigin(1, 0);
    text(this, 44, 138, `${state.hunterNumber}번째 헌터 · Lv.${hunter.level} · 경험치 ${hunter.exp}/${20 * hunter.level}`, 14, COLORS.quiet);

    text(this, 44, 168, `체력 ${hunter.hp}/${hunter.maxHp}`, 14);
    bar(this, 160, 172, 284, 10, hunter.hp / hunter.maxHp, COLORS.danger);
    text(this, 44, 192, `마나 ${hunter.mp}/${hunter.maxMp}`, 14);
    bar(this, 160, 196, 284, 10, hunter.mp / hunter.maxMp, COLORS.mana);

    text(this, 44, 222, `공격 ${hunter.atk}   방어 ${hunter.def}   포션 ${hunter.potions}개   헌터 소지금 ${hunter.gold}G`, 15);
    text(this, 44, 250, `전투력 ${power}` + (next ? `  (다음 ${next[0]}급까지 ${next[1] - power})` : ''), 15, COLORS.text, true);
    text(this, 44, 278, `계약 ${state.contractGrade}급 · 상납 비율 ${Math.round(TRIBUTE_RATE[state.contractGrade] * 100)}%`, 14, COLORS.quiet);
    text(this, 44, 302, `처치 ${hunter.kills}마리 · 최고 ${hunter.bestFloor}층 · 누적 상납 ${hunter.totalTribute}G`, 14, COLORS.quiet);
    text(this, 44, 342, '등급은 전투력으로 정해지고, 귀환할 때 재계약합니다.', 13, COLORS.quiet);

    // Training (agent money)
    panel(this, 24, 400, 440, 170);
    text(this, 44, 414, '에이전시 투자 (훈련)', 17, COLORS.text, true);
    text(this, 444, 418, '에이전시 자금 사용', 13, COLORS.quiet).setOrigin(1, 0);
    const kinds: TrainingKind[] = ['atk', 'def', 'hp', 'mp'];
    kinds.forEach((kind, i) => {
      const cost = trainingCost(hunter, kind);
      const t = TRAINING[kind];
      const x = 44 + (i % 2) * 206;
      const y = 448 + Math.floor(i / 2) * 58;
      button(this, x, y, 194, 48, `${t.label} ${cost}G\n${t.describe}`, () => {
        if (train(state, kind)) this.refresh([`${t.label} 완료: ${t.describe}`]);
      }, { enabled: agent.gold >= cost, size: 14 });
    });

    // Shop (hunter money)
    panel(this, 24, 582, 440, 76);
    text(this, 44, 596, '상점', 17, COLORS.text, true);
    text(this, 44, 624, `포션: 체력 40% 회복`, 13, COLORS.quiet);
    button(this, 284, 598, 160, 44, `포션 구매 ${POTION_PRICE}G`, () => {
      const r = buyPotion(state, rng);
      if (!r.ok) return;
      const msg = r.agentPaid > 0 ? `에이전트가 ${r.agentPaid}G를 지원해줬다! (헌터 부담 ${r.hunterPaid}G)` : `포션을 샀다. (-${r.hunterPaid}G)`;
      this.refresh([msg]);
    }, { enabled: hunter.gold >= POTION_PRICE });

    // Hall of fame
    panel(this, 488, 88, 448, 400);
    text(this, 508, 104, '명예의 전당', 20, COLORS.text, true);
    if (state.hallOfFame.length === 0) {
      text(this, 508, 144, '아직 기록된 헌터가 없습니다.', 15, COLORS.quiet);
    }
    state.hallOfFame.forEach((e, i) => {
      const y = 140 + i * 33;
      const rankGrade = i === 0 ? 'SSS' : i < 4 ? 'SS' : 'S';
      text(this, 508, y, `${i + 1}`, 15, i === 0 ? '#f2c14e' : COLORS.quiet, true);
      text(this, 536, y, `${e.name}`, 15, COLORS.text, true);
      text(this, 620, y, `${rankGrade}급 · Lv.${e.level} · ${e.bestFloor}층 · ${e.score}점`, 14, COLORS.quiet);
      text(this, 916, y, e.fate, 12, COLORS.quiet).setOrigin(1, 0);
    });

    // Messages
    panel(this, 488, 500, 448, 86);
    this.messages.slice(-3).forEach((m, i) => text(this, 504, 512 + i * 22, m, 14, i === 0 ? COLORS.text : COLORS.quiet));

    // Depart
    button(this, 488, 598, 448, 60, '성장의 탑 입장', () => {
      persist();
      this.scene.start('Tower');
    }, { primary: true, size: 20 });

    text(this, 480, 690, '방향키/WASD 이동·공격 · Q 회전베기 · E 포션 · Space 대기 · 화면을 눌러도 이동', 13, COLORS.quiet).setOrigin(0.5, 0);
  }
}
