import * as Phaser from 'phaser';
import { preloadCrawl } from '../game/crawl';
import { ART, Art, ART_KEY } from '../game/art';
import { dailyTriesLeft, startDaily, abyssRecord, activeHunter, buyPrep, PREP_IDS, PREPS, prepCost, refreshQuests, rivalAgencies, syncPerks, invest, slotOpen, canDispatch, dispatch, dispatchPay, isAway, TALENTS, TalentId, depositGear, withdrawGear, sellStashed, stashFee, stashPrice, STASH_SIZE, scoutCandidates, hireScout, ARENA_UNLOCK_FLOOR, arenaRecord, arenaUnlocked, canEnterArena, startSurvival, AGENCY_NAME_MAX, canRetire, retire, buyItem, canChallenge, drawGear, nextChallenge, startDuel, EnhanceResult, enhanceChance, enhanceCost, enhanceGear, enhanceRisk, failOdds, GachaResult, changeClass, foundAgency, randomAgencyName, refreshGates, gradeIn, hire, ranking, release, SLOT_COUNT, startFloors, train, TRAINING, trainingCost, untouched } from '../core/agency';
import { ClassId, CLASS_IDS, CLASSES, firstSkillChoices, SkillId, SKILLS } from '../core/classes';
import { Gate, gateClearGold, gateClearStones, gateFloors, gateLevel, gateName, GATE_RULES, GATE_THEMES } from '../core/gates';
import { elementNote, MONSTERS, TOP_FLOOR, TRAITS } from '../core/monsters';
import { DAILY_FLOORS, DAILY_POINTS_PER_STONE, DAILY_RECORD_STONES, DAILY_RULES, DAILY_SPEED_BONUS, DAILY_TRIES, dailyBase, dailyRules, dailyToday, dateLabel, todayKey } from '../core/daily';
import { ACHIEVEMENTS, checkAchievements, CODEX_IDS, codexCount, codexWhere, isDone, rewardText, wearTitle, wornTitle } from '../core/codex';
import { monsterTexture } from '../game/monsterArt';
import { combatPower, expToNext, Hunter, GRADE_THRESHOLDS, rankGradeOf, TrainingKind } from '../core/hunter';
import { bagMax, CONSUMABLE_KINDS, CONSUMABLES, ConsumableKind, describeGear, GACHA_ODDS, GACHA_PRICE, GACHA_REFUND, gachaLabel, gearLabel, gearLevel, GEAR_SLOT_NAMES, GEAR_SLOTS, makeGear, MAX_PLUS } from '../core/items';
import { DOLL_H, drawGearIcon, drawPaperDoll, gearDiff, tierColor } from '../game/paperdoll';
import { placeLook, lookOf } from '../game/looks';
import { sfx, soundOn, toggleSound } from '../game/sfx';
import { moveControl, setMoveControl } from '../game/controls';
import { persist, rng, saveSlot, skipTitleOnce, slotInfo, state, takeWelcome } from '../game/store';
import { SAVE_SLOTS } from '../core/save';
import { slotLabel } from '../game/slots';
import { Rng } from '../core/rng';
import { fitCamera, GH, GW, layoutStale, PORTRAIT } from '../game/layout';
import { bar, button, dots, FONT, INK, PALETTE, panel, text, title } from '../game/ui';
import { L, Lang, lang, LANG_KEY } from '../core/lang';
import { daysLeft, Quest, QUEST_DAYS, questReward, questText } from '../core/quests';
import { GuidePage, guideIsOff, resetGuide, showGuide, tipWanted, markTip } from '../game/guide';
import { TIPS } from '../game/tips';
import { buyPerk, PERK_IDS, PERKS, perkCost, perkLevel, perkMax, RETIRE_POINTS } from '../core/legacy';
import { AGENCY_LEVEL_EXP, agencyLevel, cutDiscount, cutRate, Feature, FEATURE_LEVEL, opensAt, INVEST_EXP, levelProgress, levelUpMessage, MAX_AGENCY_LEVEL, unlocked } from '../core/agencyLevel';

export interface HQData {
  messages?: string[];
  /** Second click on 방출 confirms the release. */
  armRelease?: boolean;
  /** Second click on 은퇴 confirms the retirement. */
  armRetire?: boolean;
  /** Show the legacy screen (perks bought with points from retired hunters). */
  legacy?: boolean;
  /** Show the survival arena's entrance. */
  arena?: boolean;
  /** Show the start floor choices instead of the depart button. */
  pickStart?: boolean;
  /** Hiring screen: the slot being filled, and whether it re-signs an untouched hunter in another class. */
  hire?: { slot: number; change?: boolean; cls?: ClassId; skills?: SkillId[]; direct?: boolean };
  /** Show the agency's gear storage. */
  stash?: boolean;
  /** Show the board of open gates. */
  gates?: boolean;
  /** Show the gear draw, with the last result if there is one. */
  gacha?: { result?: GachaResult };
  /** Show the settings screen. */
  settings?: boolean;
  /** Show the gear enhancement screen, with the last try if there is one. */
  enhance?: { result?: EnhanceResult };
  /** Show the association's quest board. */
  quests?: boolean;
  /** Show the departure prep screen (shop and prep). */
  prep?: boolean;
  /** Show the agency level table. */
  levels?: boolean;
  /** Show the challenges: today's rift and the survival arena. */
  challenges?: boolean;
  /** Show the monster codex or the achievements, with a monster picked or a page of achievements. */
  codex?: { view: 'monsters' | 'achievements'; pick?: string; page?: number };
}


