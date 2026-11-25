import * as Phaser from 'phaser';
import { activeHunter, AGENCY_NAME_MAX, buyItem, canChallenge, drawGear, nextChallenge, startDuel, EnhanceResult, enhanceChance, enhanceCost, enhanceGear, enhanceRisk, failOdds, GachaResult, changeClass, foundAgency, randomAgencyName, refreshGates, gradeIn, hire, ranking, release, SLOT_COUNT, startFloors, train, TRAINING, trainingCost, untouched } from '../core/agency';
import { ClassId, CLASS_IDS, CLASSES, firstSkillChoices, SkillId, SKILLS } from '../core/classes';
import { Gate, gateClearGold, gateClearStones, gateFloors, gateLevel, gateName, GATE_RULES, GATE_THEMES } from '../core/gates';
import { MONSTERS, TOP_FLOOR } from '../core/monsters';
import { combatPower, expToNext, Hunter, GRADE_THRESHOLDS, rankGradeOf, TrainingKind, TRIBUTE_RATE } from '../core/hunter';
import { BAG_MAX, CONSUMABLE_KINDS, CONSUMABLES, ConsumableKind, describeGear, GACHA_ODDS, GACHA_PRICE, GACHA_REFUND, gachaLabel, gearLabel, GEAR_SLOT_NAMES, GEAR_SLOTS, makeGear, MAX_PLUS } from '../core/items';
import { DOLL_H, drawGearIcon, drawPaperDoll, gearDiff, tierColor } from '../game/paperdoll';
import { drawLook, lookOf } from '../game/looks';
import { sfx, soundOn, toggleSound } from '../game/sfx';
import { moveControl, setMoveControl } from '../game/controls';
import { persist, rng, saveSlot, skipTitleOnce, slotInfo, state, takeWelcome } from '../game/store';
import { SAVE_SLOTS } from '../core/save';
import { slotLabel } from '../game/slots';
import { Rng } from '../core/rng';
import { GH, GW, layoutStale, PORTRAIT } from '../game/layout';
import { bar, button, dots, FONT, INK, PALETTE, panel, text, title } from '../game/ui';

