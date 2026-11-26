import { describe, expect, it } from 'vitest';
import { activeHunter, newGame } from '../src/core/agency';
import { ACHIEVEMENTS, checkAchievements, CODEX_IDS, codexCount, codexId, codexKills, recordKills, wearTitle, wornTitle } from '../src/core/codex';
import { MONSTERS } from '../src/core/monsters';
import { Rng } from '../src/core/rng';

describe('monster codex', () => {
  it('lists every monster kind once and maps mid-bosses to their kind', () => {
    expect([...CODEX_IDS].sort()).toEqual(Object.keys(MONSTERS).sort());
    expect(codexId('elite-orc')).toBe('orc');
    expect(codexId('hunter-12')).toBeUndefined();
    expect(codexId('boss')).toBeUndefined();
  });

  it('records first kills and keeps counting', () => {
    const state = newGame(new Rng(1));
    state.day = 4;
    expect(recordKills(state, { goblin: 3, 'elite-goblin': 1, boss: 1, warden: 1, 'hunter-7': 1 })).toEqual(['goblin', 'warden']);
    expect(state.codex!.goblin).toEqual({ kills: 4, day: 4 });
    expect(recordKills(state, { goblin: 2, wolf: 1 })).toEqual(['wolf']);
    expect(state.codex!.goblin.kills).toBe(6);
    expect(codexCount(state)).toBe(3);
    expect(codexKills(state)).toBe(8);
  });
});

describe('achievements', () => {
  it('pays each one once, to the agency', () => {
    const state = newGame(new Rng(2));
    expect(checkAchievements(state)).toEqual([]);
    recordKills(state, { goblin: 1 });
    const gold = state.agent.gold;
    const first = checkAchievements(state);
    expect(first.map((a) => a.id)).toEqual(['kill1']);
    expect(state.agent.gold).toBe(gold + first[0].gold);
    expect(state.agent.stones).toBe(first[0].stones);
    expect(checkAchievements(state)).toEqual([]);
  });

  it('counts our hunters’ records, alive or gone', () => {
    const state = newGame(new Rng(3));
    const h = activeHunter(state)!;
    h.bestFloor = 20;
    h.abyssBest = 10;
    const ids = checkAchievements(state).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['floor10', 'floor20', 'abyss10']));
    expect(ids).not.toContain('abyss30');
    state.hallOfFame.push({ id: 99, name: 'x', grade: 'SSS', level: 60, kills: 0, bestFloor: 20, totalTribute: 0, score: 0, fate: '', abyssBest: 31, legend: true, retired: true });
    expect(checkAchievements(state).map((a) => a.id)).toEqual(expect.arrayContaining(['abyss30', 'gradeS', 'gradeSSS', 'legend']));
  });

  it('ignores rival hunters we finished off', () => {
    const state = newGame(new Rng(4));
    state.hallOfFame.push({ id: 50, name: 'r', grade: 'S', level: 30, kills: 0, bestFloor: 20, totalTribute: 0, score: 0, fate: 'Finished off by our hunter', abyssBest: 40 });
    state.hallOfFame.push({ id: 51, name: 'r2', grade: 'S', level: 30, kills: 0, bestFloor: 20, totalTribute: 0, score: 0, fate: '우리 헌터에게 완전히 쓰러짐', abyssBest: 40 });
    expect(checkAchievements(state)).toEqual([]);
  });

  it('titles come only from achievements reached', () => {
    const state = newGame(new Rng(5));
    expect(wearTitle(state, 'kill1')).toBe(false);
    recordKills(state, { wolf: 1 });
    checkAchievements(state);
    expect(wearTitle(state, 'kill1')).toBe(true);
    expect(wornTitle(state)).toBe(ACHIEVEMENTS[0].title);
    wearTitle(state, undefined);
    expect(wornTitle(state)).toBeUndefined();
  });

  it('each achievement has a unique id, a title and a reward', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.stones + a.gold).toBeGreaterThan(0);
    }
  });
});