/** Portrait only: the office is split into tabs along the bottom. */
type Tab = 'hunter' | 'shop' | 'ranking' | 'news';
const TABS: Array<[Tab, string]> = [
  ['hunter', L('헌터', 'Hunter')],
  ['shop', L('가방', 'Bag')],
  ['ranking', L('순위', 'Ranks')],
  ['news', L('소식', 'News')],
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
  private retireArmed = false;
  private showingLegacy = false;
  private showingArena = false;
  private pickingStart = false;
  private hiring?: HQData['hire'];
  private showingGates = false;
  private gacha?: HQData['gacha'];
  private settings = false;
  /** Save slot waiting for a second press to be overwritten. */
  private armSave?: number;
  private enhancing?: HQData['enhance'];
  private showingStash = false;
  private showingQuests = false;
  private showingPrep = false;
  private showingLevels = false;
  private showingChallenges = false;
  private codex?: HQData['codex'];

  constructor() {
    super('HQ');
  }

  init(data: HQData) {
    this.messages = data.messages ?? [];
    this.releaseArmed = !!data.armRelease;
    this.retireArmed = !!data.armRetire;
    this.showingLegacy = !!data.legacy;
    this.showingArena = !!data.arena;
    this.pickingStart = !!data.pickStart;
    this.hiring = data.hire;
    this.showingGates = !!data.gates;
    this.gacha = data.gacha;
    this.settings = !!data.settings;
    this.enhancing = data.enhance;
    this.showingStash = !!data.stash;
    this.showingQuests = !!data.quests;
    this.showingPrep = !!data.prep;
    this.showingLevels = !!data.levels;
    this.showingChallenges = !!data.challenges;
    this.codex = data.codex;
    // The welcome waits until the agency has a name.
    if (state.agent.named === false) return;
    if (takeWelcome() && this.messages.length === 0) {
      this.messages = [
        L(`${state.agent.name} 설립. 첫 헌터 ${activeHunter(state)!.name}와(과) 계약했다.`, `${state.agent.name} founded. Signed the first hunter, ${activeHunter(state)!.name}.`),
        L('훈련으로 키우고, 성장의 탑에 보내 돈을 벌어오게 하자.', 'Train them, then send them up the Tower of Growth to earn money.'),
        L('첫 탑에 가기 전에는 자격증의 [직업 바꾸기]로 직업을 다시 고를 수 있다.', 'Before the first climb, [Change class] on the license lets you pick again.'),
      ];
    }
  }

  private refresh(messages: string[] = this.messages, armRelease = false) {
    persist();
    this.scene.restart({ messages, armRelease });
  }

  preload() {
    preloadCrawl(this);
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
    fitCamera(this.cameras.main).setBackgroundColor(PALETTE.bg);
    if (state.agent.named === false) return this.drawFounding();
    if (!state.gates) refreshGates(state, rng);
    syncPerks(state);
    if (!state.quests) refreshQuests(state, rng);
    // Achievements reached since the office was last open: pay them and say so.
    const reached = checkAchievements(state);
    if (reached.length) {
      this.messages = [...reached.map((a) => L(`업적 달성: ${a.name}! 칭호 「${a.title}」 · 보상 ${rewardText(a)}`, `Achievement: ${a.name}! Title "${a.title}" · Reward ${rewardText(a)}`)), ...this.messages];
      persist();
    }
    // Officer Yoon speaks once the screen is drawn.
    this.time.delayedCall(30, () => this.maybeTip());
    if (this.hiring) return this.drawHiring(this.hiring);
    if (this.showingGates) return this.drawGates();
    if (this.settings) return this.drawSettings();
    if (this.showingLegacy) return this.drawLegacy();
    if (this.showingArena) return this.drawArena();
    if (this.gacha) return this.drawGacha(this.gacha.result);
    if (this.enhancing) return this.drawEnhance(this.enhancing.result);
    if (this.showingStash) return this.drawStash();
    if (this.showingQuests) return this.drawQuests();
    if (this.showingPrep) return this.drawPrep();
    if (this.showingLevels) return this.drawLevels();
    if (this.showingChallenges) return this.drawChallenges();
    if (this.codex) return this.drawCodex(this.codex);
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

    text(this, 480, 698, L('방향키·WASD 이동/공격   Z 제자리 공격   1·2·3 스킬   E·R·F·X 물약·귀환   B 가방   Space 대기', 'Arrows/WASD move   Z attack   1·2·3 skills   E·R·F·X potions/return   B bag   Space wait'), 12, INK.faint).setOrigin(0.5, 0);
  }

  /** Scout center: today's three candidates, each with a talent and a few levels. */
  private drawScouts(hr: NonNullable<HQData['hire']>) {
    const x = 14;
    const w = GW - 28;
    const list = scoutCandidates(state, rng);
    persist();
    title(this, GW / 2, 18, L('스카웃 센터', 'Scout Center'), 23, INK.text).setOrigin(0.5, 0);
    text(this, GW / 2, 52, L('오늘의 후보들이다. 재능을 하나씩 갖고 있다. 후보는 하루가 지나면 바뀐다.', "Today's candidates, each with a talent. They change every day."), 12, INK.quiet)
      .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(w, true);
    const cardH = PORTRAIT ? 150 : 120;
    const cols = PORTRAIT ? 1 : 3;
    const cw = (w - (cols - 1) * 12) / cols;
    list.forEach((h, i) => {
      const c = CLASSES[h.cls ?? 'sword'];
      const cx = x + (i % cols) * (cw + 12);
      const cy = 86 + Math.floor(i / cols) * (cardH + 10);
      panel(this, cx, cy, cw, cardH);
      const g = this.add.graphics();
      placeLook(this, g, c.look, cx + 12, cy + 14, 5);
      fit(title(this, cx + 82, cy + 12, `${h.name}  ·  ${c.name}`, 15, INK.gold), cw - 94);
      text(this, cx + 82, cy + 36, L(`Lv.${h.level} · 전투력 ${combatPower(h)}`, `Lv.${h.level} · Power ${combatPower(h)}`), 12, INK.text);
      const t = TALENTS[h.talent as TalentId];
      if (t) fit(text(this, cx + 82, cy + 54, L(`재능 [${t.name()}] ${t.text()}`, `Talent [${t.name()}] ${t.text()}`), 12, INK.gate), cw - 94);
      fit(text(this, cx + 82, cy + 72, L(`체력 ${h.maxHp} 마나 ${h.maxMp} 공격 ${h.atk} 방어 ${h.def}`, `HP ${h.maxHp} MP ${h.maxMp} ATK ${h.atk} DEF ${h.def}`), 12, INK.quiet), cw - 94);
      button(this, cx + 12, cy + cardH - 40, cw - 24, 30, L(`${h.name}와(과) 계약`, `Sign ${h.name}`), () => {
        const signed = hireScout(state, hr.slot, i);
        if (signed) this.refresh([L(`스카웃 센터에서 ${c.name} ${signed.name}와(과) 계약했다.`, `Signed ${c.name} ${signed.name} from the scout center.`)]);
      }, { primary: true, size: 12 });
    });
    if (!list.length) text(this, GW / 2, 100, L('오늘 후보는 모두 계약했다. 직업을 골라 새로 뽑을 수 있다.', 'All of today\'s candidates are signed. You can still hire by class.'), 12, INK.faint).setOrigin(0.5, 0);
    button(this, x, GH - 130, w, 50, L('직업 골라서 뽑기', 'Hire by class instead'), () => this.scene.restart({ messages: this.messages, hire: { slot: hr.slot, direct: true } }));
    button(this, x, GH - 70, w, 50, L('취소', 'Cancel'), () => this.scene.restart({ messages: this.messages }));
  }

  /**
   * Hiring screen in two steps: pick a class, then one of two first skills.
   * Also used to re-sign an untouched hunter in another class.
   */
  private drawHiring(hr: NonNullable<HQData['hire']>) {
    if (!hr.cls && !hr.change && !hr.direct && unlocked(state.agent, 'scout')) return this.drawScouts(hr);
    const x = 14;
    const w = GW - 28;
    const back = () => this.scene.restart({ messages: this.messages });
    title(this, GW / 2, 18, hr.change ? L('직업 바꾸기', 'Change class') : L('새 헌터 고용', 'Hire a hunter'), 23, INK.text).setOrigin(0.5, 0);
    if (!hr.cls) {
      text(this, GW / 2, 52, L('직업을 고르세요. 외형과 성장이 직업을 따릅니다.', 'Pick a class. Looks and growth follow the class.'), 12, INK.quiet).setOrigin(0.5, 0);
      const cardH = PORTRAIT ? 128 : 112;
      const cols = PORTRAIT ? 1 : 2;
      const cw = (w - (cols - 1) * 12) / cols;
      CLASS_IDS.forEach((id, i) => {
        const c = CLASSES[id];
        const cx = x + (i % cols) * (cw + 12);
        const cy = 82 + Math.floor(i / cols) * (cardH + 10);
        panel(this, cx, cy, cw, cardH);
        const g = this.add.graphics();
        placeLook(this, g, c.look, cx + 14, cy + 14, 6);
        title(this, cx + 96, cy + 12, `${c.name}  ·  ${c.role}`, 15, INK.gold);
        text(this, cx + 96, cy + 38, L(`체력 ${c.base.hp} 마나 ${c.base.mp} 공격 ${c.base.atk} 방어 ${c.base.def}`, `HP ${c.base.hp} MP ${c.base.mp} ATK ${c.base.atk} DEF ${c.base.def}`), 12, INK.text);
        const passive = text(this, cx + 96, cy + 56, `${c.passive}: ${c.passiveText}`, 12, INK.quiet);
        if (lang() === 'en') fit(passive, cw - 110);
        else passive.setWordWrapWidth(cw - 110, true).setLineSpacing(-2);
        button(this, cx + 96, cy + cardH - 44, cw - 110, 34, L(`${c.name} 고르기`, `Pick ${c.name}`), () =>
          this.scene.restart({ messages: this.messages, hire: { ...hr, cls: id, skills: firstSkillChoices(id, rng) } }), { primary: true, size: 12 });
      });
      button(this, x, GH - 70, w, 50, L('취소', 'Cancel'), back);
      return;
    }
    const c = CLASSES[hr.cls];
    text(this, GW / 2, 52, L(`${c.name}의 첫 스킬을 하나 고르세요. 나머지는 레벨업 카드로 배웁니다.`, `Pick the ${c.name}'s first skill. The rest come from level-up cards.`), 12, INK.quiet).setOrigin(0.5, 0).setWordWrapWidth(w, true);
    (hr.skills ?? []).forEach((id, i) => {
      const sk = SKILLS[id];
      const cy = 96 + i * 120;
      panel(this, x, cy, w, 108);
      title(this, x + 16, cy + 12, L(`${sk.name}  ·  마나 ${sk.mp}`, `${sk.name}  ·  Mana ${sk.mp}`), 15, INK.gold);
      fit(text(this, x + 16, cy + 38, sk.text, 12, INK.text), w - 32);
      fit(text(this, x + 16, cy + 56, L(`5단계: ${sk.max}`, `Lv 5: ${sk.max}`), 12, INK.quiet), w - 32);
      button(this, x + 16, cy + 74, w - 32, 28, L(`${sk.name}(으)로 시작`, `Start with ${sk.name}`), () => {
        const h = hr.change ? changeClass(state, rng, hr.slot, hr.cls!, id) : hire(state, rng, hr.slot, hr.cls, id);
        const msg = h ? (hr.change ? L(`${h.name}의 직업을 ${c.name}(으)로 바꿨다.`, `${h.name} is now a ${c.name}.`) : L(`새 ${c.name} ${h.name}와(과) 계약했다.`, `Signed a new ${c.name}, ${h.name}.`)) : L('계약하지 못했다.', 'Could not sign a contract.');
        this.refresh([msg]);
      }, { primary: true, size: 12 });
    });
    button(this, x, GH - 130, w, 50, L('직업 다시 고르기', 'Pick class again'), () => this.scene.restart({ messages: this.messages, hire: { slot: hr.slot, change: hr.change, direct: hr.direct } }));
    button(this, x, GH - 70, w, 50, L('취소', 'Cancel'), back);
  }

  /**
   * First launch: name the agency. The name box is a real text field laid over the canvas,
   * so phones bring up their keyboard and Korean input works.
   */
  private drawFounding() {
    const w = Math.min(GW - 28, 520);
    const left = (GW - w) / 2;
    const top = PORTRAIT ? 150 : 120;
    title(this, GW / 2, top - 90, L('주인공을 찾습니다', 'Wanted: The Protagonist'), PORTRAIT ? 23 : 28, INK.text).setOrigin(0.5, 0);
    text(this, GW / 2, top - 54, L('— SSS급 헌터 에이전시', '— SSS-Rank Hunter Agency'), 12, INK.rust).setOrigin(0.5, 0);
    panel(this, left, top, w, 262, L('에이전시 설립', 'Found your agency'));
    text(this, GW / 2, top + 34, L('헌터를 키워 SSS급으로 만들 에이전시입니다.\n이름을 지어 주세요.', 'Your agency will raise a hunter to SSS rank.\nGive it a name.'), 12, INK.quiet)
      .setOrigin(0.5, 0).setAlign('center').setLineSpacing(4);
    const boxY = top + 96;
    const boxH = 52;
    const g = this.add.graphics();
    g.fillStyle(PALETTE.paper, 1).fillRect(left + 20, boxY, w - 40, boxH);
    g.lineStyle(2, PALETTE.rust, 1).strokeRect(left + 20, boxY, w - 40, boxH);
    const hint = text(this, GW / 2, boxY + boxH + 8, L(`${AGENCY_NAME_MAX}자까지`, `Up to ${AGENCY_NAME_MAX} characters`), 12, INK.faint).setOrigin(0.5, 0);

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = AGENCY_NAME_MAX;
    input.value = randomAgencyName(rng);
    input.setAttribute('aria-label', L('에이전시 이름', 'Agency name'));
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
        hint.setText(L('이름을 입력해 주세요.', 'Please enter a name.')).setColor(INK.red);
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
    button(this, left + 20, boxY + boxH + 40, bw, 50, L('랜덤 이름', 'Random name'), () => {
      input.value = randomAgencyName(rng, [input.value]);
    }, { size: 15 });
    button(this, left + 32 + bw, boxY + boxH + 40, bw, 50, L('설립하기', 'Found'), found, { primary: true, size: 15 });
  }

  /** The board of open gates. Going into one closes it, cleared or not. */
  private drawGates() {
    const x = 14;
    const w = GW - 28;
    const h = activeHunter(state);
    const day = state.day ?? 0;
    title(this, GW / 2, 18, L('열린 게이트', 'Open Gates'), 23, INK.text).setOrigin(0.5, 0);
    text(this, GW / 2, 52, L('들어가면 클리어하든 못 하든 닫힌다. 귀환할 때마다 하루가 지나고 새 게이트가 열린다.', 'A gate closes once entered, cleared or not. Each return ends the day and new gates open.'), 12, INK.quiet)
      .setOrigin(0.5, 0).setWordWrapWidth(w, true).setAlign('center');
    const rec = state.gateRecord ?? { ours: 0, rival: 0 };
    const rift = state.rift && !state.rift.entered ? [state.rift] : [];
    const gates = [...rift, ...(state.gates ?? [])];
    const cols = PORTRAIT ? 1 : 3;
    const rows = Math.ceil(gates.length / cols);
    const recY = (PORTRAIT ? 100 : 96) + rows * 146 + (PORTRAIT ? 4 : 8);
    const second = state.rival2 ? ` : ${rec.rival2 ?? 0} ${state.rival2.name}` : '';
    fit(text(this, GW / 2, recY, L(`게이트 공략  ${state.agent.name} ${rec.ours} : ${rec.rival} ${state.rival.name}${second}`, `Gates cleared  ${state.agent.name} ${rec.ours} : ${rec.rival} ${state.rival.name}${second}`), 12, INK.text).setOrigin(0.5, 0), w);
    text(this, GW / 2, recY + 20, L(`${state.rival.name}도 게이트를 노린다. 먼저 들어간 게이트는 다음 날 클리어될 수 있다.`, `${state.rival.name} is after the gates too. A gate they enter may be cleared the next day.`), 12, INK.faint)
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
      const left = g.closesOn - day;
      const due = text(this, cx + cw - 14, cy + 14, g.rival ? L('경쟁 중', 'Contested') : left <= 0 ? L('오늘까지', 'Last day') : L(`${left + 1}일 남음`, `${left + 1} days left`), 12, g.rival || g.rift ? INK.red : INK.quiet).setOrigin(1, 0);
      fit(title(this, cx + 14, cy + 12, gateName(g), 15, g.rift ? '#d79bff' : g.rule ? INK.red : INK.gold), cw - 36 - due.width);
      fit(text(this, cx + 14, cy + 38, L(`${g.rift ? `${g.grade}급 상당 · ` : ''}${gateFloors(g)}층 · 적정 Lv.${lvl}${hard ? ' (위험)' : ''}`, `${g.rift ? `~${g.grade}-Rank · ` : ''}${gateFloors(g)} floors · Lv.${lvl}${hard ? ' (danger)' : ''}`), 12, hard ? INK.red : INK.text), cw - 28);
      if (g.rift) {
        fit(text(this, cx + 14, cy + 56, cols > 1 ? L('단 한 번. 못 막으면 경쟁사가 가져간다', 'One try. Fail and the rival takes it') : L(`한 번뿐인 기회. 못 막으면 ${state.rival.name}이(가) 공을 가져간다`, `One chance only. Fail and ${state.rival.name} takes the glory`), 12, '#d79bff'), cw - 28);
      } else if (g.rival) {
        const who = g.rival.hunter ? L(`${g.rival.agency} ${g.rival.hunter}(Lv.${g.rival.level})`, `${g.rival.hunter} of ${g.rival.agency} (Lv.${g.rival.level})`) : L(`${g.rival.agency} 팀(Lv.${g.rival.level})`, `${g.rival.agency} team (Lv.${g.rival.level})`);
        fit(text(this, cx + 14, cy + 56, L(`${who} 공략 중${cols > 1 ? '' : ' · 다음 날 클리어 시도'}`, `${who} inside${cols > 1 ? '' : ' · may clear it tomorrow'}`), 12, '#d79bff'), cw - 28);
      } else {
        fit(text(this, cx + 14, cy + 56, L(`출몰: ${GATE_THEMES[g.theme].pool.map((id) => MONSTERS[id].name).join(', ')}`, `Monsters: ${GATE_THEMES[g.theme].pool.map((id) => MONSTERS[id].name).join(', ')}`), 12, INK.quiet), cw - 28);
      }
      fit(text(this, cx + 14, cy + 74, g.rule ? L(`특수 규칙 [${GATE_RULES[g.rule].name}] ${GATE_RULES[g.rule].text}`, `Rule [${GATE_RULES[g.rule].name}] ${GATE_RULES[g.rule].text}`) : L('특수 규칙 없음', 'No special rule'), 12, g.rule ? INK.rust : INK.faint), cw - 28);
      const verb = g.rift ? L('막으러 가기', 'Seal it') : g.rival ? L('가로채기', 'Steal it') : L('입장', 'Enter');
      const reward = g.rift ? L(`${gateClearGold(g)}G+마력석 ${gateClearStones(g)}`, `${gateClearGold(g)}G + ${gateClearStones(g)} stones`) : L(`클리어 보상 ${gateClearGold(g)}G+장비`, `Reward ${gateClearGold(g)}G + gear`);
      button(this, cx + 14, cy + cardH - 40, cw - 28, 30, `${verb} · ${reward}`, () => {
        persist();
        this.scene.start('Tower', { gateId: g.id });
      }, { primary: true, size: 12, enabled: !!h });
    });
    if (h) text(this, GW / 2, GH - 96, L(`보낼 헌터: ${h.name} · Lv.${h.level}`, `Sending: ${h.name} · Lv.${h.level}`), 12, INK.text).setOrigin(0.5, 0);
    this.backButton(x, w, () => this.scene.restart({ messages: this.messages }));
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
      const gw = Math.round(w * 0.25);
      const tw = w - 2 * gw - 16;
      const away = isAway(h);
      button(this, x, y, tw, hgt, away ? L('파견 중인 헌터', 'Hunter is away') : L('▶  성장의 탑', '▶  Tower of Growth'), () => {
        if (floors.length > 1) this.scene.restart({ messages: this.messages, pickStart: true });
        else go(1);
      }, { primary: !away, size: away ? 14 : size, enabled: !!h && !away });
      const arenaOk = !!h && unlocked(state.agent, 'arena') && canEnterArena(state, h);
      const dailyOk = !!h && dailyTriesLeft(state) > 0;
      this.featureButton('daily', x + tw + 8, y, gw, hgt, L('도전', 'Challenge'), () =>
        this.scene.restart({ messages: this.messages, challenges: true }), { size: Math.min(size, 18), enabled: !!h, primary: false });
      if (arenaOk || dailyOk) {
        const dot = this.add.graphics();
        dot.fillStyle(0xe0574f, 1).fillCircle(x + tw + 8 + gw - 10, y + 10, 5);
      }
      const rift = state.rift && !state.rift.entered;
      this.featureButton('gates', x + w - gw, y, gw, hgt, rift ? L(`게이트 ${state.gates?.length ?? 0}·균열`, `Gates ${state.gates?.length ?? 0}·Rift`) : L(`게이트 ${state.gates?.length ?? 0}`, `Gates ${state.gates?.length ?? 0}`), () =>
        this.scene.restart({ messages: this.messages, gates: true }), { size: Math.min(size, 18), enabled: !!h });
      return;
    }
    const cancelW = 56;
    const gap = 6;
    const bw = (w - cancelW - gap * floors.length) / floors.length;
    floors.forEach((f, i) => {
      const name = f > TOP_FLOOR ? L(`심연 ${f - TOP_FLOOR}`, `Abyss ${f - TOP_FLOOR}`) : L(`${f}층`, `${f}F`);
      button(this, x + i * (bw + gap), y, bw, hgt, floors.length > 4 ? name : L(`▶ ${name}부터`, `From ${name}`), () => go(f), { primary: true, size: Math.min(size, floors.length > 4 ? 14 : 16) });
    });
    button(this, x + w - cancelW, y, cancelW, hgt, L('취소', 'Cancel'), () => this.scene.restart({ messages: this.messages }), { size: 12 });
  }

  private createPortrait() {
    const { agent } = state;
    const x = 14;
    const w = GW - 28;
    title(this, x, 10, L('주인공을 찾습니다', 'Wanted: The Protagonist'), lang() === 'en' ? 15 : 20, INK.text);
    // Settings and legacy share one row under the title.
    this.soundButton(x, 38, 76, 22);
    this.legacyButton(x + 84, 38, 76, 22);
    this.codexButton(x + 168, 38, 76, 22);
    const worn = wornTitle(state);
    fit(text(this, GW - x, 12, `${agent.name} Lv.${agencyLevel(agent)}`, 12, INK.quiet).setOrigin(1, 0), 180);
    if (worn) fit(text(this, x + 250, 42, L(`「${worn}」`, worn), 12, INK.gold).setOrigin(0, 0), GW - x - 250 - 84);
    title(this, GW - x, 32, `${agent.gold}G`, 15, INK.gold).setOrigin(1, 0);
    dots(this, x, 64, w);
    this.drawSlots(x, 70, w);

    const top = 132;
    const tabsY = GH - 66;
    const departY = tabsY - 70;
    if (tab === 'hunter') {
      this.drawLicense(x, top, w);
      this.drawTraining(x, top + 278, w);
      this.drawQuestPanel(x, top + 446, w, departY - 34 - (top + 446));
    } else if (tab === 'shop') {
      this.drawBag(x, top + 8, w);
    } else if (tab === 'ranking') {
      this.drawRanking(x, top + 8, w);
    } else {
      // News: the rival agencies on top, the office log below.
      this.drawRival(x, top + 8, w);
      const logY = top + 100;
      this.drawLog(x, logY, w, Math.min(12, Math.floor((departY - logY - 70) / 40)), true);
    }

    // Latest news above the depart button, unless the log tab already shows it.
    if (this.messages.length && tab !== 'news') {
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
    title(this, 24, 18, L('주인공을 찾습니다', 'Wanted: The Protagonist'), 30, INK.text);
    const worn = wornTitle(state);
    text(this, 26, 58, L('— SSS급 헌터 에이전시', '— SSS-Rank Hunter Agency') + (worn ? `  「${worn}」` : ''), 12, INK.rust);
    text(this, 936, 22, `${agent.name} · Lv.${agencyLevel(agent)}`, 12, INK.quiet).setOrigin(1, 0);
    title(this, 936, 42, L(`운영 자금 ${agent.gold}G`, `Funds ${agent.gold}G`), 15, INK.gold).setOrigin(1, 0);
    dots(this, 24, 82, 912);
    this.codexButton(364, 20, 96, 28);
    this.questButton(468, 20, 96, 28);
    this.legacyButton(572, 20, 96, 28);
    this.soundButton(676, 20, 96);
  }

  /** The same back button at the bottom of every sub-screen (lower if the content needs it). */
  private backButton(x: number, w: number, onClick: () => void, minY = 0) {
    return button(this, x, Math.max(minY, GH - 62), w, 48, L('돌아가기', 'Back'), onClick, { size: 14 });
  }

  private soundButton(x: number, y: number, w: number, h = 28) {
    button(this, x, y, w, h, L('설정', 'Settings'), () => this.scene.restart({ settings: true, messages: this.messages }), { size: 12 });
  }

  private codexButton(x: number, y: number, w: number, h: number) {
    button(this, x, y, w, h, L('도감', 'Codex'), () => this.scene.restart({ codex: { view: 'monsters' }, messages: this.messages }), { size: 12 });
  }

  private legacyButton(x: number, y: number, w: number, h: number) {
    const pts = state.agent.legacy?.points ?? 0;
    button(this, x, y, w, h, pts > 0 ? L(`전승 ${pts}`, `Legacy ${pts}`) : L('전승', 'Legacy'), () => this.scene.restart({ legacy: true, messages: this.messages }), { primary: pts > 0, size: 12 });
  }

  /** The agency's gear storage: what the active hunter wears, and what is kept. */
  private drawStash() {
    const h = activeHunter(state);
    const stash = state.agent.stash ?? [];
    const x = 14;
    const w = GW - 28;
    title(this, GW / 2, 14, L('장비 창고', 'Gear Storage'), 23, INK.text).setOrigin(0.5, 0);
    text(this, GW / 2, 46, L('탐험 중 바꾼 장비는 창고로 온다. 꺼내 입을 땐 운영 자금이 들고, 헌터 레벨이 장비 레벨 이상이어야 한다.', 'Gear swapped out on runs comes here. Taking a piece out costs agency funds and needs the hunter at the gear\'s level.'), 12, INK.quiet)
      .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(w, true);
    const rowH = PORTRAIT ? 27 : 30;
    const cols = PORTRAIT ? 1 : 2;
    const cw = cols > 1 ? (w - 12) / 2 : w;
    const top = PORTRAIT ? 100 : 80;
    const refresh = (msg: string) => this.scene.restart({ messages: [msg, ...this.messages], stash: true });
    // Worn gear, with "leave it here".
    const wornH = 24 + GEAR_SLOTS.length * rowH;
    panel(this, x, top, cw, wornH, h ? L(`${h.name} 착용 (Lv.${h.level})`, `${h.name} wears (Lv.${h.level})`) : L('착용', 'Worn'));
    GEAR_SLOTS.forEach((slot, i) => {
      const g = h?.gear[slot];
      const ry = top + 20 + i * rowH;
      fit(text(this, x + 12, ry + 5, g ? `${GEAR_SLOT_NAMES[slot]} · ${gearLabel(g)}` : L(`${GEAR_SLOT_NAMES[slot]} · 비어 있음`, `${GEAR_SLOT_NAMES[slot]} · empty`), 12, g ? INK.text : INK.faint), cw - 110);
      if (g) button(this, x + cw - 86, ry, 74, rowH - 4, L('맡기기', 'Store'), () => {
        if (depositGear(state, slot)) { persist(); refresh(L(`${gearLabel(g)}을(를) 창고에 맡겼다.`, `Stored ${gearLabel(g)}.`)); }
      }, { size: 12, enabled: stash.length < STASH_SIZE });
    });
    // Stored gear, with "wear" (fee, level) and "sell".
    const sx = cols > 1 ? x + cw + 12 : x;
    const sy = cols > 1 ? top : top + wornH + 12;
    panel(this, sx, sy, cw, 24 + STASH_SIZE * rowH, L(`창고 ${stash.length}/${STASH_SIZE} · 운영 자금 ${state.agent.gold}G`, `Storage ${stash.length}/${STASH_SIZE} · Funds ${state.agent.gold}G`));
    if (!stash.length) text(this, sx + 12, sy + 26, L('비어 있다. 탐험에서 장비를 바꾸면 쌓인다.', 'Empty. Gear you swap out on runs piles up here.'), 12, INK.faint);
    stash.forEach((g, i) => {
      const ry = sy + 20 + i * rowH;
      const need = gearLevel(g);
      const fee = stashFee(g);
      const levelOk = !!h && h.level >= need;
      fit(text(this, sx + 12, ry + 5, `${GEAR_SLOT_NAMES[g.slot]} · ${gearLabel(g)} · Lv.${need}`, 12, levelOk ? INK.text : INK.red), cw - 190);
      button(this, sx + cw - 172, ry, 96, rowH - 4, levelOk ? L(`착용 ${fee}G`, `Wear ${fee}G`) : L(`Lv.${need} 필요`, `Needs Lv.${need}`), () => {
        const r = withdrawGear(state, i);
        if (!r.ok) return;
        persist();
        sfx.gear();
        refresh(L(`${gearLabel(g)}을(를) 꺼내 입었다. (-${r.fee}G)`, `Put on ${gearLabel(g)}. (-${r.fee}G)`) + (r.swapped ? L(` ${gearLabel(r.swapped)}은(는) 창고로.`, ` ${gearLabel(r.swapped)} went to storage.`) : ''));
      }, { size: 12, enabled: levelOk && state.agent.gold >= fee, primary: levelOk && state.agent.gold >= fee });
      button(this, sx + cw - 72, ry, 60, rowH - 4, L(`팔기 ${stashPrice(g)}`, `Sell ${stashPrice(g)}`), () => {
        const price = sellStashed(state, i);
        persist();
        refresh(L(`${gearLabel(g)}을(를) ${price}G에 팔았다.`, `Sold ${gearLabel(g)} for ${price}G.`));
      }, { size: 12 });
    });
    if (this.messages[0]) fit(text(this, GW / 2, GH - 84, this.messages[0], 12, INK.gold).setOrigin(0.5, 0), w);
    this.backButton(x, w, () => this.scene.restart({ messages: this.messages }));
  }

  /** The survival arena's entrance: the rules, the prizes, the records, and the way in. */
  /** Header button to the association's quest board, with how many quests are open. */
  private questButton(x: number, y: number, w: number, h: number) {
    const open = (state.quests?.list ?? []).filter((q) => q.have < q.need).length;
    this.featureButton('quests', x, y, w, h, L(`의뢰판 ${open}`, `Quests ${open}`), () => this.scene.restart({ messages: this.messages, quests: true }), { size: 12, primary: open > 0 });
  }

  /** Button to the departure prep screen, naming the prep already bought. */
  private prepButton(x: number, y: number, w: number, h: number) {
    const hunter = activeHunter(state);
    const label = hunter?.prep ? L(`준비: ${PREPS[hunter.prep].name}`, `Prep: ${PREPS[hunter.prep].name}`) : L('출정 준비', 'Departure prep');
    this.featureButton('prep', x, y, w, h, label, () => this.scene.restart({ messages: this.messages, prep: true }), { size: 12, primary: !!hunter?.prep });
  }

  /** One quest as a line with a progress bar, for the board and the portrait panel. */
  private questLine(q: Quest, x: number, y: number, w: number, big = false) {
    const day = state.day ?? 0;
    const left = daysLeft(q, day);
    fit(text(this, x, y, questText(q), big ? 14 : 12, INK.text, big), w - 90);
    text(this, x + w, y, L(`${left}일 남음`, `${left}d left`), 12, left <= 1 ? INK.red : INK.quiet).setOrigin(1, 0);
    const by = y + (big ? 24 : 20);
    const bw = w - 90;
    const g = this.add.graphics();
    g.fillStyle(0x2a221c, 1).fillRect(x, by, bw, 6);
    g.fillStyle(0xd9a441, 1).fillRect(x, by, Math.round((bw * Math.min(q.have, q.need)) / q.need), 6);
    text(this, x + w, by - 4, `${Math.min(q.have, q.need)}/${q.need}`, 12, INK.gold).setOrigin(1, 0);
    if (big) fit(text(this, x, by + 12, L(`보상 ${questReward(q)}`, `Reward ${questReward(q)}`), 12, INK.quiet), w);
  }

  /** Portrait: the quest board in short, under training. Tapping it opens the board. */
  private drawQuestPanel(x: number, y: number, w: number, hgt: number) {
    if (hgt < 90) return;
    panel(this, x, y, w, hgt, L('협회 의뢰판', 'Association Quests'));
    this.prepButton(x + w - 140, y + 6, 126, 24);
    if (!unlocked(state.agent, 'quests')) {
      text(this, x + 16, y + 40, L(`에이전시 Lv.${FEATURE_LEVEL.quests}이 되면 협회 의뢰를 받을 수 있다.`, `Quests open at agency Lv.${FEATURE_LEVEL.quests}.`), 12, INK.faint);
      // Until then the space shows the latest office news.
      dots(this, x + 16, y + 66, w - 32);
      text(this, x + 16, y + 76, L('최근 소식', 'Latest news'), 12, INK.gold, true);
      const lines = this.messages.slice(0, Math.max(0, Math.floor((hgt - 104) / 20)));
      if (!lines.length) text(this, x + 16, y + 98, L('특이사항 없음.', 'Nothing to report.'), 12, INK.faint);
      lines.forEach((m, i) => fit(text(this, x + 16, y + 98 + i * 20, `· ${m}`, 12, i === 0 ? INK.text : INK.quiet), w - 32));
      return;
    }
    const list = state.quests?.list ?? [];
    // Rewards fit under each quest when the panel is tall enough.
    const big = list.length > 0 && hgt - 40 >= list.length * 58;
    const rowH = big ? 58 : 34;
    const rows = Math.min(list.length, Math.floor((hgt - 40) / rowH));
    list.slice(0, rows).forEach((q, i) => this.questLine(q, x + 16, y + 36 + i * rowH, w - 32, big));
    const zone = this.add.zone(x, y + 30, w, hgt - 30).setOrigin(0).setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => this.scene.restart({ messages: this.messages, quests: true }));
  }

  /** What each agency level opens, and how much experience it takes. */
  private drawLevels() {
    const w = Math.min(GW - 28, 640);
    const x = (GW - w) / 2;
    const lv = agencyLevel(state.agent);
    title(this, GW / 2, 16, L('에이전시 레벨표', 'Agency Levels'), 23, INK.text).setOrigin(0.5, 0);
    text(this, GW / 2, 50, L(`상납금 1G = 경험치 1, 투자금 1G = 경험치 ${INVEST_EXP}. 의뢰를 깨도 경험치를 받는다.`, `1G of cut = 1 EXP, 1G invested = ${INVEST_EXP} EXP. Quests give EXP too.`), 12, INK.quiet)
      .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(w, true);
    const top = PORTRAIT ? 96 : 80;
    const rowH = PORTRAIT ? 64 : 66;
    const first = [L('훈련', 'Training'), L('투자', 'Investment'), L('헌터 1번 슬롯', 'Hunter slot 1')];
    for (let l = 1; l <= MAX_AGENCY_LEVEL; l++) {
      const y = top + (l - 1) * rowH;
      const here = l === lv;
      const reached = l <= lv;
      const g = this.add.graphics();
      g.fillStyle(here ? 0x3a2a1c : PALETTE.panelDark, 1).fillRect(x, y, w, rowH - 6);
      if (here) g.fillStyle(PALETTE.rustLight, 1).fillRect(x, y, 4, rowH - 6);
      title(this, x + 14, y + 8, `Lv.${l}`, 15, reached ? INK.gold : INK.faint);
      text(this, x + 14, y + 32, L(`${AGENCY_LEVEL_EXP[l - 1]}`, `${AGENCY_LEVEL_EXP[l - 1]}`), 12, INK.faint);
      const opens = l === 1 ? first : opensAt(l);
      text(this, x + 86, y + 8, opens.join(' · '), 12, reached ? INK.text : INK.quiet).setWordWrapWidth(w - 100, true);
    }
    this.backButton(x, w, () => this.scene.restart({ messages: this.messages }));
  }

  /** The Hunter Association's quest board: three quests, each open a few days. */
  private drawQuests() {
    const w = Math.min(GW - 28, 600);
    const x = (GW - w) / 2;
    title(this, GW / 2, 16, L('헌터 협회 의뢰판', 'Hunter Association Quests'), 23, INK.text).setOrigin(0.5, 0);
    text(this, GW / 2, 50, L(`의뢰는 ${QUEST_DAYS}일 동안 열려 있다. 헌터가 살아서 돌아와야 진행이 인정된다.`, `Each quest stays up for ${QUEST_DAYS} days. Progress counts only when the hunter comes home.`), 12, INK.quiet)
      .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(w, true);
    const top = PORTRAIT ? 96 : 84;
    const list = state.quests?.list ?? [];
    const cardH = 84;
    list.forEach((q, i) => {
      const cy = top + i * (cardH + 10);
      panel(this, x, cy, w, cardH, L(`의뢰 ${i + 1}`, `Quest ${i + 1}`));
      this.questLine(q, x + 16, cy + 22, w - 32, true);
    });
    let y = top + list.length * (cardH + 10) + 8;
    const rules = [
      L('· 처치 수와 벌어온 골드는 여러 번 출정해도 쌓인다.', '· Kills and gold add up over several runs.'),
      L('· 보상은 에이전시가 받는다: 운영 자금, 마력석, 에이전시 경험치.', '· Rewards go to the agency: funds, mana stones, agency EXP.'),
      L('· 끝난 의뢰와 기한이 지난 의뢰 자리에는 다음 날 새 의뢰가 올라온다.', '· Finished or expired quests are replaced the next day.'),
    ];
    rules.forEach((r) => {
      fit(text(this, x + 6, y, r, 12, INK.faint), w - 12);
      y += 20;
    });
    text(this, x + 6, y + 6, L(`지금까지 완료한 의뢰 ${state.quests?.done ?? 0}건`, `Quests done so far: ${state.quests?.done ?? 0}`), 13, INK.gold);
    this.backButton(x, w, () => this.scene.restart({ messages: this.messages }));
  }

  /** Departure prep: one paid boost for the next run, bought with agency funds. */
  private drawPrep() {
    const w = Math.min(GW - 28, 600);
    const x = (GW - w) / 2;
    const h = activeHunter(state);
    title(this, GW / 2, 16, L('출정 준비', 'Departure Prep'), 23, INK.text).setOrigin(0.5, 0);
    text(this, GW / 2, 50, L('운영 자금으로 다음 출정 한 번을 준비해 준다. 한 번에 하나만, 귀환하거나 쓰러지면 끝난다.', 'Agency funds prepare the next run. One at a time; it ends when the hunter returns or falls.'), 12, INK.quiet)
      .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(w, true);
    if (!h) return;
    const top = PORTRAIT ? 104 : 92;
    const cost = prepCost(h);
    PREP_IDS.forEach((id, i) => {
      const p = PREPS[id];
      const cy = top + i * 74;
      const on = h.prep === id;
      panel(this, x, cy, w, 64);
      title(this, x + 16, cy + 12, p.name, 15, on ? INK.gold : INK.text);
      text(this, x + 16, cy + 38, p.describe, 12, INK.quiet);
      button(this, x + w - 136, cy + 14, 120, 36, on ? L('준비됨', 'Ready') : L(`준비 ${cost}G`, `Buy ${cost}G`), () => {
        if (buyPrep(state, id)) {
          sfx.gear();
          persist();
          this.scene.restart({ messages: [L(`${h.name}의 출정 준비: ${p.name}. 운영 자금 -${cost}G`, `${h.name}'s prep: ${p.name}. Funds -${cost}G`)], prep: true });
        }
      }, { primary: !on, enabled: !on && state.agent.gold >= cost });
    });
    let y = top + PREP_IDS.length * 74 + 6;
    text(this, x + 6, y, L(`보낼 헌터: ${h.name} · Lv.${h.level} · 운영 자금 ${state.agent.gold}G`, `Hunter: ${h.name} · Lv.${h.level} · Funds ${state.agent.gold}G`), 12, INK.text);
    y += 22;
    if (h.prep) text(this, x + 6, y, L('다른 준비로 바꾸면 이미 낸 돈은 돌려받지 못한다.', 'Switching to another prep does not refund the first.'), 12, INK.faint);
    this.backButton(x, w, () => this.scene.restart({ messages: this.messages }));
  }

  private drawArena() {
    const w = Math.min(GW - 28, 600);
    const x = (GW - w) / 2;
    const h = activeHunter(state);
    title(this, GW / 2, 16, L('생존 아레나', 'Survival Arena'), 23, INK.text).setOrigin(0.5, 0);
    text(this, GW / 2, 50, L('끝없이 몰려오는 웨이브를 버텨라. 웨이브마다 적이 더 강해진다.', 'Hold out against endless waves. Each one is stronger.'), 12, INK.quiet)
      .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(w, true);
    const rules = [
      L('· 하루에 한 번, 헌터마다 도전할 수 있다.', '· Once a day per hunter.'),
      L('· 웨이브를 넘기면 골드를 받는다. 체력·마나는 회복되지 않는다.', '· Each wave cleared pays gold. HP and MP do not recover.'),
      L('· 웨이브 사이에 귀환하면 번 것을 모두 가져간다.', '· Go home between waves and keep everything.'),
      L('· 쓰러져도 죽지 않는다. 진행 중인 웨이브 수입만 잃는다.', '· Falling will not kill you; you lose only the current wave’s income.'),
      L('· 5웨이브마다 챔피언이 나온다. 쓰러뜨리면 마력석과 체력·마나 30% 회복.', '· Every 5th wave brings a champion: beat it for mana stones and 30% HP and MP.'),
      L('· 10웨이브마다 기념 장비를 준다 (6단계부터).', '· Every 10th wave gives prize gear (tier 6 and up).'),
    ];
    const top = PORTRAIT ? 96 : 84;
    panel(this, x, top, w, 24 + rules.length * 24, L('규칙', 'Rules'));
    rules.forEach((r, i) => fit(text(this, x + 16, top + 20 + i * 24, r, 13, INK.text), w - 32));
    let y = top + 24 + rules.length * 24 + 24;
    const rec = arenaRecord(state);
    text(this, x + 6, y, rec ? L(`에이전시 최고 기록: ${rec.wave}웨이브 · ${rec.name}`, `Agency record: ${rec.wave} waves · ${rec.name}`) : L('에이전시 최고 기록: 아직 없음', 'Agency record: none yet'), 13, INK.gate);
    y += 24;
    if (h) text(this, x + 6, y, L(`${h.name}의 최고 기록: ${h.arenaBest ?? 0}웨이브`, `${h.name}'s best: ${h.arenaBest ?? 0} waves`), 13, INK.gold);
    y += 24;
    const ok = !!h && canEnterArena(state, h);
    const why = !h ? '' : !arenaUnlocked(h) ? L(`성장의 탑 ${ARENA_UNLOCK_FLOOR}층을 돌파하면 열린다.`, `Opens once you clear Tower ${ARENA_UNLOCK_FLOOR}F.`)
      : !ok ? L('오늘은 이미 도전했다. 귀환하면 하루가 지난다.', 'Already in today. A day passes with each return.') : '';
    if (why) text(this, GW / 2, GH - 150, why, 13, INK.red).setOrigin(0.5, 0);
    if (h) text(this, GW / 2, GH - 124, L(`보낼 헌터: ${h.name} · Lv.${h.level} · 체력 ${h.hp}/${h.maxHp}`, `Sending: ${h.name} · Lv.${h.level} · HP ${h.hp}/${h.maxHp}`), 12, INK.text).setOrigin(0.5, 0);
    button(this, x, GH - 100, w, 40, L('▶  아레나 입장', '▶  Enter the arena'), () => {
      const survival = startSurvival(state);
      if (!survival) return;
      persist();
      this.scene.start('Tower', { survival });
    }, { primary: ok, enabled: ok });
    this.backButton(x, w, () => this.scene.restart({ messages: this.messages, challenges: true }));
  }

  /** Challenges: today's rift on top, the survival arena under it. */
  private drawChallenges() {
    const w = Math.min(GW - 28, 600);
    const x = (GW - w) / 2;
    const h = activeHunter(state);
    const date = todayKey();
    const rec = dailyToday(state.daily, date);
    const left = dailyTriesLeft(state);
    title(this, GW / 2, 16, L('도전', 'Challenges'), 23, INK.text).setOrigin(0.5, 0);
    text(this, GW / 2, 48, L('날마다 바뀌는 균열과 끝없는 아레나. 쓰러져도 목숨은 잃지 않는다.', 'A rift that changes daily and an endless arena. Falling here will not kill you.'), 12, INK.quiet)
      .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(w, true);

    // Today's rift.
    let y = PORTRAIT ? 96 : 84;
    const lines: Array<[string, string]> = [
      [L(`${DAILY_FLOORS}층 · 오늘은 누가 몇 번 들어가도 같은 맵과 몬스터 · 하루 ${DAILY_TRIES}번`, `${DAILY_FLOORS} floors · same map and monsters for every try today · ${DAILY_TRIES} tries a day`), INK.quiet],
      ...dailyRules(date).map((r): [string, string] => [`[${DAILY_RULES[r].name}] ${DAILY_RULES[r].text}`, DAILY_RULES[r].good ? INK.gate : INK.rust]),
      [L(`점수: 처치 점수 + 층마다 100 + ${DAILY_FLOORS}층 모두 넘기면 속도 보너스 (${DAILY_SPEED_BONUS} − 턴)`, `Score: kill points + 100 a floor + speed bonus for all ${DAILY_FLOORS} (${DAILY_SPEED_BONUS} − turns)`), INK.quiet],
      [L(`오늘 최고 점수를 넘기면 ${DAILY_POINTS_PER_STONE}점마다 마력석 1개 · 에이전시 신기록 +${DAILY_RECORD_STONES}`, `Beat today's best: 1 mana stone per ${DAILY_POINTS_PER_STONE} points · agency record +${DAILY_RECORD_STONES}`), INK.quiet],
      [rec.best ? L(`오늘 최고 ${rec.best}점 · ${rec.bestBy}`, `Today's best ${rec.best} · ${rec.bestBy}`) : L('오늘 최고: 아직 없음', "Today's best: none yet"), INK.gold],
      [rec.ever ? L(`에이전시 신기록 ${rec.ever}점 · ${rec.everBy} (${dateLabel(rec.everDate ?? date)})`, `Agency record ${rec.ever} · ${rec.everBy} (${dateLabel(rec.everDate ?? date)})`) : L('에이전시 신기록: 아직 없음', 'Agency record: none yet'), INK.gate],
    ];
    if (h) lines.push([L(`${h.name}에게는 탑 ${dailyBase(h.bestFloor)}~${dailyBase(h.bestFloor) + DAILY_FLOORS - 1}층 수준 (최고 층에 맞춰짐)`, `For ${h.name}: like Tower ${dailyBase(h.bestFloor)}-${dailyBase(h.bestFloor) + DAILY_FLOORS - 1}F (follows their best floor)`), INK.text]);
    // Lines wrap (English runs long); the panel is drawn behind them once their height is known.
    let ty = y + 20;
    for (const [t, c] of lines) {
      const o = text(this, x + 14, ty, t, 12, c).setWordWrapWidth(w - 28, true).setDepth(1);
      ty += o.height + 3;
    }
    const ph = ty - y + 62;
    const lh = 21;
    panel(this, x, y, w, ph, L(`오늘의 균열 · ${dateLabel(date)}`, `Today's Rift · ${dateLabel(date)}`));
    const by = y + ph - 50;
    const away = isAway(h);
    const label = left > 0 ? L(`▶  균열 입장 (남은 도전 ${left}/${DAILY_TRIES})`, `▶  Enter the rift (${left}/${DAILY_TRIES} left)`) : L('오늘은 모두 도전했다. 내일 새 균열이 열린다.', 'No tries left. A new rift opens tomorrow.');
    this.featureButton('daily', x + 14, by, w - 28, 40, label, () => {
      const daily = startDaily(state);
      if (!daily) return;
      persist();
      this.scene.start('Tower', { daily });
    }, { primary: left > 0 && !away, enabled: !!h && left > 0 && !away, size: 14 });

    // The survival arena.
    y += ph + 22;
    const arena = arenaRecord(state);
    const aLines = [
      arena ? L(`에이전시 최고 기록: ${arena.wave}웨이브 · ${arena.name}`, `Agency record: ${arena.wave} waves · ${arena.name}`) : L('에이전시 최고 기록: 아직 없음', 'Agency record: none yet'),
      !h ? '' : !arenaUnlocked(h) ? L(`${h.name}: 성장의 탑 ${ARENA_UNLOCK_FLOOR}층을 돌파하면 열린다.`, `${h.name}: opens after clearing Tower ${ARENA_UNLOCK_FLOOR}F.`)
        : canEnterArena(state, h) ? L(`${h.name}: 오늘 도전 가능 · 최고 ${h.arenaBest ?? 0}웨이브`, `${h.name}: can enter today · best ${h.arenaBest ?? 0} waves`)
        : L(`${h.name}: 오늘은 이미 도전했다 · 최고 ${h.arenaBest ?? 0}웨이브`, `${h.name}: already in today · best ${h.arenaBest ?? 0} waves`),
    ].filter((t) => t);
    const ah = 30 + aLines.length * lh + 58;
    if (y + ah < GH - 70) {
      panel(this, x, y, w, ah, L('생존 아레나', 'Survival Arena'));
      aLines.forEach((t, i) => fit(text(this, x + 14, y + 20 + i * lh, t, 12, i === 0 ? INK.gate : INK.text), w - 28));
      const ok = !!h && unlocked(state.agent, 'arena') && canEnterArena(state, h);
      this.featureButton('arena', x + 14, y + ah - 50, w - 28, 40, L('아레나 안내 · 입장 ▸', 'Arena rules · Enter ▸'), () =>
        this.scene.restart({ messages: this.messages, arena: true }), { primary: ok, size: 14 });
    }
    this.backButton(x, w, () => this.scene.restart({ messages: this.messages }));
  }

  /** The monster codex and the achievements, on two tabs. */
  private drawCodex(view: NonNullable<HQData['codex']>) {
    const w = Math.min(GW - 28, 900);
    const x = (GW - w) / 2;
    const done = ACHIEVEMENTS.filter((a) => isDone(state, a.id)).length;
    title(this, GW / 2, 14, view.view === 'monsters' ? L('몬스터 도감', 'Monster Codex') : L('업적', 'Achievements'), 23, INK.text).setOrigin(0.5, 0);
    const tw = (w - 8) / 2;
    const open = (v: NonNullable<HQData['codex']>) => () => this.scene.restart({ codex: v, messages: this.messages });
    button(this, x, 46, tw, 32, L(`도감 ${codexCount(state)}/${CODEX_IDS.length}`, `Codex ${codexCount(state)}/${CODEX_IDS.length}`), open({ view: 'monsters' }), { primary: view.view === 'monsters', size: 13 });
    button(this, x + tw + 8, 46, tw, 32, L(`업적 ${done}/${ACHIEVEMENTS.length}`, `Achievements ${done}/${ACHIEVEMENTS.length}`), open({ view: 'achievements' }), { primary: view.view === 'achievements', size: 13 });
    if (view.view === 'monsters') this.drawMonsterCodex(x, 92, w, view.pick);
    else this.drawAchievements(x, 92, w, view.page ?? 0);
    this.backButton(x, w, () => this.scene.restart({ messages: this.messages }));
  }

  private drawMonsterCodex(x: number, top: number, w: number, pick?: string) {
    const cols = PORTRAIT ? 2 : 4;
    const gap = 8;
    const cw = (w - gap * (cols - 1)) / cols;
    const ch = PORTRAIT ? 70 : 74;
    const codex = state.codex ?? {};
    CODEX_IDS.forEach((id, i) => {
      const cx = x + (i % cols) * (cw + gap);
      const cy = top + Math.floor(i / cols) * (ch + 6);
      const e = codex[id];
      const k = MONSTERS[id];
      const g = this.add.graphics();
      const on = pick === id;
      g.fillStyle(on ? 0x3a2a1c : PALETTE.panelDark, 1).fillRect(cx, cy, cw, ch);
      g.lineStyle(on ? 2 : 1, on ? PALETTE.rustLight : PALETTE.line, 1).strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1);
      const img = this.add.image(cx + 28, cy + ch / 2, monsterTexture(this, id));
      img.setScale(Math.min(44 / img.width, 44 / img.height));
      if (!e) img.setTint(0x000000).setAlpha(0.7);
      const tx = cx + 56;
      const tw = cw - 62;
      if (!e) {
        title(this, tx, cy + 10, '???', 14, INK.faint);
        fit(text(this, tx, cy + 34, L(`미발견 · ${codexWhere(id)}`, `Not found · ${codexWhere(id)}`), 12, INK.faint), tw);
      } else {
        fit(title(this, tx, cy + 8, k.name, 13, k.boss ? INK.gold : INK.text), tw);
        fit(text(this, tx, cy + 28, elementNote(k) || L('약점 없음', 'No weakness'), 12, INK.gate), tw);
        fit(text(this, tx, cy + 47, `${k.trait ? `${TRAITS[k.trait].name} · ` : ''}${L(`처치 ${e.kills}`, `${e.kills} defeated`)}`, 12, INK.quiet), tw);
      }
      this.add.zone(cx, cy, cw, ch).setOrigin(0).setInteractive({ useHandCursor: true })
        .on('pointerup', () => this.scene.restart({ codex: { view: 'monsters', pick: on ? undefined : id }, messages: this.messages }));
    });
    const rows = Math.ceil(CODEX_IDS.length / cols);
    const dy = top + rows * (ch + 6) + 8;
    const room = GH - 70 - dy;
    if (room < 60) return;
    const k = pick ? MONSTERS[pick] : undefined;
    const e = pick ? codex[pick] : undefined;
    const lines: Array<[string, string]> = [];
    if (!k) {
      lines.push([L('카드를 누르면 자세히 볼 수 있다.', 'Tap a card for details.'), INK.quiet]);
      lines.push([L('처음 쓰러뜨린 몬스터가 도감에 등록된다. 중간보스는 그 몬스터로 친다.', 'A monster is entered the first time one falls. Mid-bosses count as their kind.'), INK.quiet]);
      lines.push([L(`도감을 채우면 업적 보상을 받는다 (6종 · ${CODEX_IDS.length}종).`, `Filling the codex earns achievements (6 and ${CODEX_IDS.length}).`), INK.quiet]);
    } else if (!e) {
      lines.push([L(`아직 쓰러뜨린 적이 없는 몬스터. 나오는 곳: ${codexWhere(pick!)}`, `Not defeated yet. Found at: ${codexWhere(pick!)}`), INK.quiet]);
    } else {
      lines.push([`${k.name} · ${codexWhere(pick!)}`, k.boss ? INK.gold : INK.text]);
      lines.push([L(`기본 체력 ${k.hp} · 공격 ${k.atk} · 방어 ${k.def}${k.range ? ` · 사거리 ${k.range}` : ''} (층이 오를수록 강해진다)`, `Base HP ${k.hp} · ATK ${k.atk} · DEF ${k.def}${k.range ? ` · Range ${k.range}` : ''} (stronger on higher floors)`), INK.text]);
      lines.push([elementNote(k) || L('약점·저항 없음', 'No weakness or resistance'), INK.gate]);
      if (k.trait) lines.push([`[${TRAITS[k.trait].name}] ${TRAITS[k.trait].text}`, INK.quiet]);
      lines.push([L(`처치 ${e.kills}마리 · ${e.day + 1}일째에 처음 쓰러뜨림`, `${e.kills} defeated · first on day ${e.day + 1}`), INK.gold]);
    }
    const ph = Math.min(room, 24 + lines.length * 20);
    panel(this, x, dy, w, ph, L('자세히', 'Details'));
    lines.slice(0, Math.floor((ph - 20) / 20)).forEach(([t, c], i) => fit(text(this, x + 14, dy + 16 + i * 20, t, 12, c), w - 28));
  }

  private drawAchievements(x: number, top: number, w: number, page: number) {
    const worn = wornTitle(state);
    text(this, x + 4, top + 4, worn ? L(`지금 칭호: 「${worn}」`, `Title: "${worn}"`) : L('칭호 없음 · 달성한 업적의 칭호를 달 수 있다', 'No title · wear one from an achievement you reached'), 12, worn ? INK.gold : INK.quiet);
    if (worn) button(this, x + w - 90, top, 90, 24, L('칭호 떼기', 'Remove'), () => {
      wearTitle(state, undefined);
      persist();
      this.scene.restart({ codex: { view: 'achievements', page }, messages: this.messages });
    }, { size: 12 });
    const y0 = top + 32;
    const rowH = 66;
    const per = Math.max(1, Math.floor((GH - 110 - y0) / rowH));
    const pages = Math.ceil(ACHIEVEMENTS.length / per);
    const p = Math.min(page, pages - 1);
    ACHIEVEMENTS.slice(p * per, p * per + per).forEach((a, i) => {
      const y = y0 + i * rowH;
      const ok = isDone(state, a.id);
      const [have, need] = a.progress(state);
      const g = this.add.graphics();
      g.fillStyle(ok ? 0x3a2a1c : PALETTE.panelDark, 1).fillRect(x, y, w, rowH - 6);
      if (ok) g.fillStyle(PALETTE.rustLight, 1).fillRect(x, y, 4, rowH - 6);
      const bw = 84;
      fit(title(this, x + 12, y + 5, `${ok ? '★ ' : ''}${a.name}`, 13, ok ? INK.gold : INK.text), w - bw - 90);
      fit(text(this, x + 12, y + 24, `${a.text} · ${rewardText(a)}`, 12, ok ? INK.text : INK.quiet), w - bw - 28);
      fit(text(this, x + 12, y + 42, `${L('칭호', 'Title')} 「${a.title}」`, 12, ok ? INK.gold : INK.faint), w - bw - 28);
      if (ok) {
        const on = state.achievements?.title === a.id;
        button(this, x + w - bw - 8, y + 14, bw, 32, on ? L('착용 중', 'Worn') : L('칭호 달기', 'Wear'), () => {
          wearTitle(state, a.id);
          persist();
          this.scene.restart({ codex: { view: 'achievements', page: p }, messages: [L(`칭호 「${a.title}」을(를) 달았다.`, `Now wearing "${a.title}".`), ...this.messages] });
        }, { enabled: !on, primary: false, size: 12 });
      } else {
        text(this, x + w - 12, y + 14, `${Math.min(have, need)}/${need}`, 12, INK.quiet).setOrigin(1, 0);
        const bwid = 70;
        const gg = this.add.graphics();
        gg.fillStyle(0x2a221c, 1).fillRect(x + w - 12 - bwid, y + 36, bwid, 5);
        gg.fillStyle(0xd9a441, 1).fillRect(x + w - 12 - bwid, y + 36, Math.round((bwid * Math.min(have, need)) / need), 5);
      }
    });
    if (pages > 1) {
      const py = y0 + per * rowH + 2;
      button(this, x, py, 70, 30, '◀', () => this.scene.restart({ codex: { view: 'achievements', page: p - 1 }, messages: this.messages }), { enabled: p > 0, size: 13 });
      text(this, GW / 2, py + 7, `${p + 1} / ${pages}`, 13, INK.quiet).setOrigin(0.5, 0);
      button(this, x + w - 70, py, 70, 30, '▶', () => this.scene.restart({ codex: { view: 'achievements', page: p + 1 }, messages: this.messages }), { enabled: p < pages - 1, size: 13 });
    }
  }

  /** Legacy: perks bought with points from retired hunters, the legends, the abyss record. */
  private drawLegacy() {
    const w = Math.min(GW - 28, 600);
    const x = (GW - w) / 2;
    const legacy = (state.agent.legacy ??= { points: 0, perks: {} });
    title(this, GW / 2, 16, L('전승', 'Legacy'), 23, INK.text).setOrigin(0.5, 0);
    const intro = text(this, GW / 2, 48, L('S급 이상 헌터가 은퇴하면 전승 포인트를 남긴다.\n(S 1 · SS 3 · SSS 10) 보너스는 영원히 남는다.', 'S-Rank or better hunters can retire for legacy points (S 1 · SS 3 · SSS 10).\nBonuses bought with them last forever, for every hunter after.'), 12, INK.quiet)
      .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(w, true);
    // Below the intro however many lines it wraps to (English runs longer).
    const py = Math.max(PORTRAIT ? 100 : 92, intro.y + intro.height + 10);
    title(this, GW / 2, py, L(`전승 포인트 ${legacy.points}`, `Legacy points ${legacy.points}`), 17, INK.gold).setOrigin(0.5, 0);
    const rowH = PORTRAIT ? 62 : 54;
    const top = py + 34;
    panel(this, x, top, w, 20 + PERK_IDS.length * rowH, L('영구 보너스', 'Permanent bonuses'));
    PERK_IDS.forEach((id, i) => {
      const info = PERKS[id];
      const lv = perkLevel(legacy, id);
      const extra = agencyLevel(state.agent) >= MAX_AGENCY_LEVEL ? 1 : 0;
      const max = perkMax(id, extra);
      const ry = top + 18 + i * rowH;
      const bw = PORTRAIT ? 104 : 120;
      title(this, x + 16, ry, `${info.name}  ${lv}/${max}`, 14, lv > 0 ? INK.gold : INK.text);
      fit(text(this, x + 16, ry + 22, info.text, 12, INK.quiet), w - bw - 40);
      const maxed = lv >= max;
      const cost = perkCost(legacy, id);
      button(this, x + w - bw - 14, ry + 2, bw, 36, maxed ? L('최대', 'Maxed') : L(`올리기 (${cost})`, `Raise (${cost})`), () => {
        if (!buyPerk(legacy, id, extra)) return;
        persist();
        sfx.gear();
        this.scene.restart({ legacy: true, messages: [L(`${info.name} ${lv + 1}단계!`, `${info.name} level ${lv + 1}!`), ...this.messages] });
      }, { enabled: !maxed && legacy.points >= cost, primary: !maxed && legacy.points >= cost, size: 12 });
    });
    let y = top + 20 + PERK_IDS.length * rowH + 22;
    const legends = state.hallOfFame.filter((e) => e.retired);
    const rec = abyssRecord(state);
    const arena = arenaRecord(state);
    const lines = [
      arena ? L(`아레나 최고 기록: ${arena.wave}웨이브 · ${arena.name}`, `Arena record: ${arena.wave} waves · ${arena.name}`) : L('아레나 최고 기록: 아직 없음', 'Arena record: none yet'),
      rec ? L(`심연 최고 기록: 심연 ${rec.depth}층 · ${rec.name}`, `Abyss record: Abyss ${rec.depth}F · ${rec.name}`) : L('심연 최고 기록: 아직 없음 (21층부터 심연)', 'Abyss record: none yet (the abyss starts at 21F)'),
      legends.length ? L(`은퇴한 헌터 ${legends.length}명`, `${legends.length} retired`) : L('은퇴한 헌터가 아직 없다.', 'No one has retired yet.'),
      ...legends.slice(-4).reverse().map((e) => `${e.legend ? '★ ' : '· '}${e.name} · ${e.grade}${L('급', '-Rank')} · Lv.${e.level}${e.abyssBest ? L(` · 심연 ${e.abyssBest}층`, ` · Abyss ${e.abyssBest}F`) : ''}`),
    ];
    lines.forEach((line, i) => {
      text(this, x + 6, y, line, 12, i < 2 ? INK.gate : line.startsWith('★') ? INK.gold : INK.quiet);
      y += 20;
    });
    if (this.messages[0]?.includes(L('단계!', 'level '))) text(this, GW / 2, Math.min(GH - 92, y + 4), this.messages[0], 12, INK.gold).setOrigin(0.5, 0);
    this.backButton(x, w, () => this.scene.restart({ messages: this.messages.filter((m) => !m.includes(L('단계!', 'level '))) }));
  }

  /** One of Officer Yoon's tips, if one fits this screen. */
  private maybeTip() {
    const tip = (id: keyof typeof TIPS, pages: GuidePage[], keepPulse = false) => {
      if (!tipWanted(id)) return false;
      markTip(id);
      showGuide(this, pages, { keepPulse });
      return true;
    };
    if (this.hiring || this.settings || this.enhancing || this.pickingStart) return;
    if (this.showingGates) return void tip('gates', TIPS.gates());
    if (this.gacha) return void tip('gacha', TIPS.gacha());
    if (this.showingQuests) return void tip('quests', TIPS.quests());
    if (this.codex) return void tip('codex', TIPS.codex());
    if (this.showingChallenges) return;
    const h = activeHunter(state);
    const day = state.day ?? 0;
    if (PORTRAIT && tab !== 'hunter') return;
    if (day === 0 && h && h.bestFloor === 0) {
      if (tip('hq-welcome', TIPS['hq-welcome'](), true)) return;
      if (tip('hq-tower', TIPS['hq-tower'](), true)) return;
      return;
    }
    if (day >= 1 && day <= 2 && tip('hq-return', TIPS['hq-return']())) return;
    if (state.rift && tip('rift', TIPS.rift(), true)) return;
    if ((state.agent.stones ?? 0) > 0 && unlocked(state.agent, 'enhance')) tip('stones', TIPS.stones(), true);
  }

  /** Sound and how to move on a touch screen. */
  private drawSettings() {
    const w = Math.min(GW - 28, 520);
    const x = (GW - w) / 2;
    title(this, GW / 2, 18, L('설정', 'Settings'), 23, INK.text).setOrigin(0.5, 0);
    const reopen = () => this.scene.restart({ settings: true, messages: this.messages });
    const oy = PORTRAIT ? 80 : 84;
    panel(this, x, oy, w, 168, L('소리 · 언어 · 그림 · 안내', 'Sound · Language · Art · Tips'));
    const half = (w - 36 - 10) / 2;
    const lw = 120;
    const sw = (w - 36 - lw - 10) / 2;
    text(this, x + 18, oy + 28, L('효과음', 'Sound'), 13, INK.text);
    const on = soundOn();
    button(this, x + 18 + lw, oy + 20, sw, 30, L('켬', 'On'), () => { if (!soundOn()) toggleSound(); reopen(); }, { primary: on });
    button(this, x + 28 + lw + sw, oy + 20, sw, 30, L('끔', 'Off'), () => { if (soundOn()) toggleSound(); reopen(); }, { primary: !on });
    text(this, x + 18, oy + 64, L('언어', 'Language'), 13, INK.text);
    const pickLang = (l: Lang) => {
      if (l === lang()) return;
      persist();
      localStorage.setItem(LANG_KEY, l);
      skipTitleOnce();
      location.reload();
    };
    button(this, x + 18 + lw, oy + 56, sw, 30, '한국어', () => pickLang('ko'), { primary: lang() === 'ko' });
    button(this, x + 28 + lw + sw, oy + 56, sw, 30, 'English', () => pickLang('en'), { primary: lang() === 'en' });
    text(this, x + 18, oy + 100, L('그림', 'Art'), 13, INK.text);
    const pickArt = (a: Art) => {
      if (a === ART) return;
      persist();
      localStorage.setItem(ART_KEY, a);
      skipTitleOnce();
      location.reload();
    };
    button(this, x + 18 + lw, oy + 92, sw, 30, L('던전 타일', 'Dungeon tiles'), () => pickArt('crawl'), { primary: ART === 'crawl' });
    button(this, x + 28 + lw + sw, oy + 92, sw, 30, L('도트', 'Classic pixel'), () => pickArt('pixel'), { primary: ART === 'pixel' });
    text(this, x + 18, oy + 136, L('윤 주임 안내', 'Yoon\'s tips'), 13, INK.text);
    const tipNote = this.messages[0] === L('안내를 처음부터 다시 보여 준다.', 'Tips will show again from the start.');
    button(this, x + 18 + lw, oy + 128, sw * 2 + 10, 30, tipNote ? L('다시 보기 설정됨 ✓', 'Tips reset ✓') : guideIsOff() ? L('꺼짐 · 다시 켜고 처음부터 보기', 'Off · turn on and replay') : L('처음부터 다시 보기', 'Replay from the start'), () => {
      resetGuide();
      this.scene.restart({ settings: true, messages: [L('안내를 처음부터 다시 보여 준다.', 'Tips will show again from the start.'), ...this.messages] });
    }, { size: 12 });

    const my = oy + 184;
    panel(this, x, my, w, 144, L('이동 방식 (터치 화면)', 'Movement (touch screen)'));
    const mode = moveControl();
    button(this, x + 18, my + 26, half, 34, L('조이스틱', 'Joystick'), () => { setMoveControl('joystick'); reopen(); }, { primary: mode === 'joystick' });
    button(this, x + 28 + half, my + 26, half, 34, L('십자 버튼', 'D-pad'), () => { setMoveControl('dpad'); reopen(); }, { primary: mode === 'dpad' });
    const note = mode === 'joystick'
      ? L('화면을 누른 곳에 조이스틱이 생기고, 끄는 방향으로 걷는다.', 'A joystick appears where you touch; drag to walk.')
      : L('왼쪽 아래 고정된 십자 버튼을 눌러 걷는다. 누르고 있으면 계속 걷는다.', 'Press the fixed D-pad at the bottom left. Hold to keep walking.');
    text(this, x + 18, my + 74, note, 12, INK.quiet).setWordWrapWidth(w - 36, true);
    text(this, x + 18, my + 116, L('키보드는 어느 쪽이든 방향키·WASD로 움직인다.', 'On a keyboard, arrows or WASD always work.'), 12, INK.faint);

    // Hand-made saves, loaded from the title screen.
    const sy = my + 160;
    const rowH = PORTRAIT ? 52 : 44;
    panel(this, x, sy, w, 34 + SAVE_SLOTS * (rowH + 6), L('저장하기 (불러오기는 시작 화면에서)', 'Save (load from the title screen)'));
    for (let i = 0; i < SAVE_SLOTS; i++) {
      const info = slotInfo(i);
      const armed = this.armSave === i;
      const label = armed ? L(`${i + 1}번 슬롯에 덮어쓸까요? 한 번 더 누르기`, `Overwrite slot ${i + 1}? Tap again`) : slotLabel(i, info);
      button(this, x + 14, sy + 24 + i * (rowH + 6), w - 28, rowH, label, () => {
        if (info && !armed) {
          this.armSave = i;
          return this.scene.restart({ settings: true, messages: this.messages });
        }
        persist();
        saveSlot(i);
        this.armSave = undefined;
        sfx.gear();
        this.scene.restart({ settings: true, messages: [L(`${i + 1}번 슬롯에 저장했다.`, `Saved to slot ${i + 1}.`), ...this.messages] });
      }, { size: 12, primary: armed });
    }
    const by = sy + 34 + SAVE_SLOTS * (rowH + 6) + 12;
    if (this.messages[0]?.includes(L('슬롯에 저장', 'Saved to slot'))) text(this, GW / 2, by - 4, this.messages[0], 12, INK.gate).setOrigin(0.5, 0);
    const bw = (w - 10) / 2;
    const bty = Math.min(GH - 54, by + 18);
    button(this, x, bty, bw, 44, L('시작 화면으로', 'Title screen'), () => {
      this.armSave = undefined;
      persist();
      this.scene.start('Title', {});
    });
    button(this, x + bw + 10, bty, bw, 44, L('돌아가기', 'Back'), () => {
      this.armSave = undefined;
      this.scene.restart({ messages: this.messages.filter((m) => !m.includes(L('슬롯에 저장', 'Saved to slot'))) });
    });
  }

  /** Three hunter slots, like save slots. Empty ones hire a new hunter. */
  private drawSlots(x: number, y: number, total = 440) {
    const w = (total - 2 * 10) / SLOT_COUNT;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const h = state.slots[i];
      const bx = x + i * (w + 10);
      if (h) {
        button(this, bx, y, w, 44, isAway(h) ? L(`${h.name}\n파견 중`, `${h.name}\nDispatched`) : L(`${h.name}\n${gradeIn(state, h)}급 · Lv.${h.level}`, `${h.name}\n${gradeIn(state, h)}-Rank · Lv.${h.level}`), () => {
          state.activeSlot = i;
          this.refresh();
        }, { primary: i === state.activeSlot });
      } else if (!slotOpen(state, i)) {
        button(this, bx, y, w, 44, L(`에이전시 Lv.${i >= 2 ? 5 : 2}\n에 열림`, `Opens at\nagency Lv.${i >= 2 ? 5 : 2}`), () => this.refresh([L(`헌터 ${i + 1}번 슬롯은 에이전시 Lv.${i >= 2 ? 5 : 2}에 열린다.`, `Hunter slot ${i + 1} opens at agency Lv.${i >= 2 ? 5 : 2}.`)]), { enabled: false, size: 12 });
      } else {
        button(this, bx, y, w, 44, L('+ 새 헌터 고용', '+ Hire hunter'), () => this.scene.restart({ messages: this.messages, hire: { slot: i } }));
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
      place >= 0 ? L(`협회 랭킹 ${place + 1}위`, `Association rank #${place + 1}`)
      : next ? L(`다음 ${next[0]}급까지 ${next[1] - power}`, `${next[1] - power} to ${next[0]}-Rank`)
      : L(`S급(랭킹 10위)까지 ${Math.max(1, (tenth?.score ?? power) - power + 1)}`, `${Math.max(1, (tenth?.score ?? power) - power + 1)} to S-Rank (top 10)`);

    const g = this.add.graphics();
    g.fillStyle(PALETTE.shadow, 1).fillRect(x + 4, y + 4, w, ht);
    g.fillStyle(PALETTE.paper, 1).fillRect(x, y, w, ht);
    g.lineStyle(2, PALETTE.paperLine, 1).strokeRect(x + 6, y + 6, w - 12, ht - 12);
    g.fillStyle(PALETTE.ink, 1).fillRect(x, y, w, 26);
    text(this, x + 12, y + 7, L('헌터 자격증', 'Hunter License'), 12, '#e6dac0', true);
    text(this, x + w - 12, y + 7, `No.${String(state.hunterNumber).padStart(4, '0')}`, 12, '#b9a98a').setOrigin(1, 0);

    // Portrait slot
    const px = x + 18;
    const py = y + 40;
    g.fillStyle(0xcfc1a3, 1).fillRect(px, py, 72, 88);
    g.lineStyle(2, PALETTE.ink, 1).strokeRect(px, py, 72, 88);
    // The hunter's figure, fixed by class.
    g.fillStyle(0x000000, 0.25).fillEllipse(px + 36, py + 66, 40, 8);
    placeLook(this, g, lookOf(h), px + 14, py + 10, 4);
    g.fillStyle(PALETTE.ink, 1).fillRect(px, py + 72, 72, 16);
    text(this, px + 36, py + 74, CLASSES[h.cls].name, 12, '#e6dac0').setOrigin(0.5, 0);

    title(this, x + 106, y + 40, h.name, 23, INK.ink);
    text(this, x + 106, y + 72, L(`Lv.${h.level}   경험치 ${h.exp}/${expToNext(h.level)}`, `Lv.${h.level}   EXP ${h.exp}/${expToNext(h.level)}`), 12, INK.inkQuiet);
    fit(text(this, x + 106, y + 92, `${CLASSES[h.cls].passive}: ${CLASSES[h.cls].passiveText}`, 12, INK.inkQuiet), w - 260);
    text(this, x + 106, y + 112, L(`계약 ${h.contractGrade}급 · 상납 ${Math.round(cutRate(h) * 100)}%${cutDiscount(h) ? ` (투자 -${cutDiscount(h)}%p)` : ''}`, `Contract ${h.contractGrade} · Cut ${Math.round(cutRate(h) * 100)}%${cutDiscount(h) ? ` (invest -${cutDiscount(h)}pt)` : ''}`), 12, INK.inkQuiet);

    // Grade stamp
    const stamp = this.add.container(x + w - 70, y + 82).setAngle(-9);
    const sg = this.add.graphics();
    sg.lineStyle(3, 0xb8362b, 0.9).strokeRect(-40, -38, 80, 76);
    sg.lineStyle(1, 0xb8362b, 0.9).strokeRect(-35, -33, 70, 66);
    stamp.add(sg);
    stamp.add(title(this, 0, -6, grade, grade.length > 1 ? 30 : 45, INK.stamp).setOrigin(0.5));
    stamp.add(text(this, 0, 22, L('등급', 'Rank'), 12, INK.stamp, true).setOrigin(0.5));

    dots(this, x + 18, y + 136, w - 36, PALETTE.paperLine);
    text(this, x + 18, y + 146, L(`체력 ${h.hp}/${h.maxHp}`, `HP ${h.hp}/${h.maxHp}`), 12, INK.ink);
    bar(this, x + 120, y + 148, w - 336, 8, h.hp / h.maxHp, PALETTE.hp);
    // Regeneration per turn in the tower, next to each bar.
    const per = (v: number) => L(`+${Number((v ?? 0).toFixed(2))}/턴`, `+${Number((v ?? 0).toFixed(2))}/t`);
    text(this, x + w - 210, y + 146, per(h.hpRegen), 12, INK.inkQuiet);
    text(this, x + w - 210, y + 166, per(h.mpRegen), 12, INK.inkQuiet);
    text(this, x + 18, y + 166, L(`마나 ${h.mp}/${h.maxMp}`, `MP ${h.mp}/${h.maxMp}`), 12, INK.ink);
    bar(this, x + 120, y + 168, w - 336, 8, h.mp / h.maxMp, PALETTE.mp);
    const sx = x + w - 144;
    text(this, sx, y + 146, L(`공격 ${h.atk}`, `ATK ${h.atk}`), 12, INK.ink);
    text(this, sx, y + 166, L(`방어 ${h.def}`, `DEF ${h.def}`), 12, INK.ink);
    text(this, sx + 64, y + 146, L(`물약 ${h.bag.hp + h.bag.mp + h.bag.guard}`, `Potions ${h.bag.hp + h.bag.mp + h.bag.guard}`), 12, INK.ink);
    text(this, sx + 64, y + 166, `${h.gold}G`, 12, INK.ink);

    dots(this, x + 18, y + 188, w - 36, PALETTE.paperLine);
    title(this, x + 18, y + 198, L(`전투력 ${power}`, `Power ${power}`), 15, INK.ink);
    text(this, x + w - 18, y + 201, goal, 12, INK.inkQuiet).setOrigin(1, 0);
    const skills = h.skills.map((sk) => `${SKILLS[sk.id].name} ${sk.lv}`).join(' · ');
    const retirable = !untouched(h) && canRetire(state, h);
    // Dispatch: a day away for pay, while another hunter stays home.
    const showDispatch = unlocked(state.agent, 'dispatch') && (isAway(h) || state.slots.filter(Boolean).length > 1);
    if (showDispatch) {
      const dx = x + w - (retirable ? 238 : 162);
      const pay = dispatchPay(h);
      button(this, dx, y + 222, 70, 26, isAway(h) ? L('파견 중', 'Away') : L('파견', 'Dispatch'), () => {
        const slot = state.activeSlot;
        if (!dispatch(state, slot)) return;
        this.refresh([L(`${h.name}을(를) 파견 보냈다. 다음 귀환 때 약 ${pay.gold}G, 경험치 ${pay.exp}를 벌어 온다.`, `Sent ${h.name} on a dispatch. Back at the next return with about ${pay.gold}G and ${pay.exp} EXP.`)]);
      }, { enabled: canDispatch(state, state.activeSlot), size: 12 });
    }
    const used = (retirable ? 76 : 0) + (showDispatch ? 76 : 0);
    if (untouched(h)) {
      button(this, x + 18, y + 222, 104, 26, L('직업 바꾸기', 'Change class'), () => this.scene.restart({ messages: this.messages, hire: { slot: state.activeSlot, change: true } }), { size: 12 });
      fit(text(this, x + 130, y + 228, L(`스킬 ${skills}`, `Skills ${skills}`), 12, INK.inkQuiet), w - 236 - used);
    } else {
      const extras = [h.rescues ? L(`위기 지원 ${h.rescues}`, `Rescues ${h.rescues}`) : '', h.talent && TALENTS[h.talent as TalentId] ? TALENTS[h.talent as TalentId].name() : ''].filter(Boolean).join(' · ');
      fit(text(this, x + 18, y + 228, L(`스킬 ${skills} · 처치 ${h.kills} · 최고 ${h.bestFloor}층${h.abyssBest ? `·심연 ${h.abyssBest}층` : ''}`, `Skills ${skills} · Kills ${h.kills} · Best ${h.bestFloor}F${h.abyssBest ? `·Abyss ${h.abyssBest}F` : ''}`) + (extras ? ` · ${extras}` : ''), 12, INK.inkQuiet), w - 120 - used);
      if (retirable) {
        const grade = gradeIn(state, h);
        const pts = RETIRE_POINTS[grade] ?? 0;
        button(this, x + w - 162, y + 222, 70, 26, this.retireArmed ? L('정말?', 'Sure?') : L('은퇴', 'Retire'), () => {
          if (!this.retireArmed) {
            persist();
            this.scene.restart({
              messages: [grade === 'SSS'
                ? L(`전설로 은퇴: 전승 +${pts}, 순위에서 빠짐. 한 번 더 누르면 은퇴`, `Retire a legend: legacy +${pts}, leaves the ranking. Tap again.`)
                : L(`은퇴: 전승 +${pts}, 순위에서 빠짐 (SSS면 +10). 한 번 더 누르면 은퇴`, `Retire: legacy +${pts}, leaves the ranking (SSS: +10). Tap again.`)],
              armRetire: true,
            });
            return;
          }
          const slot = state.activeSlot;
          const r = retire(state, slot);
          if (!r) return;
          persist();
          sfx.gear();
          const msg = r.legend
            ? L(`${r.hunter.name}이(가) 전설로 은퇴했다. 그래, 너였구나. 전승 포인트 +${r.points}.`, `${r.hunter.name} retired a legend. So it was you. Legacy points +${r.points}.`)
            : L(`${r.hunter.name}이(가) ${r.grade}급으로 은퇴했다. 전승 포인트 +${r.points}.`, `${r.hunter.name} retired at ${r.grade}-Rank. Legacy points +${r.points}.`);
          if (!state.slots.some(Boolean)) this.scene.restart({ messages: [msg], hire: { slot } });
          else this.scene.restart({ messages: [msg] });
        }, { primary: this.retireArmed });
      }
    }
    const others = state.slots.filter(Boolean).length > 1;
    button(this, x + w - 86, y + 222, 70, 26, this.releaseArmed ? L('정말?', 'Sure?') : L('방출', 'Release'), () => {
      if (!this.releaseArmed) {
        this.refresh([L('방출하면 경쟁사로 가서 언젠가 적으로 만날 수 있다. 한 번 더 누르면 방출.', 'A released hunter joins the rival and may face you one day. Tap again to release.')], true);
        return;
      }
      const gone = release(state, state.activeSlot);
      if (gone) this.refresh([L(`${gone.name}을(를) 방출했다. ${state.rival.name}이(가) 데려갔다.`, `Released ${gone.name}. ${state.rival.name} took them in.`)]);
    }, { enabled: others });
  }

  private drawTraining(x: number, y: number, w = 440) {
    const { agent } = state;
    const hunter = activeHunter(state);
    if (!hunter) return;
    const bw = (w - 40) / 2;
    panel(this, x, y, w, 158, L('훈련 · 투자', 'Training · Investment'));
    text(this, x + w - 14, y + 14, L('훈련비는 운영 자금에서', 'Training uses agency funds'), 12, INK.faint).setOrigin(1, 0);
    const kinds: TrainingKind[] = ['atk', 'def', 'hp', 'mp'];
    kinds.forEach((kind, i) => {
      const cost = trainingCost(hunter, kind, state.agent.legacy, agencyLevel(agent));
      const t = TRAINING[kind];
      const bx = x + 16 + (i % 2) * (bw + 8);
      const by = y + 32 + Math.floor(i / 2) * 44;
      button(this, bx, by, bw, 38, `${t.label}  ${cost}G\n${t.describe}`, () => {
        if (train(state, kind)) this.refresh([L(`${t.label} 완료. ${t.describe}`, `${t.label} done. ${t.describe}`)]);
      }, { enabled: agent.gold >= cost, size: 12 });
    });
    // The agency's level, and the hunter putting their own gold into it.
    const ry = y + 122;
    const lv = agencyLevel(agent);
    const prog = levelProgress(agent);
    const iw = 66;
    const barW = w - 32 - 2 * (iw + 6) - 6;
    const label = prog ? L(`에이전시 Lv.${lv}  ${prog.have}/${prog.need}`, `Agency Lv.${lv}  ${prog.have}/${prog.need}`) : L(`에이전시 Lv.${lv} (최고)`, `Agency Lv.${lv} (max)`);
    const g = this.add.graphics();
    g.fillStyle(0x2a221c, 1).fillRect(x + 16, ry + 16, barW, 6);
    g.fillStyle(0xd9a441, 1).fillRect(x + 16, ry + 16, prog ? Math.round((barW * prog.have) / prog.need) : barW, 6);
    fit(text(this, x + 16, ry - 2, `${label}  ▸`, 12, INK.gold), barW);
    this.add.zone(x + 16, ry - 4, barW, 28).setOrigin(0).setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.scene.restart({ messages: this.messages, levels: true }));
    const doInvest = (amount: number) => {
      const r = invest(state, amount);
      if (!r) return;
      sfx.gear();
      const msgs = [L(`${hunter.name}이(가) 에이전시에 ${r.amount}G를 투자했다. (경험치 +${Math.round(r.amount * INVEST_EXP)}, 상납 ${Math.round(cutRate(hunter) * 100)}%)`, `${hunter.name} invested ${r.amount}G in the agency. (EXP +${Math.round(r.amount * INVEST_EXP)}, cut ${Math.round(cutRate(hunter) * 100)}%)`)];
      if (r.levelUp) msgs.unshift(levelUpMessage(r.levelUp));
      this.refresh(msgs);
    };
    const step = 100;
    button(this, x + w - 16 - 2 * iw - 6, ry, iw, 26, L(`투자 ${step}`, `Invest ${step}`), () => doInvest(step), { enabled: hunter.gold >= step, size: 12 });
    button(this, x + w - 16 - iw, ry, iw, 26, L('전부', 'All'), () => doInvest(hunter.gold), { enabled: hunter.gold > 0, size: 12, primary: hunter.gold >= step });
  }

  /** A feature button, or its locked face that says which agency level opens it. */
  private featureButton(f: Feature, x: number, y: number, w: number, h: number, label: string, onClick: () => void, opts: { enabled?: boolean; primary?: boolean; size?: number } = {}) {
    if (unlocked(state.agent, f)) return button(this, x, y, w, h, label, onClick, opts);
    const short = label.split(/[\s·]/)[0].replace('▶', '');
    const face = h >= 40 ? `${short}\nLv.${FEATURE_LEVEL[f]}` : w >= 90 ? `${short} Lv.${FEATURE_LEVEL[f]}` : `Lv.${FEATURE_LEVEL[f]}`;
    return button(this, x, y, w, h, face, () => {}, { ...opts, enabled: false, primary: false, size: h >= 40 ? 14 : opts.size });
  }

  private buy(kind: ConsumableKind) {
    const r = buyItem(state, rng, kind);
    if (!r.ok) return;
    const name = CONSUMABLES[kind].name;
    const msg = r.agentPaid > 0 ? L(`${name}: 에이전트가 ${r.agentPaid}G를 지원했다. (헌터 부담 ${r.hunterPaid}G)`, `${name}: the agency covered ${r.agentPaid}G. (Hunter paid ${r.hunterPaid}G)`) : L(`${name} 구매. -${r.hunterPaid}G`, `Bought ${name}. -${r.hunterPaid}G`);
    this.refresh([msg]);
  }

  private canBuy(kind: ConsumableKind) {
    const h = activeHunter(state);
    const price = CONSUMABLES[kind].price;
    const shopOk = !CONSUMABLES[kind].bigShop || unlocked(state.agent, 'shop');
    return !!h && price !== undefined && shopOk && h.gold >= price && h.bag[kind] < bagMax(h);
  }

  /** Landscape: gear and potions on one line each, with the two potions for sale. */
  private drawShop(x: number, y: number, w = 440) {
    const h = activeHunter(state);
    if (!h) return;
    panel(this, x, y, w, 76, L('가방 · 상점', 'Bag · Shop'));
    button(this, x + 14, y + 14, 80, 26, showGear ? L('순위 보기', 'Rankings') : L('장비 보기', 'Gear'), () => {
      showGear = !showGear;
      this.scene.restart({ messages: this.messages });
    });
    this.featureButton('gacha', x + 100, y + 14, 50, 26, L('뽑기', 'Draw'), () => this.openGacha(), { primary: true, size: 12 });
    this.featureButton('enhance', x + 154, y + 14, 50, 26, L('강화', 'Enhance'), () => this.openEnhance(), { primary: true, size: 12 });
    this.featureButton('stash', x + 208, y + 14, 50, 26, L('창고', 'Storage'), () => this.scene.restart({ messages: this.messages, stash: true }), { primary: true, size: 12 });
    this.prepButton(x + 264, y + 14, w - 278, 26);
    // One buy button per item, showing what the bag holds.
    const bw = (w - 28 - 3 * 6) / 4;
    CONSUMABLE_KINDS.forEach((kind, i) => {
      const c = CONSUMABLES[kind];
      const bx = x + 14 + i * (bw + 6);
      const short = { hp: L('체력', 'HP'), mp: L('마나', 'MP'), guard: L('무적', 'Guard'), escape: L('귀환', 'Ret.') }[kind];
      if (c.bigShop && !unlocked(state.agent, 'shop')) {
        button(this, bx, y + 44, bw, 24, L(`${short} ${h.bag[kind]} · Lv.${FEATURE_LEVEL.shop}`, `${short} ${h.bag[kind]} · Lv.${FEATURE_LEVEL.shop}`), () => {}, { enabled: false, size: 12 });
        return;
      }
      button(this, bx, y + 44, bw, 24, `${short} ${h.bag[kind]}/${bagMax(h)}  ${c.price}G`, () => this.buy(kind), { enabled: this.canBuy(kind), size: 12 });
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
    title(this, GW / 2, 18, L('장비 강화', 'Enhance Gear'), 23, INK.text).setOrigin(0.5, 0);
    text(this, GW / 2, 50, L(`마력석 ${stones}개 · 운영 자금 ${state.agent.gold}G`, `Mana stones ${stones} · Funds ${state.agent.gold}G`), 12, INK.gold).setOrigin(0.5, 0);
    text(this, GW / 2, 70, L('+5부터 실패하면 한 단계 떨어질 수 있고, +7부터는 부서질 수도 있다.', 'From +5 a failure can drop a level; from +7 the gear can break.'), 12, INK.faint)
      .setOrigin(0.5, 0).setWordWrapWidth(w, true).setAlign('center');

    let y = PORTRAIT ? 112 : 96;
    if (result) {
      const g = result.gear;
      const [line, color] = result.success
        ? [L(`성공! ${g.name} +${result.from} → +${result.to}`, `Success! ${g.name} +${result.from} → +${result.to}`), INK.gold]
        : result.broken
          ? [L(`실패... +${result.from} ${g.name}이(가) 부서졌다!`, `Failed... +${result.from} ${g.name} broke!`), INK.red]
          : result.to < result.from
            ? [L(`실패... ${g.name} +${result.from} → +${result.to}`, `Failed... ${g.name} +${result.from} → +${result.to}`), INK.red]
            : [L(`실패... ${g.name}은(는) +${result.from} 그대로.`, `Failed... ${g.name} stays at +${result.from}.`), INK.quiet];
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
        text(this, x + 14, ry + 30, L('비어 있음', 'Empty'), 12, INK.faint);
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
        text(this, tx, ry + 42, L('최대 강화', 'Maxed'), 12, INK.gold);
        return;
      }
      const cost = enhanceCost(g);
      const risk = enhanceRisk(g);
      const ok = stones >= cost.stones && state.agent.gold >= cost.gold;
      const pct = (v: number) => Math.round(v * 100);
      const f = failOdds(g);
      const failText = risk === 'none' ? '' : L(`실패하면 ${f.break > 0 ? `파괴 ${pct(f.break)} · ` : ''}하락 ${pct(f.drop)} · 유지 ${pct(f.keep)}%`, `On fail: ${f.break > 0 ? `break ${pct(f.break)} · ` : ''}drop ${pct(f.drop)} · keep ${pct(f.keep)}%`);
      const chance = enhanceChance(g);
      const costText = L(`마력석 ${cost.stones} · ${cost.gold}G · 성공 ${pct(chance)}% · 실패 ${pct(1 - chance)}%`, `Stones ${cost.stones} · ${cost.gold}G · Success ${pct(chance)}% · Fail ${pct(1 - chance)}%`);
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
          ? L(`강화 성공: ${r.gear.name} +${r.to}`, `Enhanced: ${r.gear.name} +${r.to}`)
          : r.broken ? L(`강화 실패: +${r.from} ${r.gear.name}이(가) 부서졌다.`, `Enhance failed: +${r.from} ${r.gear.name} broke.`) : L(`강화 실패: ${r.gear.name} +${r.to}`, `Enhance failed: ${r.gear.name} +${r.to}`);
        this.messages = [msg, ...this.messages];
        this.scene.restart({ messages: this.messages, enhance: { result: r } });
      }, { primary: risk !== 'break', size: 15, enabled: ok });
    });

    const by = y + GEAR_SLOTS.length * rowH + 6;
    text(this, GW / 2, by, L('마력석은 몬스터, 중간보스, 층 보스, 게이트 클리어에서 얻는다.', 'Mana stones come from monsters, mid-bosses, floor bosses and gate clears.'), 12, INK.faint)
      .setOrigin(0.5, 0).setWordWrapWidth(w, true).setAlign('center');
    this.backButton(x, w, () => this.scene.restart({ messages: this.messages }));
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
    title(this, GW / 2, 18, L('장비 뽑기', 'Gear Draw'), 23, INK.text).setOrigin(0.5, 0);
    text(this, GW / 2, 52, L('균열에서 흘러나온 봉인 상자. 무엇이 들었는지는 열어 봐야 안다.', 'A sealed box from the rift. Open it to find out what is inside.'), 12, INK.quiet)
      .setOrigin(0.5, 0).setWordWrapWidth(w, true).setAlign('center');

    const oy = PORTRAIT ? 96 : 84;
    const oddsH = 36 + GACHA_ODDS.length * 22;
    panel(this, x, oy, w, oddsH, L('확률', 'Odds'));
    GACHA_ODDS.forEach((o, i) => {
      const ly = oy + 24 + i * 22;
      const sample = makeGear(new Rng(1), o.tier, 'weapon');
      text(this, x + 18, ly, L(`${o.label} · ${o.tier}단계`, `${o.label} · Tier ${o.tier}`), 12, tierColor(o.tier), true);
      text(this, x + 150, ly, L(`예) ${sample.name}`, `e.g. ${sample.name}`), 12, INK.quiet);
      text(this, x + w - 18, ly, `${Math.round(o.chance * 100)}%`, 12, tierColor(o.tier)).setOrigin(1, 0);
    });

    const ry = oy + oddsH + 12;
    text(this, GW / 2, ry, L(`지금 낀 것보다 좋으면 바로 착용, 아니면 ${GACHA_REFUND}G에 되판다.`, `Better than yours: equipped. Otherwise sold for ${GACHA_REFUND}G.`), 12, INK.faint)
      .setOrigin(0.5, 0).setWordWrapWidth(w, true).setAlign('center');

    const cy = ry + 30;
    const cardH = 132;
    if (result) {
      const g = result.gear;
      const color = tierColor(g.tier);
      panel(this, x, cy, w, cardH, L('결과', 'Result'));
      const big = g.tier >= 8;
      if (big) {
        const glow = this.add.graphics();
        glow.lineStyle(3, Phaser.Display.Color.HexStringToColor(color).color, 1).strokeRect(x - 2, cy - 2, w + 4, cardH + 4);
        this.tweens.add({ targets: glow, alpha: 0.2, duration: 500, yoyo: true, repeat: -1 });
      }
      const icon = this.add.graphics();
      drawGearIcon(g)(icon, x + 18, cy + 26);
      text(this, x + 72, cy + 22, L(`${gachaLabel(g.tier)} · ${GEAR_SLOT_NAMES[g.slot]} · ${g.tier}단계`, `${gachaLabel(g.tier)} · ${GEAR_SLOT_NAMES[g.slot]} · Tier ${g.tier}`), 12, INK.faint);
      title(this, x + 72, cy + 40, g.name, 15, color);
      text(this, x + 72, cy + 64, describeGear(g), 12, INK.text);
      const outcome = result.equipped
        ? (result.old ? L(`착용! ${result.old.name} 대신 · ${gearDiff(g, result.old)}`, `Equipped! Replaces ${result.old.name} · ${gearDiff(g, result.old)}`) : L(`착용! ${gearDiff(g)}`, `Equipped! ${gearDiff(g)}`))
        : L(`${result.old?.name ?? '지금 장비'}이(가) 더 좋아서 ${result.refund}G에 되팔았다.`, `${result.old?.name ?? 'Current gear'} is better, so it was sold for ${result.refund}G.`);
      text(this, x + 18, cy + 92, outcome, 12, result.equipped ? INK.gold : INK.quiet).setWordWrapWidth(w - 36, true);
      icon.setAlpha(0);
      this.tweens.add({ targets: icon, alpha: 1, duration: 250 });
      if (big) this.cameras.main.flash(300, 255, 200, 150);
    } else {
      panel(this, x, cy, w, cardH, L('결과', 'Result'));
      text(this, GW / 2, cy + cardH / 2 - 8, L('아직 뽑지 않았다.', 'Nothing drawn yet.'), 12, INK.faint).setOrigin(0.5, 0);
    }

    const by = Math.max(cy + cardH + 20, GH - 190);
    if (h) {
      text(this, GW / 2, by, L(`${h.name}의 소지금 ${h.gold}G`, `${h.name}'s purse ${h.gold}G`), 12, h.gold >= GACHA_PRICE ? INK.gold : INK.red).setOrigin(0.5, 0);
    }
    const can = !!h && h.gold >= GACHA_PRICE;
    button(this, x, by + 26, w, 56, can ? L(`뽑기  ${GACHA_PRICE}G`, `Draw  ${GACHA_PRICE}G`) : L(`뽑기  ${GACHA_PRICE}G (소지금 부족)`, `Draw  ${GACHA_PRICE}G (not enough)`), () => {
      const r = drawGear(state, rng);
      if (!r) return;
      persist();
      if (r.gear.tier >= 8) sfx.levelup();
      else if (r.equipped) sfx.gear();
      else sfx.buy();
      const msg = r.equipped ? L(`장비 뽑기: ${r.gear.name}(${r.gear.tier}단계) 착용!`, `Gear draw: equipped ${r.gear.name} (tier ${r.gear.tier})!`) : L(`장비 뽑기: ${r.gear.name}. ${r.refund}G에 되팔았다.`, `Gear draw: ${r.gear.name}. Sold for ${r.refund}G.`);
      this.messages = [msg, ...this.messages];
      this.scene.restart({ messages: this.messages, gacha: { result: r } });
    }, { primary: true, size: 18, enabled: can });
    this.backButton(x, w, () => this.scene.restart({ messages: this.messages }), by + 92);
  }

  /** The gear doll in a panel. */
  private drawGearPanel(x: number, y: number, w: number) {
    const h = activeHunter(state);
    if (!h) return;
    panel(this, x, y, w, DOLL_H + 40, L('장비', 'Gear'));
    if (PORTRAIT) {
      this.featureButton('stash', x + w - 236, y + 8, 70, 26, L('창고', 'Storage'), () => this.scene.restart({ messages: this.messages, stash: true }), { primary: true, size: 12 });
      this.featureButton('gacha', x + w - 160, y + 8, 70, 26, L('뽑기', 'Draw'), () => this.openGacha(), { primary: true, size: 12 });
      this.featureButton('enhance', x + w - 84, y + 8, 72, 26, L('강화', 'Enhance'), () => this.openEnhance(), { primary: true, size: 12 });
    }
    else text(this, x + w - 16, y + 12, L('더 좋은 장비를 얻으면 바꿔 낌', 'Better gear is swapped in'), 12, INK.faint).setOrigin(1, 0);
    drawPaperDoll(this, x + 12, y + 32, w - 24, h);
  }

  /** Portrait bag tab: worn gear, then potions with their shop buttons. */
  private drawBag(x: number, y: number, w: number) {
    const h = activeHunter(state);
    if (!h) return;
    this.drawGearPanel(x, y, w);

    const py = y + DOLL_H + 60;
    panel(this, x, py, w, 36 + CONSUMABLE_KINDS.length * 52 + 22, L('물약 · 상점', 'Potions · Shop'));
    text(this, x + 16, py + 32 + CONSUMABLE_KINDS.length * 52, L('귀환하면 가방은 체력 물약 1개로 돌아갑니다.', 'On return the bag resets to 1 HP potion.'), 12, INK.faint);
    text(this, x + w - 16, py + 14, L(`헌터 소지금 ${h.gold}G`, `Hunter purse ${h.gold}G`), 12, INK.gold).setOrigin(1, 0);
    CONSUMABLE_KINDS.forEach((kind, i) => {
      const c = CONSUMABLES[kind];
      const ry = py + 32 + i * 52;
      text(this, x + 16, ry + 4, `${c.name}  ${h.bag[kind]}/${bagMax(h)}`, 12, INK.text, true);
      text(this, x + 16, ry + 24, c.describe, 12, INK.quiet);
      if (c.bigShop && !unlocked(state.agent, 'shop')) {
        text(this, x + w - 16, ry + 6, L(`에이전시 Lv.${FEATURE_LEVEL.shop}부터 판매`, `On sale from agency Lv.${FEATURE_LEVEL.shop}`), 12, INK.faint).setOrigin(1, 0);
        text(this, x + w - 16, ry + 24, L(`지금은 ${c.where}에서만`, `For now: ${c.where} only`), 12, INK.faint).setOrigin(1, 0);
      } else if (c.price !== undefined) {
        button(this, x + w - 126, ry, 110, 44, L(`구매 ${c.price}G`, `Buy ${c.price}G`), () => this.buy(kind), { enabled: this.canBuy(kind) });
      } else {
        text(this, x + w - 16, ry + 14, L(`${c.where}에서만`, `${c.where} only`), 12, INK.faint).setOrigin(1, 0);
      }
    });
  }

  /** Live association ranking: ours, the rival agency's, the fallen, and established rankers. */
  private drawRanking(x: number, y: number, w = 448) {
    panel(this, x, y, w, 326, L('헌터 순위 · 명예의 전당', 'Hunter Ranking · Hall of Fame'));
    const cols = { rank: x + 18, grade: x + 50, name: x + 92, lv: x + 188, score: x + 222, note: x + w - 18 };
    const hy = y + 20;
    text(this, cols.rank, hy, '#', 12, INK.faint);
    text(this, cols.grade, hy, L('등급', 'Rank'), 12, INK.faint);
    text(this, cols.name, hy, L('이름', 'Name'), 12, INK.faint);
    text(this, cols.lv, hy, 'Lv', 12, INK.faint);
    text(this, cols.score, hy, L('전투력', 'Power'), 12, INK.faint);
    text(this, cols.note, hy, L('소속 · 최후', 'Agency · Fate'), 12, INK.faint).setOrigin(1, 0);
    dots(this, x + 16, hy + 18, w - 32);
    const color = { ours: INK.gate, rival: '#d79bff', gone: INK.faint, world: INK.quiet } as const;
    ranking(state).forEach((r, i) => {
      const ry = hy + 26 + i * 25;
      const c = color[r.status];
      const g = rankGradeOf(i)!;
      text(this, cols.rank, ry, `${i + 1}`, 12, i === 0 ? INK.gold : INK.quiet, true);
      text(this, cols.grade, ry, g, 12, i === 0 ? INK.gold : INK.rust, true);
      fit(text(this, cols.name, ry, r.name, 12, c, r.status === 'ours'), cols.lv - cols.name - 6);
      text(this, cols.lv, ry, `${r.level}`, 12, INK.quiet);
      text(this, cols.score, ry, `${r.score}`, 12, INK.quiet);
      const note = r.cls ? `${CLASSES[r.cls].name} · ${r.note}` : r.note;
      fit(text(this, cols.note, ry, note, 12, r.status === 'gone' ? INK.faint : c), cols.note - cols.score - 50).setOrigin(1, 0);
    });
    const gone = state.hallOfFame.length;
    // The challenge button takes what the hall-of-fame count leaves, so the two never overlap.
    const count = gone > 0 ? text(this, x + w - 18, y + 304, L(`기록 ${gone}명`, `${gone} on record`), 12, INK.faint).setOrigin(1, 0) : undefined;
    this.challengeButton(x + 14, y + 300, Math.min(300, w - 32 - (count ? count.width + 12 : 0)));
  }

  /** Challenge the next association ranker. Only a win moves our hunter past them. */
  private challengeButton(x: number, y: number, w: number) {
    const h = activeHunter(state);
    if (!h) return;
    if (!unlocked(state.agent, 'duel')) {
      text(this, x + 4, y + 6, L(`랭커 도전은 에이전시 Lv.${FEATURE_LEVEL.duel}에 열린다.`, `Ranker challenges open at agency Lv.${FEATURE_LEVEL.duel}.`), 12, INK.faint);
      return;
    }
    const next = nextChallenge(state, h);
    if (!next) {
      text(this, x + 4, y + 6, L('협회 랭커를 모두 꺾었다.', 'You beat every Association ranker.'), 12, INK.gold);
      return;
    }
    const ok = canChallenge(state, h);
    const label = ok ? L(`${next.rank}위 ${next.ranker.name}에게 도전 (${next.ranker.score})`, `Challenge #${next.rank} ${next.ranker.name} (${next.ranker.score})`) : L(`오늘은 도전 완료 · 다음 ${next.ranker.name}`, `Challenged today · next ${next.ranker.name}`);
    button(this, x, y, w, 22, label, () => {
      const duel = startDuel(state);
      if (!duel) return;
      persist();
      this.scene.start('Tower', { duel });
    }, { primary: ok, size: 12, enabled: ok });
  }

  private drawRival(x: number, y: number, w = 448) {
    const { rival } = state;
    const agencies = rivalAgencies(state);
    const two = agencies.length > 1;
    const all = agencies.flatMap((a) => a.roster);
    const former = all.filter((h) => h.origin === 'scouted' || h.origin === 'released').length;
    const rivals = all.filter((h) => h.origin === 'rival').length;
    const crew = all.filter((h) => h.origin === 'crew').length;
    const rec = state.gateRecord ?? { ours: 0, rival: 0 };
    // Each of our hunters has their own rival: the active hunter's first.
    const me = activeHunter(state);
    const ours = [me, ...state.slots.filter((s) => s && s !== me)].filter((s): s is Hunter => !!s);
    const pairs = ours.flatMap((o) => {
      const r = rival.roster.find((h) => h.origin === 'rival' && h.rivalOf === o.id);
      return r ? [L(`${o.name}의 라이벌 ${r.name} ${combatPower(r)}`, `${o.name}'s rival ${r.name} ${combatPower(r)}`)] : [];
    });
    const line = pairs.length ? pairs.join(' · ') : L('우리 헌터가 S급이 되면 라이벌을 내세운다.', 'They will field a rival once our hunter hits S-Rank.');
    if (!two) {
      panel(this, x, y, w, 72, L('경쟁 에이전시', 'Rival Agency'));
      title(this, x + 18, y + 18, rival.name, 15, '#d79bff');
      text(this, x + w - 18, y + 20, L(`옛 동료 ${former} · 라이벌 ${rivals} · 게이트 ${rec.rival}`, `Former ${former} · Rivals ${rivals} · Gates ${rec.rival}`), 12, INK.quiet).setOrigin(1, 0);
      fit(text(this, x + 18, y + 44, line, 12, pairs.length ? INK.text : INK.faint), w - 36);
      return;
    }
    // Two agencies: one line each, then our hunters' rivals.
    const r2 = state.rival2!;
    panel(this, x, y, w, 72, L('경쟁 에이전시 2곳', 'Rival Agencies (2)'));
    const row = (yy: number, name: string, note: string) => {
      fit(title(this, x + 18, yy, name, 13, '#d79bff'), w * 0.45);
      fit(text(this, x + w - 18, yy + 1, note, 12, INK.quiet).setOrigin(1, 0), w * 0.5);
    };
    row(y + 12, rival.name, L(`동료 ${former} · 라이벌 ${rivals} · 게이트 ${rec.rival}`, `Former ${former} · Rivals ${rivals} · Gates ${rec.rival}`));
    row(y + 30, r2.name, L(`소속 ${crew} · 게이트 ${rec.rival2 ?? 0}`, `Crew ${crew} · Gates ${rec.rival2 ?? 0}`));
    fit(text(this, x + 18, y + 50, line, 12, pairs.length ? INK.text : INK.faint), w - 36);
  }

  private drawLog(x: number, y: number, w = 448, count = 3, wrap = false) {
    const lines = this.messages.slice(0, count);
    if (!wrap) {
      panel(this, x, y, w, 76, L('업무 일지', 'Office Log'));
      if (lines.length === 0) text(this, x + 18, y + 22, L('특이사항 없음.', 'Nothing to report.'), 12, INK.faint);
      lines.forEach((m, i) => fit(text(this, x + 18, y + 16 + i * 18, `· ${m}`, 12, i === 0 ? INK.text : INK.quiet), w - 36));
      return;
    }
    // Portrait log tab: wrapped lines in a panel that grows to fit them.
    const box = panel(this, x, y, w, 10, L('업무 일지', 'Office Log'));
    let ly = y + 20;
    if (lines.length === 0) {
      text(this, x + 18, ly, L('특이사항 없음.', 'Nothing to report.'), 12, INK.faint);
      ly += 20;
    }
    lines.forEach((m, i) => {
      const t = text(this, x + 18, ly, `· ${m}`, 12, i === 0 ? INK.text : INK.quiet).setWordWrapWidth(w - 36, true);
      ly += t.height + 6;
    });
    box.destroy();
    this.children.sendToBack(panel(this, x, y, w, ly - y + 12, L('업무 일지', 'Office Log')));
  }
}
