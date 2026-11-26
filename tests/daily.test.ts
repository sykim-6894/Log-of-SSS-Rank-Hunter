import { describe, expect, it } from 'vitest';
import { activeHunter, dailyTriesLeft, newGame, settleDaily, startDaily } from '../src/core/agency';
import { botAction } from '../src/core/bot';
import {
  DAILY_FLOORS, DAILY_RECORD_STONES, DAILY_SPEED_BONUS, DAILY_TRIES, dailyBase, dailyRules, dailyScore, makeDailyRun, scoreStones, settleDailyRecord, todayKey,
} from '../src/core/daily';
import { Rng } from '../src/core/rng';
import { TowerRun } from '../src/core/run';

const DAY = new Date(2026, 10, 26, 9, 0);
const NEXT = new Date(2026, 10, 27, 9, 0);

function opened(seed = 1) {
  const state = newGame(new Rng(seed));
  state.agent.allOpen = true;
  return state;
}

function play(run: TowerRun) {
  for (let i = 0; i < 6000 && run.status !== 'returned' && run.status !== 'dead'; i++) {
    if (run.status === 'onStairs') {
      if (!run.climb()) run.retreat();
      continue;
    }
    if (run.status === 'choosing') run.resolveChoice(2);
    else if (run.status === 'trading') run.leaveMerchant();
    else run.act(botAction(run));
  }
}

describe("today's rift", () => {
  it('the date picks two different rules and the same floors for every try', () => {
    const date = todayKey(DAY);
    expect(date).toBe('2026-11-26');
    const rules = dailyRules(date);
    expect(rules).toHaveLength(2);
    expect(rules[0]).not.toBe(rules[1]);
    expect(dailyRules(date)).toEqual(rules);
    const state = opened();
    const h = activeHunter(state)!;
    const a = new TowerRun(h, new Rng(1), { daily: makeDailyRun(date, 1) });
    const b = new TowerRun(h, new Rng(999), { daily: makeDailyRun(date, 1) });
    expect(a.map.tiles).toEqual(b.map.tiles);
    expect(a.monsters.map((m) => [m.kind.id, m.x, m.y])).toEqual(b.monsters.map((m) => [m.kind.id, m.x, m.y]));
    const other = new TowerRun(h, new Rng(1), { daily: makeDailyRun('2026-11-27', 1) });
    expect(other.map.tiles).not.toEqual(a.map.tiles);
  });

  it('is as dangerous as floors a little below the hunter’s best', () => {
    expect(dailyBase(0)).toBe(1);
    expect(dailyBase(10)).toBe(7);
    expect(dailyBase(20)).toBe(16);
    const run = new TowerRun(activeHunter(opened())!, new Rng(1), { daily: makeDailyRun('2026-11-26', 10) });
    expect(run.danger).toBe(7);
    expect(run.placeShort).toContain(`1/${DAILY_FLOORS}`);
  });

  it('opens at agency Lv.3 and allows a few tries a day', () => {
    const state = newGame(new Rng(2));
    expect(dailyTriesLeft(state, DAY)).toBe(0);
    expect(startDaily(state, DAY)).toBeUndefined();
    state.agent.allOpen = true;
    for (let i = 0; i < DAILY_TRIES; i++) expect(startDaily(state, DAY)).toBeDefined();
    expect(dailyTriesLeft(state, DAY)).toBe(0);
    expect(startDaily(state, DAY)).toBeUndefined();
    expect(dailyTriesLeft(state, NEXT)).toBe(DAILY_TRIES);
    expect(startDaily(state, NEXT)).toBeDefined();
    expect(state.daily!.played).toBe(DAILY_TRIES + 1);
  });

  it('pays stones only for beating the day’s best, plus a bonus for a new record', () => {
    const date = '2026-11-26';
    let { record, result } = settleDailyRecord(undefined, date, 450, 'A');
    expect(result.stones).toBe(scoreStones(450));
    expect(result.record).toBe(false);
    ({ record, result } = settleDailyRecord(record, date, 300, 'B'));
    expect(result.stones).toBe(0);
    expect(record.best).toBe(450);
    ({ record, result } = settleDailyRecord(record, date, 720, 'C'));
    expect(result.stones).toBe(scoreStones(720) - scoreStones(450) + DAILY_RECORD_STONES);
    expect(record.ever).toBe(720);
    expect(record.everBy).toBe('C');
    // A new day starts from nothing but keeps the record.
    ({ record, result } = settleDailyRecord(record, '2026-11-27', 200, 'A'));
    expect(result.stones).toBe(scoreStones(200));
    expect(record.best).toBe(200);
    expect(record.ever).toBe(720);
  });

  it('scores kills and floors; a fall keeps the score but not the income', () => {
    const state = opened(3);
    const h = activeHunter(state)!;
    const daily = startDaily(state, DAY)!;
    const run = new TowerRun(h, new Rng(3), { daily });
    h.hp = 1;
    h.maxHp = 1;
    h.rescues = 1;
    play(run);
    expect(run.status).toBe('returned');
    expect(daily.fell).toBe(true);
    expect(h.hp).toBe(1);
    expect(h.rescues).toBe(1);
    expect(run.runGold).toBe(0);
    const stones = state.agent.stones ?? 0;
    const r = settleDaily(state, daily, run.turn, h.name);
    expect(r.score).toBe(dailyScore(daily, run.turn));
    expect(state.agent.stones).toBe(stones + r.stones);
    expect(state.daily!.bestBy).toBe(r.score > 0 ? h.name : undefined);
  });

  it('a strong hunter can clear all five floors', () => {
    let full = 0;
    for (let d = 1; d <= 6; d++) {
      const state = opened(d);
      const h = activeHunter(state)!;
      h.atk += 40;
      h.def += 15;
      h.maxHp += 400;
      h.hp = h.maxHp;
      const daily = startDaily(state, new Date(2026, 11, d))!;
      const run = new TowerRun(h, new Rng(d), { daily });
      play(run);
      expect(run.status).toBe('returned');
      expect(daily.kills).toBeGreaterThan(5);
      if (daily.cleared === DAILY_FLOORS) {
        full++;
        expect(run.dailyScore).toBe(Math.round(daily.points) + DAILY_FLOORS * 100 + Math.max(0, DAILY_SPEED_BONUS - run.turn));
      }
      // The tower record is untouched by the rift.
      expect(h.bestFloor).toBe(0);
    }
    expect(full).toBeGreaterThan(0);
  });

  it('keeps the rift through a save', () => {
    const state = opened(5);
    const h = activeHunter(state)!;
    const run = new TowerRun(h, new Rng(5), { daily: startDaily(state, DAY)! });
    const back = TowerRun.restore(JSON.parse(JSON.stringify(run.snapshot())), h, new Rng(1))!;
    expect(back.daily).toEqual(run.daily);
    expect(back.placeShort).toBe(run.placeShort);
  });
});
