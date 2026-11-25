import { describe, expect, it } from 'vitest';
import {
  activeHunter, buyItem, buyPrep, newGame, prepCost, ranking, refreshQuests, rivalAgencies, settleDeath, settleReturn, syncPerks,
} from '../src/core/agency';
import { AGENCY_LEVEL_EXP, FEATURE_LEVEL, MAX_AGENCY_LEVEL, opensAt } from '../src/core/agencyLevel';
import { BAG_MAX, BIG_BAG, bagMax } from '../src/core/items';
import { applyReport, QUEST_DAYS, QUEST_SLOTS, refreshBoard, rollQuest, questText, QuestContext, QuestBoard } from '../src/core/quests';
import { Rng } from '../src/core/rng';
import { PREP_INTEL, TowerRun } from '../src/core/run';

function at(level: number, seed = 1) {
  const state = newGame(new Rng(seed));
  state.agent.exp = AGENCY_LEVEL_EXP[level - 1];
  return state;
}

const ctx: QuestContext = { day: 4, level: 10, bestFloor: 8, arenaBest: 0, gates: true, arena: false };

describe('quest board', () => {
  it('posts three different quests that stay up for three days', () => {
    const board: QuestBoard = { list: [], nextId: 1, done: 0 };
    refreshBoard(board, new Rng(3), ctx);
    expect(board.list).toHaveLength(QUEST_SLOTS);
    for (const q of board.list) {
      expect(q.until).toBe(ctx.day + QUEST_DAYS - 1);
      expect(q.gold).toBeGreaterThan(0);
      expect(questText(q).length).toBeGreaterThan(0);
    }
    expect(board.list.some((q) => q.kind === 'arena')).toBe(false);
  });

  it('hunt quests count kills over several runs, elites included', () => {
    const q = rollQuest(new Rng(1), 1, ctx);
    q.kind = 'hunt';
    q.target = 'orc';
    q.need = 5;
    const board: QuestBoard = { list: [q], nextId: 2, done: 0 };
    expect(applyReport(board, { kills: { orc: 2, wolf: 9 }, floor: 3, gold: 10 }, 4)).toHaveLength(0);
    expect(q.have).toBe(2);
    expect(applyReport(board, { kills: { 'elite-orc': 1, orc: 4 }, floor: 3, gold: 10 }, 5)).toHaveLength(1);
    expect(board.done).toBe(1);
    // Done or expired quests make room the next day.
    refreshBoard(board, new Rng(2), { ...ctx, day: 6 });
    expect(board.list.every((x) => x.id !== q.id)).toBe(true);
  });

  it('expired quests take no progress', () => {
    const q = rollQuest(new Rng(1), 1, ctx);
    q.kind = 'earn';
    q.need = 100;
    const board: QuestBoard = { list: [q], nextId: 2, done: 0 };
    applyReport(board, { kills: {}, floor: 1, gold: 500 }, q.until + 1);
    expect(q.have).toBe(0);
  });

  it('opens with the agency level and pays the agency when a hunter comes home', () => {
    const rng = new Rng(5);
    const low = at(1);
    refreshQuests(low, rng);
    expect(low.quests).toBeUndefined();
    const state = at(FEATURE_LEVEL.quests);
    refreshQuests(state, rng);
    const q = state.quests!.list[0];
    q.kind = 'earn';
    q.need = 50;
    const gold = state.agent.gold;
    const stones = state.agent.stones ?? 0;
    const r = settleReturn(state, rng, 60, [], false, 0, { kills: {}, floor: 1, gold: 60 });
    expect(r.quests?.map((x) => x.id)).toContain(q.id);
    expect(state.agent.gold).toBeGreaterThanOrEqual(gold + q.gold);
    expect(state.agent.stones).toBe(stones + q.stones);
    // The finished quest is replaced on the new day.
    expect(state.quests!.list).toHaveLength(QUEST_SLOTS);
    expect(state.quests!.list.some((x) => x.id === q.id)).toBe(false);
  });
});

