import { it } from 'vitest';
import { writeFileSync, appendFileSync } from 'fs';
import { newGame, activeHunter, hire } from '../src/core/agency';
import { autoPick, CLASS_IDS } from '../src/core/classes';
import { levelUp } from '../src/core/hunter';
import { recommendedLevel } from '../src/core/monsters';
import { Rng } from '../src/core/rng';
import { TowerRun } from '../src/core/run';
import { playerAction } from './campaign';

const OUT = process.env.OUT ?? 'sim-floors.txt';
const GAP = Number(process.env.GAP ?? 0);

/** One floor at the suggested level (no gear, no training): how often it is cleared, and what is left. */
it('floors', { timeout: 900000 }, () => {
  writeFileSync(OUT, `level = recommended + ${GAP}\n`);
  for (let f = 1; f <= 20; f++) {
    const row: string[] = [];
    for (const cls of CLASS_IDS) {
      let cleared = 0;
      let hpLeft = 0;
      let levels = 0;
      let dead = 0;
      const N = 16;
      for (let seed = 1; seed <= N; seed++) {
        const rng = new Rng(seed * 100 + f);
        const state = newGame(rng);
        state.slots[0] = null;
        hire(state, rng, 0, cls);
        const h = activeHunter(state)!;
        while (h.level < recommendedLevel(f) + GAP) levelUp(h);
        autoPick(h, rng);
        h.hp = h.maxHp;
        h.mp = h.maxMp;
        h.bag.hp = 2;
        const lv0 = h.level;
        const run = new TowerRun(h, rng, { startFloor: f, merchantChance: 0, encounterChance: 0 });
        for (let i = 0; i < 3000 && run.status === 'playing'; i++) {
          if (h.picks > 0) autoPick(h, rng);
          run.act(playerAction(run));
          if (run.status === 'choosing') run.resolveChoice(0);
          if (run.status === 'trading') run.status = 'playing';
        }
        if (run.status === 'dead') dead++;
        if (run.status === 'onStairs') {
          cleared++;
          hpLeft += h.hp / h.maxHp;
          levels += h.level - lv0;
        }
      }
      row.push(`${cls}:${Math.round((100 * cleared) / N)}%d${dead}/hp${cleared ? Math.round((100 * hpLeft) / cleared) : 0}/+${cleared ? (levels / cleared).toFixed(1) : 0}lv`);
    }
    appendFileSync(OUT, `f${f} (Lv${recommendedLevel(f) + GAP}) ${row.join('  ')}\n`);
  }
});
