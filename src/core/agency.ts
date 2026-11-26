import {
  combatPower, createHunter, gainExp, Grade, GRADE_A_POWER, gradeRank, hallOfFameScore, Hunter, levelUp, powerGrade, rankGradeOf,
  PrepId, TrainingKind,
} from './hunter';
import { autoPick, ClassId, CLASS_IDS, classSkills, COUNTER_CLASS, SkillId, slotCount } from './classes';
import { bagMax, BIG_BAG, CONSUMABLES, ConsumableKind, equipIfBetter, Gear, GACHA_PRICE, GearSlot, MAX_PLUS, setPlus, unequip, GACHA_REFUND, GEAR_SLOTS, makeGear, MAX_TIER, rollGacha, rollGear, startingBag, gearLevel } from './items';
import { Gate, GATE_GRADES, GATE_SLOTS, gateLevel, gateName, raidSuccess, RIFT, rollGate, rollGateGrade, rollRift } from './gates';
import { TOP_FLOOR } from './monsters';
import { Rng } from './rng';
import type { Duel, RunSnapshot, Survival } from './run';
import { AgencyProgress, agencyLevel, cutRate, gainAgencyExp, INVEST_EXP, MAX_AGENCY_LEVEL, openSlots, TOP_TRAINING_DISCOUNT, unlocked } from './agencyLevel';
import { L, lang } from './lang';
import { applyReport, Quest, QuestBoard, QuestContext, refreshBoard, RunReport } from './quests';
import { applyRookie, canRetireGrade, Legacy, perkLevel, RETIRE_POINTS } from './legacy';

export interface Agent extends AgencyProgress {
  name: string;
  gold: number;
  /** False until the player names the agency on the first screen. Older saves never had this. */
  named?: boolean;
  /** 마력석 in the agency's store, for enhancing gear. Kept between runs. */
  stones?: number;
  /** Points and bonuses left by retired hunters. Older saves have none. */
  legacy?: Legacy;
  /** Gear kept at the agency for any hunter to take out. */
  stash?: Gear[];
}

/** A hunter who is gone for good: died unrescued, or was finished off. */
export interface HallOfFameEntry {
  id: number;
  name: string;
  grade: Grade;
  level: number;
  kills: number;
  bestFloor: number;
  totalTribute: number;
  score: number;
  /** Combat power when they fell. Older saves lack it. */
  power?: number;
  fate: string;
  /** Retired by the agency: off the ranking for good. A retired SSS is a legend. */
  retired?: boolean;
  legend?: boolean;
  abyssBest?: number;
  arenaBest?: number;
}

export interface RivalAgency {
  name: string;
  /** Hunters it took from us, plus its own rival hunters. */
  roster: Hunter[];
}

/** Famous hunters of other agencies already on the association ranking. Ours must climb past them. */
export interface WorldRanker {
  id: number;
  name: string;
  agency: string;
  level: number;
  bestFloor: number;
  /** Ranking score, which is combat power. */
  score: number;
  cls?: ClassId;
}

export const SLOT_COUNT = 3;

/**
 * The association's top 10 at the start. All of them are stronger than any A grade hunter
 * (combat power 2000), so S and above have to be earned by real strength.
 */
export function worldRankers(): WorldRanker[] {
  const list: Array<[string, string, number, number, number]> = [
    ['천도결', L('하늘문 길드', 'Skygate Guild'), 72, 20, 9000],
    ['서리안', L('청운 에이전시', 'Bluecloud Agency'), 64, 20, 7200],
    ['마태한', L('철갑 헌터스', 'Ironclad Hunters'), 58, 20, 5800],
    ['연소휘', L('하늘문 길드', 'Skygate Guild'), 52, 20, 4700],
    ['구자겸', L('바람결 컴퍼니', 'Windward Company'), 47, 20, 3900],
    ['하은재', L('청운 에이전시', 'Bluecloud Agency'), 43, 19, 3300],
    ['방도철', L('철갑 헌터스', 'Ironclad Hunters'), 40, 18, 2900],
    ['유가람', L('바람결 컴퍼니', 'Windward Company'), 37, 17, 2600],
    ['진무열', L('독립 헌터', 'Independent'), 35, 16, 2350],
    ['나세아', L('독립 헌터', 'Independent'), 33, 15, 2150],
  ];
  return list.map(([name, agency, level, bestFloor, score], i) => ({
    id: -1 - i, name, agency, level, bestFloor, score, cls: CLASS_IDS[(i * 3 + 1) % CLASS_IDS.length],
  }));
}

/** Saves from before the rankers were raised hold rankers weaker than A grade: swap in the new ones. */
export function refreshWorldRankers(state: GameState) {
  if (state.world.some((w) => w.score < GRADE_A_POWER || !w.cls)) state.world = worldRankers();
}

/** Everything that survives between runs. */
export interface GameState {
  version: 3;
  agent: Agent;
  slots: Array<Hunter | null>;
  activeSlot: number;
  hallOfFame: HallOfFameEntry[];
  rival: RivalAgency;
  /** A second rival agency, which enters the business once ours reaches the top level. */
  rival2?: RivalAgency;
  world: WorldRanker[];
  nextHunterId: number;
  /** How many hunters this agency has ever signed. */
  hunterNumber: number;
  /** A tower run that was still going when the game was last saved. */
  run?: { hunterId: number; data: RunSnapshot };
  /** Gates open right now. Filled in by refreshGates; older saves have none. */
  gates?: Gate[];
  /** Days passed: one for every return from the tower or a gate. */
  day?: number;
  nextGateId?: number;
  /** Gates cleared by us and by the rival agency. */
  gateRecord?: { ours: number; rival: number; rival2?: number };
  /** The great rift, while it is open (or our hunter is inside). */
  rift?: Gate;
  /** Day the next great rift opens. */
  nextRiftDay?: number;
  /** Today's candidates at the scout center. */
  scouts?: { day: number; list: Hunter[] };
  /** The association's quest board, once the agency can take quests. */
  quests?: QuestBoard;
}

/** Every rival agency in business: the first one, and the second once it has come. */
export function rivalAgencies(state: GameState): RivalAgency[] {
  return state.rival2 ? [state.rival, state.rival2] : [state.rival];
}

/** All hunters at rival agencies. */
export function rivalHunters(state: GameState): Hunter[] {
  return rivalAgencies(state).flatMap((a) => a.roster);
}

/** The rival agency a hunter is signed to. */
export function agencyOf(state: GameState, id: number): RivalAgency {
  return rivalAgencies(state).find((a) => a.roster.some((h) => h.id === id)) ?? state.rival;
}

/** Agency name for each rival hunter, for the tower to label them. */
export function rivalAgencyNames(state: GameState): Record<number, string> {
  const out: Record<number, string> = {};
  for (const a of rivalAgencies(state)) for (const h of a.roster) out[h.id] = a.name;
  return out;
}

/** Hands our hunters what the agency's level gives them (bigger bags). */
export function syncPerks(state: GameState) {
  const big = unlocked(state.agent, 'bag');
  for (const h of state.slots) {
    if (!h) continue;
    h.bagSize = big ? BIG_BAG : undefined;
  }
}

/** The second rival agency's own hunters at the start: about as strong as our best. */
export const RIVAL2_CREW = 3;

