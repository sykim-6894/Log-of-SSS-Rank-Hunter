import { describe, expect, it } from 'vitest';
import { AGENCY_NAME_MAX, cleanAgencyName, foundAgency, newGame, randomAgencyName } from '../src/core/agency';
import { Rng } from '../src/core/rng';

describe('naming the agency', () => {
  it('a new game waits for a name', () => {
    expect(newGame(new Rng(1)).agent.named).toBe(false);
  });

  it('the random button gives a different name each press', () => {
    const rng = new Rng(2);
    let name = randomAgencyName(rng);
    for (let i = 0; i < 30; i++) {
      const next = randomAgencyName(rng, [name]);
      expect(next).not.toBe(name);
      expect(next.length).toBeLessThanOrEqual(AGENCY_NAME_MAX);
      name = next;
    }
  });

  it('cleans up what was typed', () => {
    expect(cleanAgencyName('  새벽   헌터스 ')).toBe('새벽 헌터스');
    expect(cleanAgencyName('가'.repeat(20))).toHaveLength(AGENCY_NAME_MAX);
    expect(cleanAgencyName('   ')).toBe('');
  });

  it('founding names the agency; an empty name is refused', () => {
    const rng = new Rng(3);
    const state = newGame(rng);
    expect(foundAgency(state, rng, '  ')).toBe(false);
    expect(state.agent.named).toBe(false);
    expect(foundAgency(state, rng, '테스트 에이전시')).toBe(true);
    expect(state.agent).toMatchObject({ name: '테스트 에이전시', named: true });
  });

  it('the rival agency never has the same name', () => {
    const rng = new Rng(4);
    const state = newGame(rng);
    foundAgency(state, rng, state.rival.name);
    expect(state.rival.name).not.toBe(state.agent.name);
  });
});
