// Full-campaign autoplayer: plays a new game day by day with a sensible player policy.
import {
  activeHunter, buyItem, canDispatch, dispatch, drawGear, enhanceGear, GameState, gradeIn, hire, invest, newGame, settleDeath,
  settleReturn, startFloors, train, trainingCost,
} from '../src/core/agency';
import { agencyLevel, unlocked } from '../src/core/agencyLevel';
import { autoPick } from '../src/core/classes';
import { botAction, breakSkill, dodgeStep, readySlot, stepTowards } from '../src/core/bot';
import { skillCost } from '../src/core/classes';
import type { Action } from '../src/core/run';
import { combatPower } from '../src/core/hunter';
import { GACHA_PRICE } from '../src/core/items';
import { recommendedLevel, TOP_FLOOR } from '../src/core/monsters';
import { Rng } from '../src/core/rng';
import { TowerRun } from '../src/core/run';

export interface DayLog {
  day: number; floor: number; best: number; lv: number; power: number; grade: string; agency: number;
  earned: number; died: boolean; agentGold: number; hunterGold: number; stones: number;
}
export interface Campaign {
  log: DayLog[]; deaths: number; agencyDay: Record<number, number>; floorDay: Record<number, number>;
  killers: Record<string, number>; gachaDraws: number; enhances: number; invested: number; dispatches: number; trainings: number;
}

function prep(state: GameState, rng: Rng, c: Campaign) {
  const h = activeHunter(state)!;
  autoPick(h, rng);
  for (let i = 0; i < 5 && h.bag.hp < 3 && h.gold >= 15; i++) buyItem(state, rng, 'hp');
  if (unlocked(state.agent, 'gacha')) {
    while (h.gold >= GACHA_PRICE + 200) { drawGear(state, rng); c.gachaDraws++; }
  }
  if (unlocked(state.agent, 'enhance')) {
    for (const slot of ['weapon', 'armor', 'shield', 'helmet', 'boots', 'ring', 'earring'] as const) {
      for (let k = 0; k < 4 && (h.gear[slot]?.plus ?? 0) < 4; k++) {
        if (enhanceGear(state, rng, slot)) c.enhances++;
        else break;
      }
    }
  }
  const lv = agencyLevel(state.agent);
  for (let i = 0; i < 200; i++) {
    const kinds = ['atk', 'hp', 'def'] as const;
    const kind = kinds.reduce((a, b) => (trainingCost(h, a, state.agent.legacy, lv) <= trainingCost(h, b, state.agent.legacy, lv) ? a : b));
    if (!train(state, kind)) break;
    c.trainings++;
  }
  const keep = unlocked(state.agent, 'gacha') ? GACHA_PRICE + 300 : 300;
  if (h.gold > keep + 100) {
    const r = invest(state, h.gold - keep);
    if (r) c.invested += r.amount;
  }
  const open = lv >= 5 ? 3 : lv >= 2 ? 2 : 1;
  for (let s = 1; s < open; s++) if (!state.slots[s]) hire(state, rng, s);
  state.activeSlot = 0;
  for (let s = 1; s < 3; s++) {
    if (canDispatch(state, s)) {
      dispatch(state, s);
      c.dispatches++;
    }
  }
  state.activeSlot = 0;
}

/** A careful player climbs only while the next floor's suggested level is within reach. */
export let LEVEL_MARGIN = 1;
export function setMargin(m: number) { LEVEL_MARGIN = m; }