/** Once the agency is at the top level, a second rival agency enters the business. */
function openRival2(state: GameState, rng: Rng, news: string[]) {
  if (state.rival2 || !unlocked(state.agent, 'rival2') || state.agent.allOpen && agencyLevel(state.agent) < MAX_AGENCY_LEVEL) return;
  const taken = [state.agent.name, state.rival.name];
  const name = RIVAL_NAMES.find((n) => !taken.includes(n) && rng.chance(0.5)) ?? RIVAL_NAMES.find((n) => !taken.includes(n)) ?? randomAgencyName(rng, taken);
  const best = Math.max(1, ...state.slots.map((h) => h?.level ?? 1));
  const roster: Hunter[] = [];
  state.rival2 = { name, roster };
  for (let i = 0; i < RIVAL2_CREW; i++) {
    const h = createHunter(rng, state.nextHunterId++, allNames(state), rng.pick(CLASS_IDS));
    h.origin = 'crew';
    const goal = Math.max(1, best - 3 + i * 2 + rng.int(-1, 1));
    while (h.level < goal) levelUp(h);
    autoPick(h, rng);
    h.bestFloor = Math.min(TOP_FLOOR, Math.max(1, h.level - 2));
    roster.push(h);
  }
  news.push(L(`새 경쟁사 ${name}이(가) 업계에 뛰어들었다! 게이트와 순위를 두고 다툰다.`, `A new rival, ${name}, has entered the business! They will fight for gates and ranks.`));
}

/** What the quest board needs to know to post a fitting quest. */
function questContext(state: GameState): QuestContext {
  const ours = state.slots.filter((h): h is Hunter => !!h);
  return {
    day: state.day ?? 0,
    level: Math.max(1, ...ours.map((h) => h.level)),
    bestFloor: Math.max(1, ...ours.map((h) => h.bestFloor)),
    arenaBest: Math.max(0, ...ours.map((h) => h.arenaBest ?? 0)),
    gates: unlocked(state.agent, 'gates'),
    arena: unlocked(state.agent, 'arena'),
  };
}

/** Fills the quest board once the agency can take quests. */
export function refreshQuests(state: GameState, rng: Rng) {
  if (!unlocked(state.agent, 'quests')) return;
  state.quests ??= { list: [], nextId: 1, done: 0 };
  refreshBoard(state.quests, rng, questContext(state));
}

/** Departure prep, bought with agency funds before a run. One at a time; it lasts one run. */
export const PREPS: Record<PrepId, { name: string; describe: string }> = {
  intel: { name: L('정보 분석', 'Intel briefing'), describe: L('이번 출정 경험치 +25%', 'EXP +25% this run') },
  loot: { name: L('전리품 계약', 'Loot contract'), describe: L('이번 출정 처치 골드 +25%', 'Kill gold +25% this run') },
  edge: { name: L('무기 정비', 'Weapon tune-up'), describe: L('이번 출정 공격력 +10%', 'Attack +10% this run') },
};
export const PREP_IDS: PrepId[] = ['intel', 'loot', 'edge'];

export function prepCost(h: Hunter): number {
  return 30 + 6 * h.level;
}

/** Buys departure prep for the active hunter from agency funds. Swapping refunds nothing. */
export function buyPrep(state: GameState, id: PrepId): boolean {
  const h = activeHunter(state);
  if (!h || h.prep === id) return false;
  const cost = prepCost(h);
  if (state.agent.gold < cost) return false;
  state.agent.gold -= cost;
  h.prep = id;
  return true;
}

/** Each day the rival agency sends a team into one open gate with this chance. */
export const RIVAL_RAID_CHANCE = 0.5;

/** The team the rival agency would send: its strongest hunter if it keeps up with ours, else its own crew. */
function rivalTeam(state: GameState, rng: Rng, agency: RivalAgency): { hunter?: string; hunterId?: number; level: number } {
  const ours = Math.max(1, ...state.slots.map((h) => h?.level ?? 1));
  const best = [...agency.roster].sort((a, b) => b.level - a.level)[0];
  if (best && best.level >= ours - 2) return { hunter: best.name, hunterId: best.id, level: best.level };
  return { level: Math.max(1, ours + rng.int(-1, 1)) };
}

/** Rival teams that went in yesterday come out: the gate is theirs, or they fall back. */
function resolveRaids(state: GameState, rng: Rng, news: string[]) {
  const gates = state.gates ?? [];
  const record = (state.gateRecord ??= { ours: 0, rival: 0 });
  for (const g of [...gates]) {
    const r = g.rival;
    if (!r) continue;
    const who = r.hunter ? L(`${r.agency}의 ${r.hunter}`, `${r.hunter} of ${r.agency}`) : r.agency;
    if (rng.chance(raidSuccess(g, r.level))) {
      gates.splice(gates.indexOf(g), 1);
      const second = state.rival2 && r.agency === state.rival2.name;
      if (second) record.rival2 = (record.rival2 ?? 0) + 1;
      else record.rival++;
      const h = rivalHunters(state).find((x) => x.id === r.hunterId);
      if (h) levelUp(h);
      news.push(L(`${who}이(가) ${gateName(g)}을(를) 먼저 클리어했다.`, `${who} cleared the ${gateName(g)} first.`));
    } else {
      g.rival = undefined;
      news.push(L(`${who}은(는) ${gateName(g)} 공략에 실패하고 물러났다.`, `${who} failed the ${gateName(g)} and pulled back.`));
    }
  }
}

/** Some days the rival agency picks the hardest open gate its team can handle and goes in. */
function startRaid(state: GameState, rng: Rng, news: string[], agency: RivalAgency) {
  if (!rng.chance(RIVAL_RAID_CHANCE)) return;
  const open = (state.gates ?? []).filter((g) => !g.rival);
  if (!open.length) return;
  const team = rivalTeam(state, rng, agency);
  const fits = open.filter((g) => gateLevel(g) <= team.level + 1);
  const g = fits.length ? fits[fits.length - 1] : open[0];
  g.rival = { agency: agency.name, ...team, since: state.day ?? 0 };
  const who = team.hunter ? L(`${agency.name}의 ${team.hunter}`, `${team.hunter} of ${agency.name}`) : agency.name;
  news.push(L(`${who}이(가) ${gateName(g)}에 들어갔다. 다음 날이면 끝낼지도 모른다.`, `${who} entered the ${gateName(g)}. They may finish it by tomorrow.`));
}

/**
 * The great rift. One opens every few days, sized to the agency's best hunter, and stays three days.
 * Our hunter gets one try. If we don't close it, the rival agency does and its best hunter grows.
 * `closed` says whether our hunter just cleared it.
 */
export function updateRift(state: GameState, rng: Rng, news: string[], closed = false) {
  const day = state.day ?? 0;
  const r = state.rift;
  if (r && (r.entered || r.closesOn < day)) {
    if (closed && r.entered) {
      news.push(L(`대균열을 막아냈다! 협회가 ${state.agent.name}의 이름을 기억한다.`, `The Great Rift is sealed! The Association will remember ${state.agent.name}.`));
    } else {
      const record = (state.gateRecord ??= { ours: 0, rival: 0 });
      record.rival++;
      const best = [...state.rival.roster].sort((a, b) => combatPower(b) - combatPower(a))[0];
      if (best) for (let i = 0; i < RIFT.rivalLevels; i++) levelUp(best);
      news.push(best
        ? L(`대균열을 ${state.rival.name}의 ${best.name}이(가) 막아냈다. 명성을 얻고 더 강해졌다.`, `${best.name} of ${state.rival.name} sealed the Great Rift, gaining fame and power.`)
        : L(`대균열을 ${state.rival.name}이(가) 막아냈다.`, `${state.rival.name} sealed the Great Rift.`));
    }
    state.rift = undefined;
    state.nextRiftDay = day + rng.int(RIFT.gapMin, RIFT.gapMax);
  }
  if (!state.rift && day >= (state.nextRiftDay ?? RIFT.firstDay)) {
    const best = Math.max(1, ...state.slots.map((h) => h?.level ?? 1));
    const id = state.nextGateId ?? 1;
    state.nextGateId = id + 1;
    state.rift = rollRift(rng, id, best, day);
    news.push(L(`대균열이 열렸다! ${RIFT.days}일 안에 막지 못하면 ${state.rival.name}이(가) 공을 가져간다.`, `A Great Rift has opened! Seal it within ${RIFT.days} days or ${state.rival.name} takes the glory.`));
  }
}