describe('agency level features', () => {
  it('every level from 2 opens something, and the new features are on the table', () => {
    for (let l = 2; l <= MAX_AGENCY_LEVEL; l++) expect(opensAt(l).length).toBeGreaterThan(0);
    expect(FEATURE_LEVEL.quests).toBe(2);
    expect(FEATURE_LEVEL.shop).toBe(3);
    expect(FEATURE_LEVEL.bag).toBe(5);
    expect(FEATURE_LEVEL.prep).toBe(6);
    expect(FEATURE_LEVEL.rival2).toBe(MAX_AGENCY_LEVEL);
  });

  it('the bigger shop sells guard potions and return scrolls', () => {
    const rng = new Rng(1);
    const low = at(1);
    activeHunter(low)!.gold = 500;
    expect(buyItem(low, rng, 'guard').ok).toBe(false);
    const state = at(FEATURE_LEVEL.shop);
    activeHunter(state)!.gold = 500;
    expect(buyItem(state, rng, 'guard').ok).toBe(true);
    expect(buyItem(state, rng, 'escape').ok).toBe(true);
  });

  it('bigger bags hold more of each item', () => {
    const state = at(FEATURE_LEVEL.bag);
    const h = activeHunter(state)!;
    expect(bagMax(h)).toBe(BAG_MAX);
    syncPerks(state);
    expect(bagMax(h)).toBe(BIG_BAG);
    h.gold = 1000;
    for (let i = 0; i < 10; i++) buyItem(state, new Rng(i), 'hp');
    expect(h.bag.hp).toBe(BIG_BAG);
  });

  it('departure prep costs agency funds, lasts one run and boosts it', () => {
    const rng = new Rng(4);
    const state = at(FEATURE_LEVEL.prep);
    state.agent.gold = 500;
    const h = activeHunter(state)!;
    expect(buyPrep(state, 'intel')).toBe(true);
    expect(state.agent.gold).toBe(500 - prepCost(h));
    expect(buyPrep(state, 'intel')).toBe(false);
    const run = new TowerRun(h, rng, { prep: h.prep });
    expect(run.prep).toBe('intel');
    expect(run.snapshot().prep).toBe('intel');
    expect(PREP_INTEL).toBeGreaterThan(1);
    settleReturn(state, rng, 0, [], false, 0);
    expect(h.prep).toBeUndefined();
  });
});

describe('second rival agency', () => {
  it('enters at the top agency level with its own crew in the ranking', () => {
    const rng = new Rng(7);
    const state = at(MAX_AGENCY_LEVEL);
    expect(state.rival2).toBeUndefined();
    const r = settleReturn(state, rng, 0, [], false, 0);
    expect(state.rival2).toBeDefined();
    expect(state.rival2!.name).not.toBe(state.rival.name);
    expect(state.rival2!.roster.every((h) => h.origin === 'crew')).toBe(true);
    expect(rivalAgencies(state)).toHaveLength(2);
    expect(r.gateNews.some((n) => n.includes(state.rival2!.name))).toBe(true);
    expect(ranking(state).length).toBe(10);
  });

  it('either rival agency may scout a fallen hunter', () => {
    const takers = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const rng = new Rng(seed);
      const state = at(MAX_AGENCY_LEVEL, seed);
      settleReturn(state, rng, 0, [], false, 0);
      activeHunter(state)!.everSSS = true;
      const d = settleDeath(state, rng, 'x');
      expect(d.scouted).toBe(true);
      takers.add(d.agency === state.rival.name ? 'first' : 'second');
    }
    expect(takers.size).toBe(2);
  });

  it('old saves with every feature open do not get one until they reach the top level', () => {
    const rng = new Rng(8);
    const state = at(3);
    state.agent.allOpen = true;
    settleReturn(state, rng, 0, [], false, 0);
    expect(state.rival2).toBeUndefined();
  });
});
