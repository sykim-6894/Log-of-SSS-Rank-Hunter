import * as Phaser from 'phaser';
import { activeHunter, buyItem, gradeIn, hire, ranking, release, SLOT_COUNT, train, TRAINING, trainingCost } from '../core/agency';
import { combatPower, expToNext, GRADE_THRESHOLDS, rankGradeOf, TrainingKind, TRIBUTE_RATE } from '../core/hunter';
import { BAG_MAX, CONSUMABLE_KINDS, CONSUMABLES, ConsumableKind, describeGear, GEAR_SLOT_NAMES, GEAR_SLOTS } from '../core/items';
import { isNewAgency, persist, rng, state } from '../game/store';
import { GH, GW, layoutStale, PORTRAIT } from '../game/layout';
import { bar, button, dots, INK, PALETTE, panel, text, title } from '../game/ui';

export interface HQData {
  messages?: string[];
  /** Second click on 방출 confirms the release. */
  armRelease?: boolean;
}

let welcomed = false;

/** Portrait only: the office is split into tabs along the bottom. */
type Tab = 'hunter' | 'shop' | 'ranking' | 'rival' | 'log';
const TABS: Array<[Tab, string]> = [
  ['hunter', '헌터'],
  ['shop', '가방'],
  ['ranking', '순위'],
  ['rival', '라이벌'],
  ['log', '일지'],
];
let tab: Tab = 'hunter';

/** Shortens a one-line text with an ellipsis until it fits the width. */
function fit(t: Phaser.GameObjects.Text, width: number) {
  let value = t.text;
  while (t.width > width && value.length > 1) {
    value = value.slice(0, -1);
    t.setText(`${value}…`);
  }
  return t;
}

/** The agency office: the hunter's license, investments, the shop, the hall of fame. */
export class HQScene extends Phaser.Scene {
  private messages: string[] = [];
  private releaseArmed = false;

  constructor() {
    super('HQ');
  }

  init(data: HQData) {
    this.messages = data.messages ?? [];
    this.releaseArmed = !!data.armRelease;
    if (!welcomed && isNewAgency && this.messages.length === 0) {
      this.messages = [
        `${state.agent.name} 설립. 첫 헌터 ${activeHunter(state)!.name}와(과) 계약했다.`,
        '훈련으로 키우고, 성장의 탑에 보내 돈을 벌어오게 하자.',
      ];
    }
    welcomed = true;
  }

  private refresh(messages: string[] = this.messages, armRelease = false) {
    persist();
    this.scene.restart({ messages, armRelease });
  }

  create() {
    if (layoutStale()) {
      // The device was rotated during a run: switch layouts now that everything is saved.
      persist();
      location.reload();
      return;
    }
    this.cameras.main.setBackgroundColor(PALETTE.bg);
    if (PORTRAIT) return this.createPortrait();
    this.drawHeader();
    this.drawSlots(24, 94);
    this.drawLicense(24, 146);
    this.drawTraining(24, 418);
    this.drawShop(24, 590);
    this.drawRanking(488, 100);
    this.drawRival(488, 442);
    this.drawLog(488, 530);

    button(this, 488, 618, 448, 58, '▶  성장의 탑 입장', () => {
      persist();
      this.scene.start('Tower');
    }, { primary: true, size: 24, enabled: !!activeHunter(state) });

    text(this, 480, 698, '방향키·WASD 이동/공격   Q 회전베기   E·R·F 물약   B 가방   Space 대기', 12, INK.faint).setOrigin(0.5, 0);
  }