/** Drops gates past their last day and opens new ones until there are GATE_SLOTS. */
export function refreshGates(state: GameState, rng: Rng) {
  const day = state.day ?? 0;
  const best = Math.max(1, ...state.slots.map((h) => h?.level ?? 1));
  state.gates = (state.gates ?? []).filter((g) => g.closesOn >= day);
  while (state.gates.length < GATE_SLOTS) {
    const id = state.nextGateId ?? 1;
    state.nextGateId = id + 1;
    state.gates.push(rollGate(rng, id, rollGateGrade(rng, best), day));
  }
  state.gates.sort((a, b) => GATE_GRADES.indexOf(a.grade) - GATE_GRADES.indexOf(b.grade));
}

/** Takes a gate off the board for the hunter going in. Win or lose, it is gone. */
export function enterGate(state: GameState, id: number): Gate | undefined {
  if (state.rift && state.rift.id === id && !state.rift.entered) {
    state.rift.entered = true;
    return state.rift;
  }
  const gates = state.gates ?? [];
  const i = gates.findIndex((g) => g.id === id);
  return i < 0 ? undefined : gates.splice(i, 1)[0];
}

const AGENCY_FIRST = [
  L('새벽', 'Dawn'), L('청람', 'Azure'), L('북극성', 'Polaris'), L('흑요', 'Obsidian'), L('은하', 'Galaxy'), L('백랑', 'White Wolf'), L('청룡', 'Azure Dragon'), L('주작', 'Phoenix'), L('현무', 'Black Tortoise'), L('태양', 'Sun'), L('월광', 'Moonlight'), L('천둥', 'Thunder'),
  L('바람결', 'Windward'), L('별빛', 'Starlight'), L('은빛', 'Silver'), L('금강', 'Diamond'), L('해오름', 'Sunrise'), L('노을', 'Sunset'), L('설화', 'Snowflower'), L('불꽃', 'Flame'), L('푸른달', 'Blue Moon'), L('검은별', 'Black Star'), L('한빛', 'Brightlight'), L('창공', 'Skyward'),
];
const AGENCY_LAST = [L('에이전시', 'Agency'), L('헌터스', 'Hunters'), L('매니지먼트', 'Management'), L('컴퍼니', 'Company'), L('길드', 'Guild'), L('헌터 협회', 'Hunter Society'), L('기획', 'Works'), L('엔터', 'Entertainment')];
/** English names run longer, so they get more room. */
export const AGENCY_NAME_MAX = lang() === 'en' ? 20 : 12;

/** A made-up agency name like "청룡 헌터스", different from any name in avoid. */
export function randomAgencyName(rng: Rng, avoid: string[] = []): string {
  for (let i = 0; i < 20; i++) {
    const name = `${rng.pick(AGENCY_FIRST)} ${rng.pick(AGENCY_LAST)}`;
    if (!avoid.includes(name) && name.length <= AGENCY_NAME_MAX) return name;
  }
  return cleanAgencyName(`${rng.pick(AGENCY_FIRST)} ${rng.pick(AGENCY_LAST)}`);
}

/** Trims spaces and cuts to the length limit. Empty means the name can't be used. */
export function cleanAgencyName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, AGENCY_NAME_MAX);
}

/** Names the agency on the first screen. The rival agency never shares the name. */
export function foundAgency(state: GameState, rng: Rng, raw: string): boolean {
  const name = cleanAgencyName(raw);
  if (!name) return false;
  state.agent.name = name;
  state.agent.named = true;
  if (state.rival.name === name) state.rival.name = rng.pick(RIVAL_NAMES.filter((n) => n !== name));
  return true;
}
const RIVAL_NAMES = [L('적월 길드', 'Red Moon Guild'), L('흑철 헌터스', 'Blackiron Hunters'), L('마그나 에이전시', 'Magna Agency'), L('백야 컴퍼니', 'White Night Company')];

export function newGame(rng: Rng): GameState {
  const state: GameState = {
    version: 3,
    agent: { name: randomAgencyName(rng), gold: 100, named: false, exp: 0 },
    slots: [null, null, null],
    activeSlot: 0,
    hallOfFame: [],
    rival: { name: rng.pick(RIVAL_NAMES), roster: [] },
    world: worldRankers(),
    nextHunterId: 1,
    hunterNumber: 0,
  };
  hire(state, rng, 0);
  refreshGates(state, rng);
  return state;
}

export function activeHunter(state: GameState): Hunter | undefined {
  return state.slots[state.activeSlot] ?? undefined;
}

function allNames(state: GameState): string[] {
  return [
    ...state.slots.filter((h): h is Hunter => !!h).map((h) => h.name),
    ...rivalHunters(state).map((h) => h.name),
    ...state.hallOfFame.map((e) => e.name),
    ...state.world.map((w) => w.name),
  ];
}

/** Sign a new hunter into an empty slot. */
export function hire(state: GameState, rng: Rng, slot: number, cls?: ClassId, firstSkill?: SkillId): Hunter | undefined {
  if (state.slots[slot]) return undefined;
  const h = createHunter(rng, state.nextHunterId++, allNames(state), cls, firstSkill);
  applyRookie(state.agent.legacy, h);
  h.bag = homeBag(state);
  h.contractGrade = powerGrade(h);
  state.slots[slot] = h;
  syncPerks(state);
  state.hunterNumber += 1;
  state.activeSlot = slot;
  return h;
}

/** A hunter who has done nothing yet: hired automatically, never trained, never in the tower. */
export function untouched(h: Hunter): boolean {
  const trained = Object.values(h.training).some((n) => n > 0);
  return h.level === 1 && h.exp === 0 && h.bestFloor === 0 && h.kills === 0 && !trained && Object.keys(h.gear).length === 0;
}

/** Re-sign an untouched hunter in another class. Name and number stay. */
export function changeClass(state: GameState, rng: Rng, slot: number, cls: ClassId, firstSkill: SkillId): Hunter | undefined {
  const old = state.slots[slot];
  if (!old || !untouched(old)) return undefined;
  const h = createHunter(rng, old.id, [], cls, firstSkill);
  h.name = old.name;
  applyRookie(state.agent.legacy, h);
  h.bag = old.bag;
  h.gold = old.gold;
  h.contractGrade = powerGrade(h);
  state.slots[slot] = h;
  return h;
}

/** Let a hunter go. They join the rival agency and may come back as an enemy. */
export function release(state: GameState, slot: number): Hunter | undefined {
  const h = state.slots[slot];
  if (!h) return undefined;
  state.slots[slot] = null;
  h.origin = 'released';
  h.hp = h.maxHp;
  h.mp = h.maxMp;
  state.rival.roster.push(h);
  pickActiveSlot(state);
  return h;
}

/** Whether this hunter may retire now: S-rank or better on the current ranking. */
export function canRetire(state: GameState, h: Hunter): boolean {
  return canRetireGrade(gradeIn(state, h));
}

