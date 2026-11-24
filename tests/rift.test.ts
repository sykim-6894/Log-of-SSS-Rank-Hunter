import { describe, expect, it } from 'vitest';
import { enterGate, newGame, settleReturn } from '../src/core/agency';
import { createHunter } from '../src/core/hunter';
import { gateClearGold, gateClearStones, gateFloors, gateLevel, RIFT, rollGate, rollRift } from '../src/core/gates';
import { Rng } from '../src/core/rng';
import { TowerRun } from '../src/core/run';

function dayUntilRift(seed: number) {
  const rng = new Rng(seed);
  const state = newGame(rng);
  for (let i = 0; i < 20 && !state.rift; i++) settleReturn(state, rng, 0);
  return { rng, state };
}

describe('the great rift', () => {
  it('opens after a few days, sized above the best hunter, for three days', () => {
    const { state } = dayUntilRift(1);
    const r = state.rift!;
    expect(r).toBeDefined();
    expect(state.day).toBe(RIFT.firstDay);
    expect(r.closesOn - state.day! + 1).toBe(RIFT.days);
    expect(gateFloors(r)).toBe(RIFT.floors);
    expect(gateLevel(r)).toBeGreaterThan(state.slots[0]!.level);
    expect(state.gates).toHaveLength(3); // the rift doesn't take a gate slot
  });

  it('pays far more than a normal gate of the same danger', () => {
    const rift = rollRift(new Rng(2), 1, 20, 0);
    const plain = { ...rollGate(new Rng(2), 2, rift.grade, 0), rule: 'swarm' as const, danger: rift.danger, floors: rift.floors };
    expect(gateClearGold(rift)).toBeGreaterThanOrEqual(gateClearGold(plain) * 2);
    expect(gateClearStones(rift)).toBeGreaterThanOrEqual(gateClearStones(plain) * 2);
  });

  it('left alone, the rival agency closes it and its best hunter grows', () => {
    const { rng, state } = dayUntilRift(3);
    const foe = createHunter(new Rng(9), 90, [], 'sword');
    foe.origin = 'scouted';
    state.rival.roster.push(foe);
    const lv = foe.level;
    const before = state.gateRecord?.rival ?? 0;
    for (let i = 0; i < RIFT.days; i++) settleReturn(state, rng, 0);
    expect(state.rift).toBeUndefined();
    expect(foe.level).toBeGreaterThanOrEqual(lv + RIFT.rivalLevels);
    expect(state.gateRecord!.rival).toBeGreaterThan(before);
    expect(state.nextRiftDay).toBeGreaterThan(state.day!);
  });

  it('one try: entering takes it, clearing it counts for us', () => {
    const { rng, state } = dayUntilRift(4);
    const id = state.rift!.id;
    const g = enterGate(state, id)!;
    expect(g.rift).toBe(true);
    expect(enterGate(state, id)).toBeUndefined();
    const run = new TowerRun(state.slots[0]!, new Rng(4), { gate: g });
    run.enterFloor(gateFloors(g));
    run.monsters = [];
    expect(run.clearGate()).toBe(true);
    const ours = state.gateRecord?.ours ?? 0;
    const r = settleReturn(state, rng, run.runGold, [], true, run.stones);
    expect(state.rift).toBeUndefined();
    expect(state.gateRecord!.ours).toBe(ours + 1);
    expect(r.gateNews.some((n) => n.includes('대균열을 막아냈다'))).toBe(true);
  });

  it('failing inside hands it to the rival', () => {
    const { rng, state } = dayUntilRift(5);
    enterGate(state, state.rift!.id);
    const before = state.gateRecord?.rival ?? 0;
    settleReturn(state, rng, 0, [], false);
    expect(state.rift).toBeUndefined();
    expect(state.gateRecord!.rival).toBe(before + 1);
  });

  it('the boss is the rift lord', () => {
    const g = rollRift(new Rng(6), 1, 10, 0);
    const run = new TowerRun(createHunter(new Rng(6), 1), new Rng(6), { gate: g });
    run.enterFloor(gateFloors(g));
    expect(run.monsters.some((m) => m.kind.name.includes('대균열의 군주'))).toBe(true);
  });
});