  private createPortrait() {
    const { agent } = state;
    const x = 14;
    const w = GW - 28;
    title(this, x, 12, 'SSS급 헌터의 성장기', 20, INK.text);
    text(this, x + 2, 38, '— 과연 너일까', 12, INK.rust);
    text(this, GW - x, 12, agent.name, 12, INK.quiet).setOrigin(1, 0);
    title(this, GW - x, 32, `${agent.gold}G`, 15, INK.gold).setOrigin(1, 0);
    dots(this, x, 60, w);
    this.drawSlots(x, 70, w);

    const top = 132;
    const tabsY = GH - 66;
    const departY = tabsY - 70;
    if (tab === 'hunter') {
      this.drawLicense(x, top, w);
      this.drawTraining(x, top + 278, w);
    } else if (tab === 'shop') {
      this.drawBag(x, top + 8, w);
    } else if (tab === 'ranking') {
      this.drawRanking(x, top + 8, w);
    } else if (tab === 'rival') {
      this.drawRival(x, top + 8, w);
    } else {
      this.drawLog(x, top + 8, w, Math.min(12, Math.floor((departY - top - 70) / 40)), true);
    }

    // Latest news above the depart button, unless the log tab already shows it.
    if (this.messages.length && tab !== 'log') {
      fit(text(this, x, departY - 26, `· ${this.messages[0]}`, 12, INK.text), w);
    }
    button(this, x, departY, w, 56, '▶  성장의 탑 입장', () => {
      persist();
      this.scene.start('Tower');
    }, { primary: true, size: 20, enabled: !!activeHunter(state) });

    const g = this.add.graphics();
    g.fillStyle(PALETTE.panelDark, 1).fillRect(0, tabsY, GW, GH - tabsY);
    g.fillStyle(PALETTE.line, 1).fillRect(0, tabsY, GW, 2);
    const tw = GW / TABS.length;
    TABS.forEach(([id, label], i) => {
      const on = id === tab;
      if (on) g.fillStyle(PALETTE.panel, 1).fillRect(i * tw, tabsY + 2, tw, GH - tabsY).fillStyle(PALETTE.rustLight, 1).fillRect(i * tw, tabsY, tw, 3);
      text(this, i * tw + tw / 2, tabsY + 24, label, 12, on ? INK.rust : INK.faint, on).setOrigin(0.5, 0);
      if (!on) {
        this.add.zone(i * tw, tabsY, tw, GH - tabsY).setOrigin(0).setInteractive({ useHandCursor: true }).on('pointerup', () => {
          tab = id;
          this.scene.restart({ messages: this.messages });
        });
      }
    });
  }

  private drawHeader() {
    const { agent } = state;
    title(this, 24, 18, 'SSS급 헌터의 성장기', 30, INK.text);
    text(this, 26, 58, '— 과연 너일까', 12, INK.rust);
    text(this, 936, 22, agent.name, 12, INK.quiet).setOrigin(1, 0);
    title(this, 936, 42, `운영 자금 ${agent.gold}G`, 15, INK.gold).setOrigin(1, 0);
    dots(this, 24, 82, 912);
  }