export interface RetireResult {
  hunter: Hunter;
  grade: Grade;
  points: number;
  legend: boolean;
}

/**
 * The hunter retires: off the ranking for good, into the hall of fame (as a legend if SSS),
 * leaving legacy points behind. The slot is freed for a new hunter.
 */
export function retire(state: GameState, slot: number): RetireResult | undefined {
  const h = state.slots[slot];
  if (!h) return undefined;
  const grade = gradeIn(state, h);
  const points = RETIRE_POINTS[grade];
  if (points === undefined) return undefined;
  const legend = grade === 'SSS';
  const entry = toRecord(h, grade, legend ? L('은퇴 · 전설', 'Retired · Legend') : L('은퇴', 'Retired'));
  entry.retired = true;
  entry.legend = legend;
  entry.abyssBest = h.abyssBest;
  entry.arenaBest = h.arenaBest;
  state.hallOfFame.push(entry);
  state.slots[slot] = null;
  const legacy = (state.agent.legacy ??= { points: 0, perks: {} });
  legacy.points += points;
  pickActiveSlot(state);
  return { hunter: h, grade, points, legend };
}

/** Deepest abyss floor any of our hunters reached, alive or retired. */
export function abyssRecord(state: GameState): { depth: number; name: string } | undefined {
  let best: { depth: number; name: string } | undefined;
  const see = (depth: number | undefined, name: string) => {
    if (depth && (!best || depth > best.depth)) best = { depth, name };
  };
  for (const h of state.slots) if (h) see(h.abyssBest, h.name);
  for (const e of state.hallOfFame) see(e.abyssBest, e.name);
  return best;
}

/** The most survival-arena waves any of the agency's hunters ever cleared, and who. */
export function arenaRecord(state: GameState): { wave: number; name: string } | undefined {
  let best: { wave: number; name: string } | undefined;
  const see = (wave: number | undefined, name: string) => {
    if (wave && (!best || wave > best.wave)) best = { wave, name };
  };
  for (const h of state.slots) if (h) see(h.arenaBest, h.name);
  for (const e of state.hallOfFame) see(e.arenaBest, e.name);
  return best;
}

/** The survival arena opens once the hunter has beaten the tower's first boss (floor 5). */
export const ARENA_UNLOCK_FLOOR = 5;

export function arenaUnlocked(h: Hunter): boolean {
  return h.bestFloor >= ARENA_UNLOCK_FLOOR;
}

/** Once a day per hunter: a day passes each time a hunter comes back. */
export function canEnterArena(state: GameState, h: Hunter): boolean {
  return arenaUnlocked(h) && h.arenaDay !== (state.day ?? 0);
}

/** Books today's arena entry for the active hunter. */
export function startSurvival(state: GameState): Survival | undefined {
  const h = activeHunter(state);
  if (!h || !canEnterArena(state, h)) return undefined;
  h.arenaDay = state.day ?? 0;
  return { wave: 0, banked: 0, bankedStones: 0 };
}

function pickActiveSlot(state: GameState) {
  if (state.slots[state.activeSlot]) return;
  const i = state.slots.findIndex((h) => !!h);
  state.activeSlot = i >= 0 ? i : 0;
}

// ---------- Ranking ----------

export type RankStatus = 'ours' | 'rival' | 'gone' | 'world';

export interface RankRow {
  id: number;
  name: string;
  level: number;
  bestFloor: number;
  score: number;
  status: RankStatus;
  note: string;
  cls?: ClassId;
}

/** Live top 10 by combat power over every named hunter: ours, the rival agency's, the fallen, the rankers. */
/** The top of the ranking: the first `limit` rows (10, the board shown at the agency). */
export function ranking(state: GameState, limit = 10): RankRow[] {
  const rows: Array<RankRow & { order: number }> = [];
  for (const h of state.slots) {
    if (h) {
      const score = combatPower(h);
      rows.push({ id: h.id, name: h.name, level: h.level, bestFloor: h.bestFloor, score, status: 'ours', note: L('우리 소속', 'Ours'), cls: h.cls, order: ladderScore(state, h, score) });
    }
  }
  for (const h of rivalHunters(state)) {
    const note = rivalTag(state, h);
    const score = combatPower(h);
    rows.push({ id: h.id, name: h.name, level: h.level, bestFloor: h.bestFloor, score, status: 'rival', note, cls: h.cls, order: score });
  }
  for (const e of state.hallOfFame) {
    if (e.retired) continue;
    const score = e.power ?? estimatePower(e.level);
    rows.push({ id: e.id, name: e.name, level: e.level, bestFloor: e.bestFloor, score, status: 'gone', note: e.fate, order: score });
  }
  for (const w of state.world) {
    rows.push({ id: w.id, name: w.name, level: w.level, bestFloor: w.bestFloor, score: w.score, status: 'world', note: w.agency, cls: w.cls, order: w.score });
  }
  return rows
    .sort((a, b) => b.order - a.order || a.id - b.id)
    .slice(0, limit)
    .map(({ order: _order, ...r }) => r);
}

/**
 * Where our hunter stands among the association rankers. Strength alone can't pass a ranker:
 * the hunter has to beat them in a challenge. A beaten ranker stays below the hunter.
 */
function ladderScore(state: GameState, h: Hunter, power: number): number {
  const beaten = new Set(h.beaten ?? []);
  const floor = Math.max(0, ...state.world.filter((w) => beaten.has(w.id)).map((w) => w.score + 1));
  const next = state.world.filter((w) => !beaten.has(w.id) && w.score > floor).reduce((m, w) => Math.min(m, w.score), Infinity);
  return Math.max(floor, Math.min(power, next - 0.5));
}

/** The ranker this hunter may challenge now: the lowest one not beaten yet that stands above them. */
export function nextChallenge(state: GameState, h: Hunter): { ranker: WorldRanker; rank: number } | undefined {
  const beaten = new Set(h.beaten ?? []);
  const floor = Math.max(0, ...state.world.filter((w) => beaten.has(w.id)).map((w) => w.score + 1));
  const ranker = state.world.filter((w) => !beaten.has(w.id) && w.score > floor).sort((a, b) => a.score - b.score)[0];
  if (!ranker) return undefined;
  // The real place on the whole ladder: the next ranker may still be below the top 10 shown.
  const rank = ranking(state, Infinity).findIndex((r) => r.id === ranker.id) + 1;
  return { ranker, rank: rank || 11 };
}

/** One challenge a day: a day passes each time a hunter comes back. */
export function canChallenge(state: GameState, h: Hunter): boolean {
  return h.duelDay !== (state.day ?? 0) && !!nextChallenge(state, h);
}

/**
 * The ranker as a fighter: their class grown to their level, then scaled so their
 * combat power matches their ranking score.
 */
export function rankerFighter(w: WorldRanker): { hp: number; mp: number; atk: number; def: number } {
  const r = createHunter(new Rng(1000 - w.id), w.id, [], w.cls ?? 'sword');
  while (r.level < w.level) levelUp(r);
  const base = combatPower(r) - r.level * 20;
  const f = Math.max(1, (w.score - w.level * 20) / base);
  return { hp: Math.round(r.maxHp * f), mp: Math.round(r.maxMp * f), atk: Math.round(r.atk * f), def: Math.round(r.def * f) };
}

/** Sets up the challenge against the next ranker, or undefined if there is none today. */
export function startDuel(state: GameState): Duel | undefined {
  const h = activeHunter(state);
  if (!h || !canChallenge(state, h)) return undefined;
  const { ranker, rank } = nextChallenge(state, h)!;
  const f = rankerFighter(ranker);
  h.duelDay = state.day ?? 0;
  return { rankerId: ranker.id, rank, name: ranker.name, agency: ranker.agency, cls: ranker.cls, level: ranker.level, hp: f.hp, atk: f.atk, def: f.def };
}