export interface HQData {
  messages?: string[];
  /** Second click on 방출 confirms the release. */
  armRelease?: boolean;
  /** Show the start floor choices instead of the depart button. */
  pickStart?: boolean;
  /** Hiring screen: the slot being filled, and whether it re-signs an untouched hunter in another class. */
  hire?: { slot: number; change?: boolean; cls?: ClassId; skills?: SkillId[] };
  /** Show the board of open gates. */
  gates?: boolean;
  /** Show the gear draw, with the last result if there is one. */
  gacha?: { result?: GachaResult };
  /** Show the settings screen. */
  settings?: boolean;
  /** Show the gear enhancement screen, with the last try if there is one. */
  enhance?: { result?: EnhanceResult };
}


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
/** Landscape only: show the gear doll where the ranking usually is. */
let showGear = false;

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
  private pickingStart = false;
  private hiring?: HQData['hire'];
  private showingGates = false;
  private gacha?: HQData['gacha'];
  private settings = false;
  /** Save slot waiting for a second press to be overwritten. */
  private armSave?: number;
  private enhancing?: HQData['enhance'];

  constructor() {
    super('HQ');
  }

  init(data: HQData) {
    this.messages = data.messages ?? [];
    this.releaseArmed = !!data.armRelease;
    this.pickingStart = !!data.pickStart;
    this.hiring = data.hire;
    this.showingGates = !!data.gates;
    this.gacha = data.gacha;
    this.settings = !!data.settings;
    this.enhancing = data.enhance;
    // The welcome waits until the agency has a name.
    if (state.agent.named === false) return;
    if (takeWelcome() && this.messages.length === 0) {
      this.messages = [
        `${state.agent.name} 설립. 첫 헌터 ${activeHunter(state)!.name}와(과) 계약했다.`,
        '훈련으로 키우고, 성장의 탑에 보내 돈을 벌어오게 하자.',
        '첫 탑에 가기 전에는 자격증의 [직업 바꾸기]로 직업을 다시 고를 수 있다.',
      ];
    }
  }

  private refresh(messages: string[] = this.messages, armRelease = false) {
    persist();
    this.scene.restart({ messages, armRelease });
  }

  create() {
    if (layoutStale()) {
      // The device was rotated during a run: switch layouts now that everything is saved.
      persist();
      skipTitleOnce();
      location.reload();
      return;
    }
    if (state.run) {
      // A tower run was going on when the game closed: pick it up again.
      this.scene.start('Tower');
      return;
    }
    this.cameras.main.setBackgroundColor(PALETTE.bg);
    if (state.agent.named === false) return this.drawFounding();
    if (!state.gates) refreshGates(state, rng);
    if (this.hiring) return this.drawHiring(this.hiring);
    if (this.showingGates) return this.drawGates();
    if (this.settings) return this.drawSettings();
    if (this.gacha) return this.drawGacha(this.gacha.result);
    if (this.enhancing) return this.drawEnhance(this.enhancing.result);
    if (PORTRAIT) return this.createPortrait();
    this.drawHeader();
    this.drawSlots(24, 94);
    this.drawLicense(24, 146);
    this.drawTraining(24, 418);
    this.drawShop(24, 590);
    if (showGear) this.drawGearPanel(488, 100, 448);
    else this.drawRanking(488, 100);
    this.drawRival(488, 442);
    this.drawLog(488, 530);

    this.departButton(488, 618, 448, 58, 24);

    text(this, 480, 698, '방향키·WASD 이동/공격   Z 제자리 공격   1·2·3 스킬   E·R·F·X 물약·귀환   B 가방   Space 대기', 12, INK.faint).setOrigin(0.5, 0);
  }

  /**
   * Hiring screen in two steps: pick a class, then one of two first skills.
   * Also used to re-sign an untouched hunter in another class.
   */
  private drawHiring(hr: NonNullable<HQData['hire']>) {
    const x = 14;
    const w = GW - 28;
    const back = () => this.scene.restart({ messages: this.messages });
    title(this, GW / 2, 18, hr.change ? '직업 바꾸기' : '새 헌터 고용', 23, INK.text).setOrigin(0.5, 0);
    if (!hr.cls) {
      text(this, GW / 2, 52, '직업을 고르세요. 외형과 성장이 직업을 따릅니다.', 12, INK.quiet).setOrigin(0.5, 0);
      const cardH = PORTRAIT ? 128 : 112;
      const cols = PORTRAIT ? 1 : 2;
      const cw = (w - (cols - 1) * 12) / cols;
      CLASS_IDS.forEach((id, i) => {
        const c = CLASSES[id];
        const cx = x + (i % cols) * (cw + 12);
        const cy = 82 + Math.floor(i / cols) * (cardH + 10);
        panel(this, cx, cy, cw, cardH);
        const g = this.add.graphics();
        drawLook(g, c.look, cx + 14, cy + 14, 6);
        title(this, cx + 96, cy + 12, `${c.name}  ·  ${c.role}`, 15, INK.gold);
        text(this, cx + 96, cy + 38, `체력 ${c.base.hp} 마나 ${c.base.mp} 공격 ${c.base.atk} 방어 ${c.base.def}`, 12, INK.text);
        text(this, cx + 96, cy + 56, `${c.passive}: ${c.passiveText}`, 12, INK.quiet).setWordWrapWidth(cw - 110, true).setLineSpacing(-2);
        button(this, cx + 96, cy + cardH - 44, cw - 110, 34, `${c.name} 고르기`, () =>
          this.scene.restart({ messages: this.messages, hire: { ...hr, cls: id, skills: firstSkillChoices(id, rng) } }), { primary: true, size: 12 });
      });
      button(this, x, GH - 70, w, 50, '취소', back);
      return;
    }
    const c = CLASSES[hr.cls];
    text(this, GW / 2, 52, `${c.name}의 첫 스킬을 하나 고르세요. 나머지는 레벨업 카드로 배웁니다.`, 12, INK.quiet).setOrigin(0.5, 0).setWordWrapWidth(w, true);
    (hr.skills ?? []).forEach((id, i) => {
      const sk = SKILLS[id];
      const cy = 96 + i * 120;
      panel(this, x, cy, w, 108);
      title(this, x + 16, cy + 12, `${sk.name}  ·  마나 ${sk.mp}`, 15, INK.gold);
      fit(text(this, x + 16, cy + 38, sk.text, 12, INK.text), w - 32);
      fit(text(this, x + 16, cy + 56, `5단계: ${sk.max}`, 12, INK.quiet), w - 32);
      button(this, x + 16, cy + 74, w - 32, 28, `${sk.name}(으)로 시작`, () => {
        const h = hr.change ? changeClass(state, rng, hr.slot, hr.cls!, id) : hire(state, rng, hr.slot, hr.cls, id);
        const msg = h ? (hr.change ? `${h.name}의 직업을 ${c.name}(으)로 바꿨다.` : `새 ${c.name} ${h.name}와(과) 계약했다.`) : '계약하지 못했다.';
        this.refresh([msg]);
      }, { primary: true, size: 12 });
    });
    button(this, x, GH - 130, w, 50, '직업 다시 고르기', () => this.scene.restart({ messages: this.messages, hire: { slot: hr.slot, change: hr.change } }));
    button(this, x, GH - 70, w, 50, '취소', back);
  }

  /**
   * First launch: name the agency. The name box is a real text field laid over the canvas,
   * so phones bring up their keyboard and Korean input works.
   */
  private drawFounding() {
    const w = Math.min(GW - 28, 520);
    const left = (GW - w) / 2;
    const top = PORTRAIT ? 150 : 120;
    title(this, GW / 2, top - 90, 'SSS급 헌터의 성장기', PORTRAIT ? 23 : 28, INK.text).setOrigin(0.5, 0);
    text(this, GW / 2, top - 54, '— 과연 너일까', 12, INK.rust).setOrigin(0.5, 0);
    panel(this, left, top, w, 262, '에이전시 설립');
    text(this, GW / 2, top + 34, '헌터를 키워 SSS급으로 만들 에이전시입니다.\n이름을 지어 주세요.', 12, INK.quiet)
      .setOrigin(0.5, 0).setAlign('center').setLineSpacing(4);
    const boxY = top + 96;
    const boxH = 52;
    const g = this.add.graphics();
    g.fillStyle(PALETTE.paper, 1).fillRect(left + 20, boxY, w - 40, boxH);
    g.lineStyle(2, PALETTE.rust, 1).strokeRect(left + 20, boxY, w - 40, boxH);
    const hint = text(this, GW / 2, boxY + boxH + 8, `${AGENCY_NAME_MAX}자까지`, 12, INK.faint).setOrigin(0.5, 0);

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = AGENCY_NAME_MAX;
    input.value = randomAgencyName(rng);
    input.setAttribute('aria-label', '에이전시 이름');
    input.autocomplete = 'off';
    Object.assign(input.style, {
      position: 'fixed', border: 'none', outline: 'none', background: 'transparent', color: '#2a211a',
      fontFamily: FONT, textAlign: 'center', padding: '0', margin: '0', zIndex: '10',
    });
    document.body.appendChild(input);
    // Keep the field over its box when the canvas is scaled or the window resizes.
    const place = () => {
      const r = this.game.canvas.getBoundingClientRect();
      const k = r.width / GW;
      Object.assign(input.style, {
        left: `${r.left + (left + 24) * k}px`, top: `${r.top + boxY * k}px`,
        width: `${(w - 48) * k}px`, height: `${boxH * k}px`, fontSize: `${Math.round(22 * k)}px`,
      });
    };
    place();
    window.addEventListener('resize', place);
    this.events.once('shutdown', () => {
      window.removeEventListener('resize', place);
      input.remove();
    });

    const found = () => {
      if (!foundAgency(state, rng, input.value)) {
        hint.setText('이름을 입력해 주세요.').setColor(INK.red);
        input.focus();
        return;
      }
      persist();
      this.scene.restart({});
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') found();
    });
    const bw = (w - 52) / 2;
    button(this, left + 20, boxY + boxH + 40, bw, 50, '랜덤 이름', () => {
      input.value = randomAgencyName(rng, [input.value]);
    }, { size: 15 });
    button(this, left + 32 + bw, boxY + boxH + 40, bw, 50, '설립하기', found, { primary: true, size: 15 });
  }

  /** The board of open gates. Going into one closes it, cleared or not. */
  private drawGates() {
    const x = 14;
    const w = GW - 28;
    const h = activeHunter(state);
    const day = state.day ?? 0;
    title(this, GW / 2, 18, '열린 게이트', 23, INK.text).setOrigin(0.5, 0);
    text(this, GW / 2, 52, '들어가면 클리어하든 못 하든 닫힌다. 귀환할 때마다 하루가 지나고 새 게이트가 열린다.', 12, INK.quiet)
      .setOrigin(0.5, 0).setWordWrapWidth(w, true).setAlign('center');
    const rec = state.gateRecord ?? { ours: 0, rival: 0 };
    const rift = state.rift && !state.rift.entered ? [state.rift] : [];
    const gates = [...rift, ...(state.gates ?? [])];
    const cols = PORTRAIT ? 1 : 3;
    const rows = Math.ceil(gates.length / cols);
    const recY = (PORTRAIT ? 100 : 96) + rows * 146 + (PORTRAIT ? 4 : 8);
    text(this, GW / 2, recY, `게이트 공략  ${state.agent.name} ${rec.ours} : ${rec.rival} ${state.rival.name}`, 12, INK.text).setOrigin(0.5, 0);
    text(this, GW / 2, recY + 20, `${state.rival.name}도 게이트를 노린다. 먼저 들어간 게이트는 다음 날 클리어될 수 있다.`, 12, INK.faint)
      .setOrigin(0.5, 0).setWordWrapWidth(w, true).setAlign('center');
    const cardH = 136;
    const cw = (w - (cols - 1) * 12) / cols;
    gates.forEach((g: Gate, i) => {
      const cx = x + (i % cols) * (cw + 12);
      const cy = (PORTRAIT ? 100 : 96) + Math.floor(i / cols) * (cardH + 10);
      panel(this, cx, cy, cw, cardH);
      const lvl = gateLevel(g);
      const hard = !!h && h.level < lvl - 1;
      if (g.rift) {
        const fx = this.add.graphics();
        fx.lineStyle(2, 0xb05cff, 0.9).strokeRect(cx + 3, cy + 3, cw - 6, cardH - 6);
      }
      title(this, cx + 14, cy + 12, gateName(g), 15, g.rift ? '#d79bff' : g.rule ? INK.red : INK.gold);
      const left = g.closesOn - day;
      text(this, cx + cw - 14, cy + 14, g.rival ? '경쟁 중' : left <= 0 ? '오늘까지' : `${left + 1}일 남음`, 12, g.rival || g.rift ? INK.red : INK.quiet).setOrigin(1, 0);
      fit(text(this, cx + 14, cy + 38, `${g.rift ? `${g.grade}급 상당 · ` : ''}${gateFloors(g)}층 · 적정 Lv.${lvl}${hard ? ' (위험)' : ''}`, 12, hard ? INK.red : INK.text), cw - 28);
      if (g.rift) {
        fit(text(this, cx + 14, cy + 56, cols > 1 ? '단 한 번. 못 막으면 경쟁사가 가져간다' : `한 번뿐인 기회. 못 막으면 ${state.rival.name}이(가) 공을 가져간다`, 12, '#d79bff'), cw - 28);
      } else if (g.rival) {
        const who = g.rival.hunter ? `${g.rival.agency} ${g.rival.hunter}(Lv.${g.rival.level})` : `${g.rival.agency} 팀(Lv.${g.rival.level})`;
        fit(text(this, cx + 14, cy + 56, `${who} 공략 중${cols > 1 ? '' : ' · 다음 날 클리어 시도'}`, 12, '#d79bff'), cw - 28);
      } else {
        fit(text(this, cx + 14, cy + 56, `출몰: ${GATE_THEMES[g.theme].pool.map((id) => MONSTERS[id].name).join(', ')}`, 12, INK.quiet), cw - 28);
      }
      fit(text(this, cx + 14, cy + 74, g.rule ? `특수 규칙 [${GATE_RULES[g.rule].name}] ${GATE_RULES[g.rule].text}` : '특수 규칙 없음', 12, g.rule ? INK.rust : INK.faint), cw - 28);
      const verb = g.rift ? '막으러 가기' : g.rival ? '가로채기' : '입장';
      const reward = g.rift ? `${gateClearGold(g)}G+마력석 ${gateClearStones(g)}` : `클리어 보상 ${gateClearGold(g)}G+장비`;
      button(this, cx + 14, cy + cardH - 40, cw - 28, 30, `${verb} · ${reward}`, () => {
        persist();
        this.scene.start('Tower', { gateId: g.id });
      }, { primary: true, size: 12, enabled: !!h });
    });
    if (h) text(this, GW / 2, GH - 96, `보낼 헌터: ${h.name} · Lv.${h.level}`, 12, INK.text).setOrigin(0.5, 0);
    button(this, x, GH - 70, w, 50, '돌아가기', () => this.scene.restart({ messages: this.messages }));
  }

  /**
   * Enter the tower. When the hunter's grade lets them skip low floors, the first press
   * turns the button into one button per start floor.
   */
  private departButton(x: number, y: number, w: number, hgt: number, size: number) {
    const h = activeHunter(state);
    const go = (floor: number) => {
      persist();
      this.scene.start('Tower', { startFloor: floor });
    };
    const floors = h ? startFloors(state, h) : [1];
    if (!this.pickingStart || floors.length < 2) {
      const gw = Math.round(w * 0.36);
      button(this, x, y, w - gw - 8, hgt, '▶  성장의 탑', () => {
        if (floors.length > 1) this.scene.restart({ messages: this.messages, pickStart: true });
        else go(1);
      }, { primary: true, size, enabled: !!h });
      const rift = state.rift && !state.rift.entered;
      button(this, x + w - gw, y, gw, hgt, rift ? `게이트 ${state.gates?.length ?? 0} · 균열!` : `게이트 ${state.gates?.length ?? 0}`, () =>
        this.scene.restart({ messages: this.messages, gates: true }), { size: Math.min(size, 18), enabled: !!h });
      return;
    }
    const cancelW = 56;
    const gap = 6;
    const bw = (w - cancelW - gap * floors.length) / floors.length;
    floors.forEach((f, i) => {
      const name = f > TOP_FLOOR ? `심연 ${f - TOP_FLOOR}` : `${f}층`;
      button(this, x + i * (bw + gap), y, bw, hgt, floors.length > 4 ? name : `▶ ${name}부터`, () => go(f), { primary: true, size: Math.min(size, floors.length > 4 ? 14 : 16) });
    });
    button(this, x + w - cancelW, y, cancelW, hgt, '취소', () => this.scene.restart({ messages: this.messages }), { size: 12 });
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
    this.soundButton(236, 14, 70);
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
    this.departButton(x, departY, w, 56, 20);

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
    this.soundButton(676, 20, 96);
  }

  private soundButton(x: number, y: number, w: number) {
    button(this, x, y, w, 28, '설정', () => this.scene.restart({ settings: true, messages: this.messages }));
  }

  /** Sound and how to move on a touch screen. */
  private drawSettings() {
    const w = Math.min(GW - 28, 520);
    const x = (GW - w) / 2;
    title(this, GW / 2, 18, '설정', 23, INK.text).setOrigin(0.5, 0);
    const reopen = () => this.scene.restart({ settings: true, messages: this.messages });
    const oy = PORTRAIT ? 80 : 84;
    panel(this, x, oy, w, 96, '소리');
    text(this, x + 18, oy + 26, '효과음', 13, INK.text);
    const half = (w - 36 - 10) / 2;
    const on = soundOn();
    button(this, x + 18, oy + 48, half, 34, '켬', () => { if (!soundOn()) toggleSound(); reopen(); }, { primary: on });
    button(this, x + 28 + half, oy + 48, half, 34, '끔', () => { if (soundOn()) toggleSound(); reopen(); }, { primary: !on });

    const my = oy + 112;
    panel(this, x, my, w, 144, '이동 방식 (터치 화면)');
    const mode = moveControl();
    button(this, x + 18, my + 26, half, 34, '조이스틱', () => { setMoveControl('joystick'); reopen(); }, { primary: mode === 'joystick' });
    button(this, x + 28 + half, my + 26, half, 34, '십자 버튼', () => { setMoveControl('dpad'); reopen(); }, { primary: mode === 'dpad' });
    const note = mode === 'joystick'
      ? '화면을 누른 곳에 조이스틱이 생기고, 끄는 방향으로 걷는다.'
      : '왼쪽 아래 고정된 십자 버튼을 눌러 걷는다. 누르고 있으면 계속 걷는다.';
    text(this, x + 18, my + 74, note, 12, INK.quiet).setWordWrapWidth(w - 36, true);
    text(this, x + 18, my + 116, '키보드는 어느 쪽이든 방향키·WASD로 움직인다.', 12, INK.faint);

    // Hand-made saves, loaded from the title screen.
    const sy = my + 160;
    const rowH = PORTRAIT ? 52 : 44;
    panel(this, x, sy, w, 34 + SAVE_SLOTS * (rowH + 6), '저장하기 (불러오기는 시작 화면에서)');
    for (let i = 0; i < SAVE_SLOTS; i++) {
      const info = slotInfo(i);
      const armed = this.armSave === i;
      const label = armed ? `${i + 1}번 슬롯에 덮어쓸까요? 한 번 더 누르기` : slotLabel(i, info);
      button(this, x + 14, sy + 24 + i * (rowH + 6), w - 28, rowH, label, () => {
        if (info && !armed) {
          this.armSave = i;
          return this.scene.restart({ settings: true, messages: this.messages });
        }
        persist();
        saveSlot(i);
        this.armSave = undefined;
        sfx.gear();
        this.scene.restart({ settings: true, messages: [`${i + 1}번 슬롯에 저장했다.`, ...this.messages] });
      }, { size: 12, primary: armed });
    }
    const by = sy + 34 + SAVE_SLOTS * (rowH + 6) + 12;
    if (this.messages[0]?.includes('슬롯에 저장')) text(this, GW / 2, by - 4, this.messages[0], 12, INK.gate).setOrigin(0.5, 0);
    button(this, x, Math.min(GH - 54, by + 18), w, 44, '돌아가기', () => {
      this.armSave = undefined;
      this.scene.restart({ messages: this.messages.filter((m) => !m.includes('슬롯에 저장')) });
    });
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
        button(this, bx, y, w, 44, '+ 새 헌터 고용', () => this.scene.restart({ messages: this.messages, hire: { slot: i } }));
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
    const board = ranking(state);
    const place = board.findIndex((r) => r.id === h.id);
    const tenth = board[board.length - 1];
    const goal =
      place >= 0 ? `협회 랭킹 ${place + 1}위`
      : next ? `다음 ${next[0]}급까지 ${next[1] - power}`
      : `S급(랭킹 10위)까지 ${Math.max(1, (tenth?.score ?? power) - power + 1)}`;

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
    // The hunter's figure, fixed by class.
    drawLook(g, lookOf(h), px + 9, py + 6, 5);
    g.fillStyle(PALETTE.ink, 1).fillRect(px, py + 72, 72, 16);
    text(this, px + 36, py + 74, CLASSES[h.cls].name, 12, '#e6dac0').setOrigin(0.5, 0);

    title(this, x + 106, y + 40, h.name, 23, INK.ink);
    text(this, x + 106, y + 72, `Lv.${h.level}   경험치 ${h.exp}/${expToNext(h.level)}`, 12, INK.inkQuiet);
    fit(text(this, x + 106, y + 92, `${CLASSES[h.cls].passive}: ${CLASSES[h.cls].passiveText}`, 12, INK.inkQuiet), w - 260);
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
    bar(this, x + 120, y + 148, w - 336, 8, h.hp / h.maxHp, PALETTE.hp);
    // Regeneration per turn in the tower, next to each bar.
    const per = (v: number) => `+${Number((v ?? 0).toFixed(2))}/턴`;
    text(this, x + w - 210, y + 146, per(h.hpRegen), 12, INK.inkQuiet);
    text(this, x + w - 210, y + 166, per(h.mpRegen), 12, INK.inkQuiet);
    text(this, x + 18, y + 166, `마나 ${h.mp}/${h.maxMp}`, 12, INK.ink);
    bar(this, x + 120, y + 168, w - 336, 8, h.mp / h.maxMp, PALETTE.mp);
    const sx = x + w - 144;
    text(this, sx, y + 146, `공격 ${h.atk}`, 12, INK.ink);
    text(this, sx, y + 166, `방어 ${h.def}`, 12, INK.ink);
    text(this, sx + 64, y + 146, `물약 ${h.bag.hp + h.bag.mp + h.bag.guard}`, 12, INK.ink);
    text(this, sx + 64, y + 166, `${h.gold}G`, 12, INK.ink);

    dots(this, x + 18, y + 188, w - 36, PALETTE.paperLine);
    title(this, x + 18, y + 198, `전투력 ${power}`, 15, INK.ink);
    text(this, x + w - 18, y + 201, goal, 12, INK.inkQuiet).setOrigin(1, 0);
    const skills = h.skills.map((sk) => `${SKILLS[sk.id].name} ${sk.lv}`).join(' · ');
    if (untouched(h)) {
      button(this, x + 18, y + 222, 104, 26, '직업 바꾸기', () => this.scene.restart({ messages: this.messages, hire: { slot: state.activeSlot, change: true } }), { size: 12 });
      fit(text(this, x + 130, y + 228, `스킬 ${skills}`, 12, INK.inkQuiet), w - 236);
    } else {
      const extras = [h.rescues ? `위기 지원 ${h.rescues}` : ''].filter(Boolean).join(' · ');
      fit(text(this, x + 18, y + 228, `스킬 ${skills} · 처치 ${h.kills} · 최고 ${h.bestFloor}층${h.abyssBest ? `·심연 ${h.abyssBest}층` : ''}` + (extras ? ` · ${extras}` : ''), 12, INK.inkQuiet), w - 120);
    }
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
    button(this, x + 14, y + 14, 96, 26, showGear ? '순위 보기' : '장비 보기', () => {
      showGear = !showGear;
      this.scene.restart({ messages: this.messages });
    });
    button(this, x + 116, y + 14, 60, 26, '뽑기', () => this.openGacha(), { primary: true, size: 12 });
    button(this, x + 182, y + 14, 56, 26, '강화', () => this.openEnhance(), { primary: true, size: 12 });
    text(this, x + 16, y + 48, `물약 체력 ${h.bag.hp} · 마나 ${h.bag.mp} · 무적 ${h.bag.guard} · 귀환서 ${h.bag.escape}`, 12, INK.quiet);
    (['hp', 'mp'] as const).forEach((kind, i) => {
      const c = CONSUMABLES[kind];
      button(this, x + w - 196 + i * 92, y + 16, 86, 44, `${c.name.slice(0, 2)} 물약\n${c.price}G`, () => this.buy(kind), { enabled: this.canBuy(kind) });
    });
  }

  private openEnhance() {
    this.scene.restart({ messages: this.messages, enhance: {} });
  }

  /** Enhance worn gear with the agency's 마력석 and gold. Higher levels can drop or break. */
  private drawEnhance(result?: EnhanceResult) {
    const h = activeHunter(state);
    const w = PORTRAIT ? GW - 28 : 720;
    const x = (GW - w) / 2;
    const stones = state.agent.stones ?? 0;
    title(this, GW / 2, 18, '장비 강화', 23, INK.text).setOrigin(0.5, 0);
    text(this, GW / 2, 50, `마력석 ${stones}개 · 운영 자금 ${state.agent.gold}G`, 12, INK.gold).setOrigin(0.5, 0);
    text(this, GW / 2, 70, '+5부터 실패하면 한 단계 떨어질 수 있고, +7부터는 부서질 수도 있다.', 12, INK.faint)
      .setOrigin(0.5, 0).setWordWrapWidth(w, true).setAlign('center');

    let y = PORTRAIT ? 112 : 96;
    if (result) {
      const g = result.gear;
      const [line, color] = result.success
        ? [`성공! ${g.name} +${result.from} → +${result.to}`, INK.gold]
        : result.broken
          ? [`실패... +${result.from} ${g.name}이(가) 부서졌다!`, INK.red]
          : result.to < result.from
            ? [`실패... ${g.name} +${result.from} → +${result.to}`, INK.red]
            : [`실패... ${g.name}은(는) +${result.from} 그대로.`, INK.quiet];
      const t = title(this, GW / 2, y, line, 15, color).setOrigin(0.5, 0);
      if (t.width > w) t.setFontSize(12);
      this.tweens.add({ targets: t, scale: { from: 1.25, to: 1 }, duration: 250 });
      if (result.broken) this.cameras.main.shake(300, 0.01);
      if (result.success && result.to >= 7) this.cameras.main.flash(250, 255, 210, 150);
    }
    y += 30;

    const rowH = PORTRAIT ? 86 : 64;
    GEAR_SLOTS.forEach((slot, i) => {
      const ry = y + i * rowH;
      const g = h?.gear[slot];
      panel(this, x, ry, w, rowH - 6);
      if (!g) {
        text(this, x + 14, ry + 10, GEAR_SLOT_NAMES[slot], 12, INK.faint);
        text(this, x + 14, ry + 30, '비어 있음', 12, INK.faint);
        return;
      }
      const icon = this.add.graphics();
      drawGearIcon(g)(icon, x + 8, ry + 6);
      const tx = x + 58;
      const bw = 76;
      const tw = w - (tx - x) - bw - 20;
      fit(title(this, tx, ry + 6, `${GEAR_SLOT_NAMES[slot]} · ${gearLabel(g)}`, 12, tierColor(g.tier)), tw);
      fit(text(this, tx, ry + 24, describeGear(g), 12, INK.text), tw);
      const plus = g.plus ?? 0;
      if (plus >= MAX_PLUS) {
        text(this, tx, ry + 42, '최대 강화', 12, INK.gold);
        return;
      }
      const cost = enhanceCost(g);
      const risk = enhanceRisk(g);
      const ok = stones >= cost.stones && state.agent.gold >= cost.gold;
      const pct = (v: number) => Math.round(v * 100);
      const f = failOdds(g);
      const failText = risk === 'none' ? '' : `실패하면 ${f.break > 0 ? `파괴 ${pct(f.break)} · ` : ''}하락 ${pct(f.drop)} · 유지 ${pct(f.keep)}%`;
      const chance = enhanceChance(g);
      const costText = `마력석 ${cost.stones} · ${cost.gold}G · 성공 ${pct(chance)}% · 실패 ${pct(1 - chance)}%`;
      const riskColor = risk === 'break' ? INK.red : risk === 'drop' ? INK.rust : INK.quiet;
      if (PORTRAIT) {
        fit(text(this, tx, ry + 42, costText, 12, ok ? INK.quiet : INK.faint), tw);
        if (failText) fit(text(this, tx, ry + 60, failText, 12, riskColor), tw);
      } else {
        const c = fit(text(this, tx, ry + 42, costText, 12, ok ? INK.quiet : INK.faint), tw);
        if (failText) fit(text(this, tx + c.width + 6, ry + 42, `· ${failText}`, 12, riskColor), tw - c.width - 6);
      }
      button(this, x + w - bw - 10, ry + (rowH - 6) / 2 - 17, bw, 34, `+${plus + 1}`, () => {
        const r = enhanceGear(state, rng, slot);
        if (!r) return;
        persist();
        if (r.success) (r.to >= 7 ? sfx.levelup : sfx.gear)();
        else if (r.broken) sfx.death();
        else sfx.curse();
        const msg = r.success
          ? `강화 성공: ${r.gear.name} +${r.to}`
          : r.broken ? `강화 실패: +${r.from} ${r.gear.name}이(가) 부서졌다.` : `강화 실패: ${r.gear.name} +${r.to}`;
        this.messages = [msg, ...this.messages];
        this.scene.restart({ messages: this.messages, enhance: { result: r } });
      }, { primary: risk !== 'break', size: 15, enabled: ok });
    });

    const by = y + GEAR_SLOTS.length * rowH + 6;
    text(this, GW / 2, by, '마력석은 몬스터, 중간보스, 층 보스, 게이트 클리어에서 얻는다.', 12, INK.faint)
      .setOrigin(0.5, 0).setWordWrapWidth(w, true).setAlign('center');
    button(this, x, GH - 70, w, 50, '돌아가기', () => this.scene.restart({ messages: this.messages }));
  }

  private openGacha() {
    this.scene.restart({ messages: this.messages, gacha: {} });
  }

  /**
   * The gear draw: a pricey gamble paid from the hunter's own gold.
   * Tiers 8 and 9 can only be found here.
   */
  private drawGacha(result?: GachaResult) {
    const h = activeHunter(state);
    const w = Math.min(GW - 28, 520);
    const x = (GW - w) / 2;
    title(this, GW / 2, 18, '장비 뽑기', 23, INK.text).setOrigin(0.5, 0);
    text(this, GW / 2, 52, '균열에서 흘러나온 봉인 상자. 무엇이 들었는지는 열어 봐야 안다.', 12, INK.quiet)
      .setOrigin(0.5, 0).setWordWrapWidth(w, true).setAlign('center');

    const oy = PORTRAIT ? 96 : 84;
    const oddsH = 36 + GACHA_ODDS.length * 22;
    panel(this, x, oy, w, oddsH, '확률');
    GACHA_ODDS.forEach((o, i) => {
      const ly = oy + 24 + i * 22;
      const sample = makeGear(new Rng(1), o.tier, 'weapon');
      text(this, x + 18, ly, `${o.label} · ${o.tier}단계`, 12, tierColor(o.tier), true);
      text(this, x + 150, ly, `예) ${sample.name}`, 12, INK.quiet);
      text(this, x + w - 18, ly, `${Math.round(o.chance * 100)}%`, 12, tierColor(o.tier)).setOrigin(1, 0);
    });

    const ry = oy + oddsH + 12;
    text(this, GW / 2, ry, `지금 낀 것보다 좋으면 바로 착용, 아니면 ${GACHA_REFUND}G에 되판다.`, 12, INK.faint)
      .setOrigin(0.5, 0).setWordWrapWidth(w, true).setAlign('center');

    const cy = ry + 30;
    const cardH = 132;
    if (result) {
      const g = result.gear;
      const color = tierColor(g.tier);
      panel(this, x, cy, w, cardH, '결과');
      const big = g.tier >= 8;
      if (big) {
        const glow = this.add.graphics();
        glow.lineStyle(3, Phaser.Display.Color.HexStringToColor(color).color, 1).strokeRect(x - 2, cy - 2, w + 4, cardH + 4);
        this.tweens.add({ targets: glow, alpha: 0.2, duration: 500, yoyo: true, repeat: -1 });
      }
      const icon = this.add.graphics();
      drawGearIcon(g)(icon, x + 18, cy + 26);
      text(this, x + 72, cy + 22, `${gachaLabel(g.tier)} · ${GEAR_SLOT_NAMES[g.slot]} · ${g.tier}단계`, 12, INK.faint);
      title(this, x + 72, cy + 40, g.name, 15, color);
      text(this, x + 72, cy + 64, describeGear(g), 12, INK.text);
      const outcome = result.equipped
        ? (result.old ? `착용! ${result.old.name} 대신 · ${gearDiff(g, result.old)}` : `착용! ${gearDiff(g)}`)
        : `${result.old?.name ?? '지금 장비'}이(가) 더 좋아서 ${result.refund}G에 되팔았다.`;
      text(this, x + 18, cy + 92, outcome, 12, result.equipped ? INK.gold : INK.quiet).setWordWrapWidth(w - 36, true);
      icon.setAlpha(0);
      this.tweens.add({ targets: icon, alpha: 1, duration: 250 });
      if (big) this.cameras.main.flash(300, 255, 200, 150);
    } else {
      panel(this, x, cy, w, cardH, '결과');
      text(this, GW / 2, cy + cardH / 2 - 8, '아직 뽑지 않았다.', 12, INK.faint).setOrigin(0.5, 0);
    }

    const by = Math.max(cy + cardH + 20, GH - 190);
    if (h) {
      text(this, GW / 2, by, `${h.name}의 소지금 ${h.gold}G`, 12, h.gold >= GACHA_PRICE ? INK.gold : INK.red).setOrigin(0.5, 0);
    }
    const can = !!h && h.gold >= GACHA_PRICE;
    button(this, x, by + 26, w, 56, can ? `뽑기  ${GACHA_PRICE}G` : `뽑기  ${GACHA_PRICE}G (소지금 부족)`, () => {
      const r = drawGear(state, rng);
      if (!r) return;
      persist();
      if (r.gear.tier >= 8) sfx.levelup();
      else if (r.equipped) sfx.gear();
      else sfx.buy();
      const msg = r.equipped ? `장비 뽑기: ${r.gear.name}(${r.gear.tier}단계) 착용!` : `장비 뽑기: ${r.gear.name}. ${r.refund}G에 되팔았다.`;
      this.messages = [msg, ...this.messages];
      this.scene.restart({ messages: this.messages, gacha: { result: r } });
    }, { primary: true, size: 18, enabled: can });
    button(this, x, by + 92, w, 50, '돌아가기', () => this.scene.restart({ messages: this.messages }));
  }

  /** The gear doll in a panel. */
  private drawGearPanel(x: number, y: number, w: number) {
    const h = activeHunter(state);
    if (!h) return;
    panel(this, x, y, w, DOLL_H + 40, '장비');
    if (PORTRAIT) {
      button(this, x + w - 160, y + 8, 70, 26, '뽑기', () => this.openGacha(), { primary: true, size: 12 });
      button(this, x + w - 84, y + 8, 72, 26, '강화', () => this.openEnhance(), { primary: true, size: 12 });
    }
    else text(this, x + w - 16, y + 12, '더 좋은 장비를 얻으면 바꿔 낌', 12, INK.faint).setOrigin(1, 0);
    drawPaperDoll(this, x + 12, y + 32, w - 24, h);
  }

  /** Portrait bag tab: worn gear, then potions with their shop buttons. */
  private drawBag(x: number, y: number, w: number) {
    const h = activeHunter(state);
    if (!h) return;
    this.drawGearPanel(x, y, w);

    const py = y + DOLL_H + 60;
    panel(this, x, py, w, 36 + CONSUMABLE_KINDS.length * 52 + 22, '물약 · 상점');
    text(this, x + 16, py + 32 + CONSUMABLE_KINDS.length * 52, '귀환하면 가방은 체력 물약 1개로 돌아갑니다.', 12, INK.faint);
    text(this, x + w - 16, py + 14, `헌터 소지금 ${h.gold}G`, 12, INK.gold).setOrigin(1, 0);
    CONSUMABLE_KINDS.forEach((kind, i) => {
      const c = CONSUMABLES[kind];
      const ry = py + 32 + i * 52;
      text(this, x + 16, ry + 4, `${c.name}  ${h.bag[kind]}/${BAG_MAX}`, 12, INK.text, true);
      text(this, x + 16, ry + 24, c.describe, 12, INK.quiet);
      if (c.price !== undefined) {
        button(this, x + w - 126, ry, 110, 44, `구매 ${c.price}G`, () => this.buy(kind), { enabled: this.canBuy(kind) });
      } else {
        text(this, x + w - 16, ry + 14, `${c.where}에서만`, 12, INK.faint).setOrigin(1, 0);
      }
    });
  }

  /** Live association ranking: ours, the rival agency's, the fallen, and established rankers. */
  private drawRanking(x: number, y: number, w = 448) {
    panel(this, x, y, w, 326, '헌터 순위 · 명예의 전당');
    const cols = { rank: x + 18, grade: x + 50, name: x + 92, lv: x + 170, score: x + 212, note: x + w - 18 };
    const hy = y + 20;
    text(this, cols.rank, hy, '#', 12, INK.faint);
    text(this, cols.grade, hy, '등급', 12, INK.faint);
    text(this, cols.name, hy, '이름', 12, INK.faint);
    text(this, cols.lv, hy, 'Lv', 12, INK.faint);
    text(this, cols.score, hy, '전투력', 12, INK.faint);
    text(this, cols.note, hy, '소속 · 최후', 12, INK.faint).setOrigin(1, 0);
    dots(this, x + 16, hy + 18, w - 32);
    const color = { ours: INK.gate, rival: '#d79bff', gone: INK.faint, world: INK.quiet } as const;
    ranking(state).forEach((r, i) => {
      const ry = hy + 26 + i * 25;
      const c = color[r.status];
      const g = rankGradeOf(i)!;
      text(this, cols.rank, ry, `${i + 1}`, 12, i === 0 ? INK.gold : INK.quiet, true);
      text(this, cols.grade, ry, g, 12, i === 0 ? INK.gold : INK.rust, true);
      text(this, cols.name, ry, r.name, 12, c, r.status === 'ours');
      text(this, cols.lv, ry, `${r.level}`, 12, INK.quiet);
      text(this, cols.score, ry, `${r.score}`, 12, INK.quiet);
      const note = r.cls ? `${CLASSES[r.cls].name} · ${r.note}` : r.note;
      fit(text(this, cols.note, ry, note, 12, r.status === 'gone' ? INK.faint : c), cols.note - cols.score - 50).setOrigin(1, 0);
    });
    const gone = state.hallOfFame.length;
    if (gone > 0) text(this, x + w - 18, y + 304, `기록으로 남은 헌터 ${gone}명`, 12, INK.faint).setOrigin(1, 0);
    this.challengeButton(x + 14, y + 300, Math.min(260, w - 150));
  }

  /** Challenge the next association ranker. Only a win moves our hunter past them. */
  private challengeButton(x: number, y: number, w: number) {
    const h = activeHunter(state);
    if (!h) return;
    const next = nextChallenge(state, h);
    if (!next) {
      text(this, x + 4, y + 6, '협회 랭커를 모두 꺾었다.', 12, INK.gold);
      return;
    }
    const ok = canChallenge(state, h);
    const label = ok ? `${next.rank}위 ${next.ranker.name}에게 도전 (${next.ranker.score})` : `오늘은 도전 완료 · 다음 ${next.ranker.name}`;
    button(this, x, y, w, 22, label, () => {
      const duel = startDuel(state);
      if (!duel) return;
      persist();
      this.scene.start('Tower', { duel });
    }, { primary: ok, size: 12, enabled: ok });
  }

  private drawRival(x: number, y: number, w = 448) {
    const { rival } = state;
    panel(this, x, y, w, 72, '경쟁 에이전시');
    const former = rival.roster.filter((h) => h.origin !== 'rival').length;
    title(this, x + 18, y + 18, rival.name, 15, '#d79bff');
    const rec = state.gateRecord ?? { ours: 0, rival: 0 };
    text(this, x + w - 18, y + 20, `옛 동료 ${former} · 라이벌 ${rival.roster.length - former} · 게이트 ${rec.rival}`, 12, INK.quiet).setOrigin(1, 0);
    // Each of our hunters has their own rival: the active hunter's first.
    const me = activeHunter(state);
    const ours = [me, ...state.slots.filter((s) => s && s !== me)].filter((s): s is Hunter => !!s);
    const pairs = ours.flatMap((o) => {
      const r = rival.roster.find((h) => h.origin === 'rival' && h.rivalOf === o.id);
      return r ? [`${o.name}의 라이벌 ${r.name} ${combatPower(r)}`] : [];
    });
    const line = pairs.length ? pairs.join(' · ') : '우리 헌터가 S급이 되면 라이벌을 내세운다.';
    fit(text(this, x + 18, y + 44, line, 12, pairs.length ? INK.text : INK.faint), w - 36);
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