  /** Three hunter slots, like save slots. Empty ones hire a new hunter. */
  private drawSlots(x: number, y: number, total = 440) {
    const w = (total - 2 * 10) / SLOT_COUNT;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const h = state.slots[i];
      const bx = x + i * (w + 10);
      if (h) {
        button(this, bx, y, w, 44, `${h.name}\n${gradeIn(state, h)}급 · Lv.${h.level}`, () => {
          state.activeSlot = i;
          this.refresh();
        }, { primary: i === state.activeSlot });
      } else {
        button(this, bx, y, w, 44, '+ 새 헌터 고용', () => {
          const n = hire(state, rng, i);
          if (n) this.refresh([`새 헌터 ${n.name}와(과) 계약했다.`]);
        });
      }
    }
  }

  /** The active hunter as a paper license card with a stamped grade. */
  private drawLicense(x: number, y: number, w = 440) {
    const h = activeHunter(state);
    if (!h) return;
    const ht = 258;
    const power = combatPower(h);
    const grade = gradeIn(state, h);
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
    text(this, x + 106, y + 112, `계약 ${h.contractGrade}급 · 상납 ${Math.round(TRIBUTE_RATE[h.contractGrade] * 100)}%`, 12, INK.inkQuiet);

    // Grade stamp
    const stamp = this.add.container(x + w - 70, y + 82).setAngle(-9);
    const sg = this.add.graphics();
    sg.lineStyle(3, 0xb8362b, 0.9).strokeRect(-40, -38, 80, 76);
    sg.lineStyle(1, 0xb8362b, 0.9).strokeRect(-35, -33, 70, 66);
    stamp.add(sg);
    stamp.add(title(this, 0, -6, grade, grade.length > 1 ? 30 : 45, INK.stamp).setOrigin(0.5));
    stamp.add(text(this, 0, 22, '등급', 12, INK.stamp, true).setOrigin(0.5));

    dots(this, x + 18, y + 136, w - 36, PALETTE.paperLine);
    text(this, x + 18, y + 146, `체력 ${h.hp}/${h.maxHp}`, 12, INK.ink);
    bar(this, x + 120, y + 148, w - 290, 8, h.hp / h.maxHp, PALETTE.hp);
    text(this, x + 18, y + 166, `마나 ${h.mp}/${h.maxMp}`, 12, INK.ink);
    bar(this, x + 120, y + 168, w - 290, 8, h.mp / h.maxMp, PALETTE.mp);
    const sx = x + w - 144;
    text(this, sx, y + 146, `공격 ${h.atk}`, 12, INK.ink);
    text(this, sx, y + 166, `방어 ${h.def}`, 12, INK.ink);
    text(this, sx + 64, y + 146, `물약 ${h.bag.hp + h.bag.mp + h.bag.guard}`, 12, INK.ink);
    text(this, sx + 64, y + 166, `${h.gold}G`, 12, INK.ink);

    dots(this, x + 18, y + 188, w - 36, PALETTE.paperLine);
    title(this, x + 18, y + 198, `전투력 ${power}`, 15, INK.ink);
    text(this, x + w - 18, y + 201, next ? `다음 ${next[0]}급까지 ${next[1] - power}` : '최고 등급', 12, INK.inkQuiet).setOrigin(1, 0);
    const extras = [h.rescues ? `위기 지원 ${h.rescues}` : '', h.skillPower > 1.5 ? `회전베기 ×${h.skillPower}` : ''].filter(Boolean).join(' · ');
    fit(text(this, x + 18, y + 228, `처치 ${h.kills} · 최고 ${h.bestFloor}층 · 상납 ${h.totalTribute}G` + (extras ? ` · ${extras}` : ''), 12, INK.inkQuiet), w - 120);
    const others = state.slots.filter(Boolean).length > 1;
    button(this, x + w - 86, y + 222, 70, 26, this.releaseArmed ? '정말?' : '방출', () => {
      if (!this.releaseArmed) {
        this.refresh(['방출하면 경쟁사로 가서 언젠가 적으로 만날 수 있다. 한 번 더 누르면 방출.'], true);
        return;
      }
      const gone = release(state, state.activeSlot);
      if (gone) this.refresh([`${gone.name}을(를) 방출했다. ${state.rival.name}이(가) 데려갔다.`]);
    }, { enabled: others });
  }

  private drawTraining(x: number, y: number, w = 440) {
    const { agent } = state;
    const hunter = activeHunter(state);
    if (!hunter) return;
    const bw = (w - 40) / 2;
    panel(this, x, y, w, 158, '에이전시 투자');
    text(this, x + w - 14, y + 16, '운영 자금에서 지출', 12, INK.faint).setOrigin(1, 0);
    const kinds: TrainingKind[] = ['atk', 'def', 'hp', 'mp'];
    kinds.forEach((kind, i) => {
      const cost = trainingCost(hunter, kind);
      const t = TRAINING[kind];
      const bx = x + 16 + (i % 2) * (bw + 8);
      const by = y + 36 + Math.floor(i / 2) * 56;
      button(this, bx, by, bw, 48, `${t.label}  ${cost}G\n${t.describe}`, () => {
        if (train(state, kind)) this.refresh([`${t.label} 완료. ${t.describe}`]);
      }, { enabled: agent.gold >= cost });
    });
  }

  private buy(kind: ConsumableKind) {
    const r = buyItem(state, rng, kind);
    if (!r.ok) return;
    const name = CONSUMABLES[kind].name;
    const msg = r.agentPaid > 0 ? `${name}: 에이전트가 ${r.agentPaid}G를 지원했다. (헌터 부담 ${r.hunterPaid}G)` : `${name} 구매. -${r.hunterPaid}G`;
    this.refresh([msg]);
  }

  private canBuy(kind: ConsumableKind) {
    const h = activeHunter(state);
    const price = CONSUMABLES[kind].price;
    return !!h && price !== undefined && h.gold >= price && h.bag[kind] < BAG_MAX;
  }

  /** Landscape: gear and potions on one line each, with the two potions for sale. */
  private drawShop(x: number, y: number, w = 440) {
    const h = activeHunter(state);
    if (!h) return;
    panel(this, x, y, w, 76, '가방 · 상점');
    const gear = GEAR_SLOTS.map((slot) => `${GEAR_SLOT_NAMES[slot]} ${h.gear[slot]?.name ?? '-'}`).join(' · ');
    fit(text(this, x + 16, y + 22, gear, 12, INK.text), w - 220);
    text(this, x + 16, y + 44, `물약 체력 ${h.bag.hp} · 마나 ${h.bag.mp} · 무적 ${h.bag.guard}`, 12, INK.quiet);
    (['hp', 'mp'] as const).forEach((kind, i) => {
      const c = CONSUMABLES[kind];
      button(this, x + w - 196 + i * 92, y + 16, 86, 44, `${c.name.slice(0, 2)} 물약\n${c.price}G`, () => this.buy(kind), { enabled: this.canBuy(kind) });
    });
  }

  /** Portrait bag tab: worn gear, then potions with their shop buttons. */
  private drawBag(x: number, y: number, w: number) {
    const h = activeHunter(state);
    if (!h) return;
    panel(this, x, y, w, 148, '장비');
    text(this, x + w - 16, y + 14, '더 좋은 장비를 얻으면 바꿔 낌', 12, INK.faint).setOrigin(1, 0);
    GEAR_SLOTS.forEach((slot, i) => {
      const g = h.gear[slot];
      const ry = y + 40 + i * 34;
      text(this, x + 16, ry, GEAR_SLOT_NAMES[slot], 12, INK.quiet);
      text(this, x + 76, ry, g ? g.name : '없음', 12, g ? INK.text : INK.faint, !!g);
      if (g) text(this, x + w - 16, ry, describeGear(g), 12, INK.gate).setOrigin(1, 0);
    });

    const py = y + 172;
    panel(this, x, py, w, 40 + CONSUMABLE_KINDS.length * 56, '물약 · 상점');
    text(this, x + w - 16, py + 14, `헌터 소지금 ${h.gold}G`, 12, INK.gold).setOrigin(1, 0);
    CONSUMABLE_KINDS.forEach((kind, i) => {
      const c = CONSUMABLES[kind];
      const ry = py + 36 + i * 56;
      text(this, x + 16, ry + 4, `${c.name}  ${h.bag[kind]}/${BAG_MAX}`, 12, INK.text, true);
      text(this, x + 16, ry + 24, c.describe, 12, INK.quiet);
      if (c.price !== undefined) {
        button(this, x + w - 126, ry, 110, 44, `구매 ${c.price}G`, () => this.buy(kind), { enabled: this.canBuy(kind) });
      } else {
        text(this, x + w - 16, ry + 14, '보물상자에서만', 12, INK.faint).setOrigin(1, 0);
      }
    });
  }

  /** Live association ranking: ours, the rival agency's, the fallen, and established rankers. */
  private drawRanking(x: number, y: number, w = 448) {
    panel(this, x, y, w, 326, '헌터 순위 · 명예의 전당');
    const cols = { rank: x + 18, grade: x + 50, name: x + 92, lv: x + 162, floor: x + 196, score: x + 238, note: x + w - 18 };
    const hy = y + 20;
    text(this, cols.rank, hy, '#', 12, INK.faint);
    text(this, cols.grade, hy, '등급', 12, INK.faint);
    text(this, cols.name, hy, '이름', 12, INK.faint);
    text(this, cols.lv, hy, 'Lv', 12, INK.faint);
    text(this, cols.floor, hy, '층', 12, INK.faint);
    text(this, cols.score, hy, '점수', 12, INK.faint);
    text(this, cols.note, hy, '소속 · 최후', 12, INK.faint).setOrigin(1, 0);
    dots(this, x + 16, hy + 18, w - 32);
    const color = { ours: INK.gate, rival: '#d79bff', gone: INK.faint, world: INK.quiet } as const;
    ranking(state).forEach((r, i) => {
      const ry = hy + 28 + i * 26;
      const c = color[r.status];
      const g = rankGradeOf(i)!;
      text(this, cols.rank, ry, `${i + 1}`, 12, i === 0 ? INK.gold : INK.quiet, true);
      text(this, cols.grade, ry, g, 12, i === 0 ? INK.gold : INK.rust, true);
      text(this, cols.name, ry, r.name, 12, c, r.status === 'ours');
      text(this, cols.lv, ry, `${r.level}`, 12, INK.quiet);
      text(this, cols.floor, ry, `${r.bestFloor}`, 12, INK.quiet);
      text(this, cols.score, ry, `${r.score}`, 12, INK.quiet);
      text(this, cols.note, ry, r.note, 12, r.status === 'gone' ? INK.faint : c).setOrigin(1, 0);
    });
    const gone = state.hallOfFame.length;
    if (gone > 0) text(this, x + w - 18, y + 304, `기록으로 남은 헌터 ${gone}명`, 12, INK.faint).setOrigin(1, 0);
  }

  private drawRival(x: number, y: number, w = 448) {
    const { rival } = state;
    panel(this, x, y, w, 72, '경쟁 에이전시');
    const former = rival.roster.filter((h) => h.origin !== 'rival').length;
    title(this, x + 18, y + 18, rival.name, 15, '#d79bff');
    text(this, x + w - 18, y + 20, `옛 동료 ${former}명 · 라이벌 ${rival.roster.length - former}명`, 12, INK.quiet).setOrigin(1, 0);
    const me = activeHunter(state);
    const mine = me && rival.roster.find((h) => h.origin === 'rival' && h.rivalOf === me.id);
    const line = mine
      ? `${me!.name}의 라이벌: ${mine.name} · 전투력 ${combatPower(mine)} (${gradeIn(state, mine)}급)`
      : '우리 헌터가 S급이 되면 라이벌을 내세운다.';
    fit(text(this, x + 18, y + 44, line, 12, mine ? INK.text : INK.faint), w - 36);
  }

  private drawLog(x: number, y: number, w = 448, count = 3, wrap = false) {
    const lines = this.messages.slice(0, count);
    if (!wrap) {
      panel(this, x, y, w, 76, '업무 일지');
      if (lines.length === 0) text(this, x + 18, y + 22, '특이사항 없음.', 12, INK.faint);
      lines.forEach((m, i) => fit(text(this, x + 18, y + 16 + i * 18, `· ${m}`, 12, i === 0 ? INK.text : INK.quiet), w - 36));
      return;
    }
    // Portrait log tab: wrapped lines in a panel that grows to fit them.
    const box = panel(this, x, y, w, 10, '업무 일지');
    let ly = y + 20;
    if (lines.length === 0) {
      text(this, x + 18, ly, '특이사항 없음.', 12, INK.faint);
      ly += 20;
    }
    lines.forEach((m, i) => {
      const t = text(this, x + 18, ly, `· ${m}`, 12, i === 0 ? INK.text : INK.quiet).setWordWrapWidth(w - 36, true);
      ly += t.height + 6;
    });
    box.destroy();
    this.children.sendToBack(panel(this, x, y, w, ly - y + 12, '업무 일지'));
  }
}