/** After the fight: a win puts the ranker below the hunter for good. */
export function settleDuel(state: GameState, duel: Duel): boolean {
  const h = activeHunter(state);
  if (!h || !duel.won) return false;
  h.beaten = [...new Set([...(h.beaten ?? []), duel.rankerId])];
  return true;
}

/** Rough combat power of an old record that did not store it: a fresh hunter plus level-ups. */
function estimatePower(level: number): number {
  return 95 + 37 * (level - 1);
}

/** A hunter's grade right now: S and above from the ranking, otherwise from combat power. */
export function gradeIn(state: GameState, h: Hunter): Grade {
  const i = ranking(state).findIndex((r) => r.id === h.id);
  return (i >= 0 ? rankGradeOf(i) : undefined) ?? powerGrade(h);
}

/** Floors cleared are skippable in steps of five: a run may start right after any boss already beaten. */
export const SKIP_STEP = 5;

/** Floors this hunter may start a run on: 1, then 6, 11, 16 once they have reached that floor before. */
export function startFloors(_state: GameState, h: Hunter): number[] {
  const floors = [1];
  for (let f = SKIP_STEP + 1; f <= h.bestFloor; f += SKIP_STEP) floors.push(f);
  // The abyss: from its deepest five-floor step reached so far.
  const deep = h.abyssBest ?? 0;
  if (deep >= 1 && h.bestFloor >= TOP_FLOOR) floors.push(TOP_FLOOR + 1 + SKIP_STEP * Math.floor((deep - 1) / SKIP_STEP));
  return floors;
}

/** Marks whoever holds #1 as having been SSS. */
function markSSS(state: GameState) {
  const top = ranking(state)[0];
  if (!top) return;
  const h = [...state.slots, ...rivalHunters(state)].find((x) => x?.id === top.id);
  if (h) h.everSSS = true;
}

// ---------- Training and shop ----------

export const TRAINING: Record<TrainingKind, { label: string; describe: string; apply: (h: Hunter) => void }> = {
  atk: { label: L('공격 훈련', 'ATK Training'), describe: L('공격 +1', 'ATK +1'), apply: (h) => (h.atk += 1) },
  def: { label: L('방어 훈련', 'DEF Training'), describe: L('방어 +1', 'DEF +1'), apply: (h) => (h.def += 1) },
  hp: { label: L('체력 훈련', 'HP Training'), describe: L('최대 체력 +5', 'Max HP +5'), apply: (h) => { h.maxHp += 5; h.hp += 5; } },
  mp: { label: L('마나 훈련', 'MP Training'), describe: L('최대 마나 +3', 'Max MP +3'), apply: (h) => { h.maxMp += 3; h.mp += 3; } },
};

export function trainingCost(h: Hunter, kind: TrainingKind, legacy?: Legacy, agencyLv = 1): number {
  const base = 20 + 15 * h.training[kind];
  const top = agencyLv >= MAX_AGENCY_LEVEL ? TOP_TRAINING_DISCOUNT : 0;
  return Math.max(1, Math.round(base * (1 - 0.1 * perkLevel(legacy, 'train') - top)));
}

/** The hunter puts some of their own gold into the agency. Returns the new agency level if it went up. */
export function invest(state: GameState, amount: number): { amount: number; levelUp?: number } | undefined {
  const h = activeHunter(state);
  const n = Math.min(Math.floor(amount), h?.gold ?? 0);
  if (!h || n <= 0) return undefined;
  h.gold -= n;
  h.invested = (h.invested ?? 0) + n;
  state.agent.gold += n;
  return { amount: n, levelUp: gainAgencyExp(state.agent, n * INVEST_EXP) };
}

/** Whether this slot can take a hunter at the agency's level. */
export function slotOpen(state: GameState, slot: number): boolean {
  return slot < openSlots(state.agent) || !!state.slots[slot];
}

export { agencyLevel, unlocked };

// ---------- Gear storage ----------

export const STASH_SIZE = 12;

/** Agency funds to take a piece out: 15 × tier², a little more for each enhancement. */
export function stashFee(g: Gear): number {
  return Math.round(15 * g.tier * g.tier * (1 + 0.1 * (g.plus ?? 0)));
}

/** What the agency gets for selling a stored piece. */
export function stashPrice(g: Gear): number {
  return 5 * g.tier * g.tier;
}

/** Puts gear swapped out during a run into storage while there is room. Returns how many went in. */
export function storeSpare(state: GameState, gears: Gear[]): number {
  const stash = (state.agent.stash ??= []);
  let n = 0;
  for (const g of gears) {
    if (stash.length >= STASH_SIZE) break;
    stash.push(g);
    n++;
  }
  return n;
}

/** The active hunter takes off a piece and leaves it at the agency. Free. */
export function depositGear(state: GameState, slot: GearSlot): boolean {
  const h = activeHunter(state);
  const g = h?.gear[slot];
  const stash = (state.agent.stash ??= []);
  if (!h || !g || stash.length >= STASH_SIZE) return false;
  unequip(h, slot);
  stash.push(g);
  return true;
}

export type WithdrawResult = { ok: true; fee: number; swapped?: Gear } | { ok: false; reason: 'level' | 'gold' | 'none' };

/** The active hunter puts on a stored piece: needs the gear's level and pays the fee. What they wore goes into storage. */
export function withdrawGear(state: GameState, index: number): WithdrawResult {
  const h = activeHunter(state);
  const stash = state.agent.stash ?? [];
  const g = stash[index];
  if (!h || !g) return { ok: false, reason: 'none' };
  if (h.level < gearLevel(g)) return { ok: false, reason: 'level' };
  const fee = stashFee(g);
  if (state.agent.gold < fee) return { ok: false, reason: 'gold' };
  state.agent.gold -= fee;
  stash.splice(index, 1);
  const swapped = h.gear[g.slot];
  if (swapped) {
    unequip(h, g.slot);
    stash.push(swapped);
  }
  // The slot is empty now, so the stored piece always goes on.
  equipIfBetter(h, g);
  return { ok: true, fee, swapped };
}

export function sellStashed(state: GameState, index: number): number {
  const stash = state.agent.stash ?? [];
  const g = stash[index];
  if (!g) return 0;
  stash.splice(index, 1);
  const price = stashPrice(g);
  state.agent.gold += price;
  return price;
}

// ---------- Dispatch ----------

export function isAway(h: Hunter | null | undefined): boolean {
  return h?.dispatchDay !== undefined;
}

/** Another hunter has to stay home, so the agency can still send someone up the tower. */
export function canDispatch(state: GameState, slot: number): boolean {
  const h = state.slots[slot];
  if (!h || isAway(h) || !unlocked(state.agent, 'dispatch')) return false;
  return state.slots.some((o, i) => i !== slot && o && !isAway(o));
}

export function dispatch(state: GameState, slot: number): boolean {
  if (!canDispatch(state, slot)) return false;
  state.slots[slot]!.dispatchDay = state.day ?? 0;
  if (state.activeSlot === slot) state.activeSlot = state.slots.findIndex((o) => o && !isAway(o));
  return true;
}

/** Gold a dispatch brings in, before the agency's cut: about a tenth of a good tower run. */
export function dispatchPay(h: Hunter): { gold: number; exp: number } {
  const f = Math.max(1, h.bestFloor);
  return { gold: 30 + 12 * f, exp: 10 + 6 * f };
}