export function campaign(seed: number, days: number, cautious = 0.55): Campaign {
  const rng = new Rng(seed);
  const state = newGame(rng);
  const c: Campaign = { killers: {}, log: [], deaths: 0, agencyDay: {}, floorDay: {}, gachaDraws: 0, enhances: 0, invested: 0, dispatches: 0, trainings: 0 };
  for (let day = 0; day < days; day++) {
    if (!state.slots[0]) hire(state, rng, 0);
    state.activeSlot = 0;
    prep(state, rng, c);
    const h = activeHunter(state)!;
    const starts = startFloors(state, h).filter((f) => f <= TOP_FLOOR && recommendedLevel(f) <= h.level + 1);
    if (!starts.length) starts.push(1);
    const run = new TowerRun(h, rng, { startFloor: starts[starts.length - 1], rivals: state.rival.roster, keepSpare: unlocked(state.agent, 'stash') });
    for (let i = 0; i < 8000; i++) {
      if (h.picks > 0) autoPick(h, rng);
      if (run.status === 'onStairs') {
        const healthy = h.hp >= h.maxHp * cautious || (h.bag.hp >= 2 && h.hp >= h.maxHp * 0.35);
        const ready = h.level + LEVEL_MARGIN >= recommendedLevel(run.floor + 1);
        if (healthy && ready && run.floor < TOP_FLOOR) run.climb();
        else run.retreat();
        continue;
      }
      if (run.status === 'choosing') {
        run.resolveChoice(0);
        continue;
      }
      if (run.status === 'trading') {
        run.status = 'playing';
        continue;
      }
      if (run.status !== 'playing') break;
      run.act(playerAction(run));
    }
    let earned = 0;
    const died = run.status === 'dead';
    if (died) {
      settleDeath(state, rng, run.killer ?? '?', run.encounters);
      c.deaths++;
      const k = `${run.killer}@f${run.floor} t${run.floorTurn} Lv${h.level}`.replace(/t\d+/, (m) => (Number(m.slice(1)) > 240 ? 'late' : 'early'));
      c.killers[k.split(' Lv')[0]] = (c.killers[k.split(' Lv')[0]] ?? 0) + 1;
    } else {
      if (run.status === 'playing') run.status = 'returned';
      earned = run.runGold;
      settleReturn(state, rng, run.runGold, run.encounters, false, run.stones);
    }
    const lv = agencyLevel(state.agent);
    for (let l = 2; l <= lv; l++) c.agencyDay[l] ??= day + 1;
    const best = Math.max(0, ...state.slots.filter(Boolean).map((x) => x!.bestFloor), ...state.hallOfFame.map((e) => e.bestFloor));
    for (const f of [5, 10, 15, 20]) if (best >= f) c.floorDay[f] ??= day + 1;
    c.log.push({
      day: day + 1, floor: run.floor, best, lv: h.level, power: combatPower(h), grade: died ? 'X' : gradeIn(state, h), agency: lv,
      earned, died, agentGold: state.agent.gold, hunterGold: h.gold, stones: state.agent.stones ?? 0,
    });
  }
  return c;
}

/** The test bot plus what a careful player does: drinks earlier, uses skills on bosses, leaves before the collapse. */
/** Whether the simulated player steps off red tiles. Off: a player who ignores the warnings. */
export const DODGE = process.env.DODGE !== '0';

export function playerAction(run: TowerRun): Action {
  const h = run.hunter;
  if (h.hp < h.maxHp * 0.45 && h.bag.hp > 0 && run.gate?.rule !== 'sealed') return { type: 'use', item: 'hp' };
  if (h.mp < 4 && h.bag.mp > 0) return { type: 'use', item: 'mp' };
  if (DODGE) {
    const dodge = breakSkill(run) ?? dodgeStep(run);
    if (dodge) return dodge;
  }
  const near = run.monsters.filter((m) => Math.max(Math.abs(m.x - run.pos.x), Math.abs(m.y - run.pos.y)) <= 1 && !m.kind.stalker);
  const big = near.some((m) => m.kind.boss || m.kind.elite || m.hunter);
  const slot = readySlot(run);
  if ((big || near.length >= 2) && slot !== undefined) return { type: 'skill', slot };
  // Head for the stairs before the dungeon collapses, or when a stalker is out.
  if ((run.stalkerIn < 60 || run.stalkers > 0) && !run.bossAlive) {
    const step = stepTowards(run, run.map.stairs);
    if (step) return step;
  }
  return botAction(run, DODGE);
}
