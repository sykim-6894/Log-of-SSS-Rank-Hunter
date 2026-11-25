import { it } from 'vitest';
import { appendFileSync, writeFileSync } from 'fs';
import { campaign, setMargin } from './campaign';

/**
 * Plays whole campaigns from a new game and writes one compact line per seed:
 * deaths, when each agency level and floor milestone came, and where things stood on a few days.
 * Run: OUT=out.txt DAYS=100 SEEDS=8 npx vitest run sim/run.test.ts --dir sim
 */
const OUT = process.env.OUT ?? 'sim-out.txt';
if (process.env.MARGIN) setMargin(Number(process.env.MARGIN));
it('campaign', { timeout: 900000 }, () => {
  writeFileSync(OUT, '');
  const days = Number(process.env.DAYS ?? 100);
  const seeds = Number(process.env.SEEDS ?? 8);
  const killers: Record<string, number> = {};
  for (let seed = 1; seed <= seeds; seed++) {
    const c = campaign(seed, days);
    for (const [k, v] of Object.entries(c.killers)) killers[k] = (killers[k] ?? 0) + v;
    const at = (d: number) => {
      const x = c.log[d - 1];
      return x ? `d${d}:Lv${x.lv}/f${x.best}/Ag${x.agency}` : '';
    };
    const early = c.log.filter((x) => x.died && x.day <= 30).length;
    appendFileSync(
      OUT,
      `s${seed} deaths ${c.deaths} (d1-30 ${early}) ${[10, 30, 60, 100].map(at).join(' ')} ag ${JSON.stringify(c.agencyDay)} floor ${JSON.stringify(c.floorDay)} gacha ${c.gachaDraws}\n`,
    );
  }
  appendFileSync(OUT, `killers ${JSON.stringify(Object.entries(killers).sort((a, b) => b[1] - a[1]).slice(0, 10))}\n`);
});