/** Dispatched hunters come home at the end of the day with pay and experience. */
function resolveDispatches(state: GameState, rng: Rng): DispatchReport[] {
  const out: DispatchReport[] = [];
  for (const h of state.slots) {
    if (!h || !isAway(h)) continue;
    const pay = dispatchPay(h);
    const earned = Math.round(pay.gold * (0.8 + rng.next() * 0.4));
    const tribute = Math.floor(earned * cutRate(h));
    state.agent.gold += tribute;
    h.gold += earned - tribute;
    h.totalTribute += tribute;
    gainAgencyExp(state.agent, tribute);
    // Level-up cards wait for the next run, as after any trip.
    gainExp(h, pay.exp);
    delete h.dispatchDay;
    out.push({ name: h.name, earned, tribute, exp: pay.exp });
  }
  return out;
}

// ---------- Scout center ----------

export const TALENTS = {
  strong: { name: () => L('괴력', 'Strong'), text: () => L('공격 +3', 'ATK +3'), apply: (h: Hunter) => { h.atk += 3; } },
  tough: { name: () => L('강골', 'Tough'), text: () => L('최대 체력 +20', 'Max HP +20'), apply: (h: Hunter) => { h.maxHp += 20; } },
  guard: { name: () => L('철벽', 'Ironclad'), text: () => L('방어 +2', 'DEF +2'), apply: (h: Hunter) => { h.def += 2; } },
  mana: { name: () => L('마력 체질', 'Mana-born'), text: () => L('최대 마나 +10 · 마나 회복 +0.2', 'Max MP +10 · MP regen +0.2'), apply: (h: Hunter) => { h.maxMp += 10; h.mpRegen = Math.round(((h.mpRegen ?? 0) + 0.2) * 100) / 100; } },
  lucky: { name: () => L('행운아', 'Lucky'), text: () => L('위기 지원 1회', 'One emergency rescue'), apply: (h: Hunter) => { h.rescues += 1; } },
} as const;
export type TalentId = keyof typeof TALENTS;
export const SCOUT_COUNT = 3;

/** Candidates come with a talent and some experience: up to Lv.3, or Lv.5 at the top agency level. */
export function scoutCandidates(state: GameState, rng: Rng): Hunter[] {
  const day = state.day ?? 0;
  if (state.scouts?.day === day) return state.scouts.list;
  const maxLv = agencyLevel(state.agent) >= MAX_AGENCY_LEVEL ? 5 : 3;
  const names = allNames(state);
  const classes = rng.shuffle([...CLASS_IDS]);
  const list: Hunter[] = [];
  for (let i = 0; i < SCOUT_COUNT; i++) {
    const h = createHunter(rng, -1 - i, names, classes[i % classes.length]);
    names.push(h.name);
    const lv = rng.int(1, maxLv);
    while (h.level < lv) levelUp(h);
    autoPick(h, rng);
    const talent = rng.pick(Object.keys(TALENTS) as TalentId[]);
    TALENTS[talent].apply(h);
    h.talent = talent;
    h.hp = h.maxHp;
    h.mp = h.maxMp;
    list.push(h);
  }
  state.scouts = { day, list };
  return list;
}

/** Signs one of today's candidates into an empty slot. */
export function hireScout(state: GameState, slot: number, index: number): Hunter | undefined {
  const list = state.scouts?.list ?? [];
  const h = list[index];
  if (!h || state.slots[slot] || !slotOpen(state, slot)) return undefined;
  list.splice(index, 1);
  h.id = state.nextHunterId++;
  applyRookie(state.agent.legacy, h);
  h.bag = homeBag(state);
  h.contractGrade = powerGrade(h);
  state.slots[slot] = h;
  state.hunterNumber = (state.hunterNumber ?? 0) + 1;
  state.activeSlot = slot;
  return h;
}

/** The agent invests in the active hunter. Paid from agent gold. */
export function train(state: GameState, kind: TrainingKind): boolean {
  const h = activeHunter(state);
  if (!h) return false;
  const cost = trainingCost(h, kind, state.agent.legacy, agencyLevel(state.agent));
  if (state.agent.gold < cost) return false;
  state.agent.gold -= cost;
  h.training[kind] += 1;
  TRAINING[kind].apply(h);
  return true;
}

/** Agent must hold at least this much before it helps with item purchases. */
export const SUPPORT_MIN_AGENT_GOLD = 100;
export const SUPPORT_CHANCE = 0.3;
export const SUPPORT_SHARE = 0.4;

export interface PurchaseResult {
  ok: boolean;
  hunterPaid: number;
  agentPaid: number;
}

/** The active hunter buys a potion. Sometimes the agent covers part of the price. */
export function buyItem(state: GameState, rng: Rng, kind: ConsumableKind): PurchaseResult {
  const { agent } = state;
  const hunter = activeHunter(state);
  const price = CONSUMABLES[kind].price;
  const fail = { ok: false, hunterPaid: 0, agentPaid: 0 };
  if (!hunter || price === undefined || hunter.bag[kind] >= bagMax(hunter)) return fail;
  if (CONSUMABLES[kind].bigShop && !unlocked(agent, 'shop')) return fail;
  let agentPaid = 0;
  if (agent.gold >= SUPPORT_MIN_AGENT_GOLD && rng.chance(SUPPORT_CHANCE)) {
    agentPaid = Math.floor(price * SUPPORT_SHARE);
  }
  const hunterPaid = price - agentPaid;
  if (hunter.gold < hunterPaid) return fail;
  hunter.gold -= hunterPaid;
  agent.gold -= agentPaid;
  hunter.bag[kind] += 1;
  return { ok: true, hunterPaid, agentPaid };
}

// ---------- After a run ----------

// ---------- Enhancement ----------

/** Chance to reach +1 … +10. */
export const ENHANCE_CHANCE = [1, 1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];
/**
 * What happens on a failed try, by the level the piece is at: chance it breaks, chance it drops
 * a level, and the rest it stays. Below +5 a failure only costs the stones and gold.
 */
export const ENHANCE_FAIL: Record<number, { break: number; drop: number }> = {
  5: { break: 0, drop: 0.5 },
  6: { break: 0, drop: 0.5 },
  7: { break: 0.2, drop: 0.4 },
  8: { break: 0.3, drop: 0.4 },
  9: { break: 0.4, drop: 0.4 },
};

/** Odds of each outcome if a try at this level fails. */
export function failOdds(g: Gear): { break: number; drop: number; keep: number } {
  const f = ENHANCE_FAIL[g.plus ?? 0] ?? { break: 0, drop: 0 };
  return { ...f, keep: Math.max(0, 1 - f.break - f.drop) };
}

/** Stones and agency gold to take a piece one level up. */
export function enhanceCost(g: Gear): { stones: number; gold: number } {
  const to = (g.plus ?? 0) + 1;
  return { stones: to, gold: 10 * to * g.tier };
}

export function enhanceChance(g: Gear): number {
  return ENHANCE_CHANCE[Math.min(MAX_PLUS, (g.plus ?? 0) + 1) - 1];
}

export interface EnhanceResult {
  success: boolean;
  /** The piece broke and is gone. */
  broken: boolean;
  from: number;
  to: number;
  gear: Gear;
}

/** The worst a failure at this level can do: nothing, a level, or the piece. */
export function enhanceRisk(g: Gear): 'none' | 'drop' | 'break' {
  const f = failOdds(g);
  return f.break > 0 ? 'break' : f.drop > 0 ? 'drop' : 'none';
}

/** Tries to enhance the active hunter's piece in a slot, paid from the agency's stones and gold. */
export function enhanceGear(state: GameState, rng: Rng, slot: GearSlot): EnhanceResult | undefined {
  const h = activeHunter(state);
  const g = h?.gear[slot];
  if (!h || !g || (g.plus ?? 0) >= MAX_PLUS) return undefined;
  const cost = enhanceCost(g);
  const stones = state.agent.stones ?? 0;
  if (stones < cost.stones || state.agent.gold < cost.gold) return undefined;
  state.agent.stones = stones - cost.stones;
  state.agent.gold -= cost.gold;
  const from = g.plus ?? 0;
  const success = rng.chance(enhanceChance(g));
  if (success) {
    setPlus(h, slot, from + 1);
    return { success, broken: false, from, to: from + 1, gear: g };
  }
  const odds = failOdds(g);
  const roll = rng.next();
  if (roll < odds.break) {
    unequip(h, slot);
    return { success, broken: true, from, to: 0, gear: g };
  }
  const to = roll < odds.break + odds.drop ? from - 1 : from;
  setPlus(h, slot, to);
  return { success, broken: false, from, to, gear: g };
}

export interface GachaResult {
  gear: Gear;
  equipped: boolean;
  /** What was worn in that slot before. */
  old?: Gear;
  /** Gold back when the piece was no better and got sold. */
  refund: number;
}

/** The active hunter pays for one gear draw. Better than what is worn: put on. Otherwise sold back. */
export function drawGear(state: GameState, rng: Rng): GachaResult | undefined {
  const h = activeHunter(state);
  if (!h || h.gold < GACHA_PRICE) return undefined;
  h.gold -= GACHA_PRICE;
  const gear = rollGacha(rng);
  const old = h.gear[gear.slot];
  const { equipped } = equipIfBetter(h, gear);
  const refund = equipped ? 0 : GACHA_REFUND;
  h.gold += refund;
  return { gear, equipped, old, refund };
}

/** What happened to rival hunters met in the tower. */
export interface EncounterOutcome {
  hunterId: number;
  finished: boolean;
}

export interface AfterRunNews {
  promotedFrom?: Grade;
  promotedTo?: Grade;
  signingSupport: number;
  rivalCreated?: Hunter;
  finished: string[];
  grewStronger: string[];
  /** What rival teams did at the gates. */
  gateNews: string[];
  /** Hunters back from a dispatch. */
  dispatched?: DispatchReport[];
}

export interface DispatchReport {
  name: string;
  earned: number;
  tribute: number;
  exp: number;
}

export interface ReturnResult extends AfterRunNews {
  earned: number;
  tribute: number;
  kept: number;
  rate: number;
  /** Extra from the Association (legacy perk), and mana stones after appraisal. */
  backing: number;
  stones: number;
  /** The agency's new level, if the cut raised it. */
  agencyUp?: number;
  /** Association quests this run finished, already paid. */
  quests?: Quest[];
}

/** What the bag holds at the start of each run: one health potion, more with the supply perk. */
export function homeBag(state: GameState) {
  const bag = startingBag();
  bag.hp += perkLevel(state.agent.legacy, 'potion');
  return bag;
}

/** Hunter came back alive: pay tribute under the current contract, then re-contract on promotion. */
export function settleReturn(
  state: GameState, rng: Rng, earned: number, encounters: EncounterOutcome[] = [], clearedGate = false, stones = 0, report?: RunReport,
): ReturnResult {
  const { agent } = state;
  const levelBefore = agencyLevel(agent);
  // Association quests: progress counts only for hunters who come home.
  const quests = report && state.quests && unlocked(agent, 'quests') ? applyReport(state.quests, report, state.day ?? 0) : [];
  for (const q of quests) {
    agent.gold += q.gold;
    agent.stones = (agent.stones ?? 0) + q.stones;
    gainAgencyExp(agent, q.exp);
  }
  const appraised = Math.round(stones * (1 + 0.2 * perkLevel(agent.legacy, 'stones')));
  agent.stones = (agent.stones ?? 0) + appraised;
  if (clearedGate) (state.gateRecord ??= { ours: 0, rival: 0 }).ours++;
  const hunter = activeHunter(state)!;
  const rate = cutRate(hunter);
  const tribute = Math.floor(earned * rate);
  gainAgencyExp(agent, tribute);
  // Association backing (legacy): extra on top of the cut, not taken from the hunter.
  const backing = Math.floor(tribute * 0.1 * perkLevel(agent.legacy, 'tribute'));
  agent.gold += tribute + backing;
  hunter.gold += earned - tribute;
  hunter.totalTribute += tribute;
  hunter.hp = hunter.maxHp;
  hunter.mp = hunter.maxMp;
  hunter.prep = undefined;
  // Potions and scrolls don't come home: the bag goes back to one health potion.
  hunter.bag = homeBag(state);

  const news = afterRun(state, rng, encounters, clearedGate);
  const agencyUp = agencyLevel(agent) > levelBefore ? agencyLevel(agent) : undefined;
  const result: ReturnResult = { earned, tribute, kept: earned - tribute, rate, backing, stones: appraised, agencyUp, quests, ...news };

  const now = gradeIn(state, hunter);
  if (gradeRank(now) > gradeRank(hunter.contractGrade)) {
    result.promotedFrom = hunter.contractGrade;
    result.promotedTo = now;
    hunter.contractGrade = now;
    const support = Math.min(agent.gold, 20 * gradeRank(now));
    agent.gold -= support;
    hunter.gold += support;
    result.signingSupport = support;
  }
  return result;
}

/** Slots a hunter gets better gear in when a rival agency signs them. */
export const SCOUT_GEAR_UPGRADES = 2;
/** Each day, a scouted hunter gets one piece one tier better with this chance. */
export const SCOUT_GEAR_DAILY = 0.3;

/**
 * The rival agency outfits a hunter it took: one slot gets a piece one tier better,
 * an empty slot gets what their best floor would drop. Returns the new piece, if any.
 */
export function upgradeScoutGear(h: Hunter, rng: Rng): Gear | undefined {
  const slots = rng.shuffle([...GEAR_SLOTS]);
  for (const slot of slots) {
    const cur = h.gear[slot];
    if (cur && cur.tier >= MAX_TIER) continue;
    const next = cur ? makeGear(rng, cur.tier + 1, slot) : rollGear(rng, Math.max(1, h.bestFloor), slot);
    if (equipIfBetter(h, next).equipped) return next;
  }
  return undefined;
}

export interface DeathResult extends AfterRunNews {
  hunter: Hunter;
  scouted: boolean;
  /** The rival agency that took the hunter in, if scouted. */
  agency?: string;
  /** Gear the rival agency gave a scouted hunter. */
  newGear?: Gear[];
  entry?: HallOfFameEntry;
}

export function scoutChance(grade: Grade): number {
  return Math.min(0.9, 0.4 + 0.05 * gradeRank(grade));
}

/**
 * The active hunter died. A passing rival agency may save and sign them;
 * a hunter who was ever SSS always is. Otherwise they go into the hall of fame.
 */
export function settleDeath(state: GameState, rng: Rng, killer: string, encounters: EncounterOutcome[] = []): DeathResult {
  const slot = state.activeSlot;
  const h = state.slots[slot]!;
  const grade = gradeIn(state, h);
  markSSS(state);
  const scouted = h.everSSS || rng.chance(scoutChance(grade));
  state.slots[slot] = null;
  let entry: HallOfFameEntry | undefined;
  let newGear: Gear[] | undefined;
  // With two rival agencies, either one may be the one passing by.
  const taker = state.rival2 && rng.chance(0.5) ? state.rival2 : state.rival;
  h.prep = undefined;
  if (scouted) {
    h.origin = 'scouted';
    for (let i = 0; i < SCOUT_GEAR_UPGRADES; i++) {
      const g = upgradeScoutGear(h, rng);
      if (g) (newGear ??= []).push(g);
    }
    h.hp = h.maxHp;
    h.mp = h.maxMp;
    taker.roster.push(h);
  } else {
    entry = toRecord(h, grade, L(`${killer}에게 사망`, `Killed by ${killer}`));
    state.hallOfFame.push(entry);
  }
  const news = afterRun(state, rng, encounters);
  if (!state.slots.some((s) => !!s)) hire(state, rng, slot);
  pickActiveSlot(state);
  return { hunter: h, scouted, agency: scouted ? taker.name : undefined, entry, newGear, ...news, signingSupport: 0 };
}

function toRecord(h: Hunter, grade: Grade, fate: string): HallOfFameEntry {
  return {
    id: h.id, name: h.name, grade, level: h.level, kills: h.kills, bestFloor: h.bestFloor,
    totalTribute: h.totalTribute, score: hallOfFameScore(h), power: combatPower(h), fate, abyssBest: h.abyssBest, arenaBest: h.arenaBest,
  };
}

/** Shared bookkeeping at the end of every run. */
function afterRun(state: GameState, rng: Rng, encounters: EncounterOutcome[], clearedGate = false): AfterRunNews {
  const news: AfterRunNews = { signingSupport: 0, finished: [], grewStronger: [], gateNews: [] };

  // Rival hunters met in the tower: finished for good, or back and stronger.
  for (const o of encounters) {
    const roster = agencyOf(state, o.hunterId).roster;
    const idx = roster.findIndex((h) => h.id === o.hunterId);
    if (idx < 0) continue;
    const h = roster[idx];
    if (o.finished) {
      roster.splice(idx, 1);
      state.hallOfFame.push(toRecord(h, powerGrade(h), L('우리 헌터에게 완전히 쓰러짐', 'Finished off by our hunter')));
      news.finished.push(h.name);
    } else {
      spareBoost(h);
      news.grewStronger.push(h.name);
    }
  }

  // The rival agency trains its hunters too, and keeps outfitting the ones it scouted.
  const ourBest = Math.max(1, ...state.slots.map((h) => h?.level ?? 1));
  for (const h of rivalHunters(state)) {
    if (h.origin === 'rival') continue;
    if (rng.chance(0.5)) levelUp(h);
    // The second agency's own crew doesn't fall far behind our best.
    if (h.origin === 'crew' && h.level < ourBest - 3) levelUp(h);
    if (h.origin === 'scouted' && rng.chance(SCOUT_GEAR_DAILY)) upgradeScoutGear(h, rng);
  }

  // Hunters nobody plays pick their own level-up cards.
  for (const h of rivalHunters(state)) autoPick(h, rng);

  // Rival hunters keep pace with the hunter they shadow.
  for (const r of state.rival.roster.filter((h) => h.origin === 'rival')) {
    const target = state.slots.find((h) => h?.id === r.rivalOf);
    if (!target) continue;
    // Each time our hunter let them go, they come back further ahead.
    const edge = 1 + SPARE_EDGE * (r.spared ?? 0);
    const goal = combatPower(target) * (0.92 + rng.next() * 0.16) * edge;
    for (let i = 0; i < 20 && combatPower(r) < goal; i++) levelUp(r);
    r.bestFloor = Math.min(TOP_FLOOR, Math.max(r.bestFloor, target.bestFloor + rng.int(-1, 1)));
    r.killScore = Math.max(r.killScore, Math.round(target.killScore * (0.9 + rng.next() * 0.2)));
    r.kills = Math.max(r.kills, target.kills);
    autoPick(r, rng);
  }

  // Our hunters who just reached S get a rival.
  for (const h of state.slots) {
    if (!h) continue;
    const isS = gradeRank(gradeIn(state, h)) >= gradeRank('S');
    const hasRival = state.rival.roster.some((r) => r.origin === 'rival' && r.rivalOf === h.id);
    if (isS && !hasRival && !news.rivalCreated) {
      news.rivalCreated = createRival(state, rng, h);
    }
  }

  markSSS(state);
  openRival2(state, rng, news.gateNews);
  news.dispatched = resolveDispatches(state, rng);
  state.day = (state.day ?? 0) + 1;
  resolveRaids(state, rng, news.gateNews);
  refreshGates(state, rng);
  for (const a of rivalAgencies(state)) startRaid(state, rng, news.gateNews, a);
  refreshQuests(state, rng);
  syncPerks(state);
  updateRift(state, rng, news.gateNews, clearedGate);
  return news;
}

/** Stat gain for an enemy hunter let go with a reward: a rival grows more than an old colleague. */
export const SPARE_BOOST = { rival: 0.25, other: 0.15 };
/** How far a rival keeps ahead of the hunter they shadow, per time they were let go. */
export const SPARE_EDGE = 0.12;

/** Beaten and let go: two levels and a big jump in every stat. */
export function spareBoost(h: Hunter) {
  levelUp(h);
  levelUp(h);
  const f = 1 + (h.origin === 'rival' ? SPARE_BOOST.rival : SPARE_BOOST.other);
  h.maxHp = Math.round(h.maxHp * f);
  h.maxMp = Math.round(h.maxMp * f);
  h.atk = Math.round(h.atk * f);
  h.def = Math.round(h.def * f);
  h.hp = h.maxHp;
  h.mp = h.maxMp;
  h.spared = (h.spared ?? 0) + 1;
}

/** "강도윤의 라이벌" for a rival, or how an old colleague ended up at the rival agency. */
export function rivalTag(state: GameState, h: Hunter): string {
  if (h.origin === 'rival') {
    const target = state.slots.find((s) => s?.id === h.rivalOf);
    return target ? L(`${target.name}의 라이벌`, `${target.name}'s rival`) : L('라이벌', 'Rival');
  }
  if (h.origin === 'crew') return agencyOf(state, h.id).name;
  const second = state.rival2?.roster.includes(h);
  return h.origin === 'released' ? L('방출 → 경쟁사', 'Released → rival') : second ? L('스카웃 → 새 경쟁사', 'Scouted → new rival') : L('스카웃 → 경쟁사', 'Scouted → rival');
}

function createRival(state: GameState, rng: Rng, mine: Hunter): Hunter {
  const cls = COUNTER_CLASS[mine.cls];
  const r = createHunter(rng, state.nextHunterId++, allNames(state), cls);
  r.origin = 'rival';
  r.rivalOf = mine.id;
  const f = 0.95 + rng.next() * 0.1;
  r.level = mine.level;
  r.maxHp = Math.round(mine.maxHp * f);
  r.maxMp = Math.round(mine.maxMp * f);
  r.atk = Math.round(mine.atk * f);
  r.def = Math.round(mine.def * f);
  r.hp = r.maxHp;
  r.mp = r.maxMp;
  r.bestFloor = mine.bestFloor;
  r.killScore = Math.round(mine.killScore * f);
  r.kills = mine.kills;
  // As many skills as ours, upgraded about as far.
  const pool = classSkills(cls);
  r.skills = pool.slice(0, slotCount(r.level)).map((id, i) => ({ id, lv: mine.skills[i]?.lv ?? 1 }));
  state.rival.roster.push(r);
  return r;
}
