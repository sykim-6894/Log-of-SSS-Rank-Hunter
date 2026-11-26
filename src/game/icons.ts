import type * as Phaser from 'phaser';
import type { GearSlot } from '../core/items';
import { finish, Grid, paint, parse } from './pixel';

/**
 * Item icons in the shared sprite style: 10×10 pixels, outlined and shaded like the
 * heroes and monsters, drawn 3× inside a 40×44 dark tile.
 * In gear icons 'c' is the tier color, so rarer gear shines in its own color.
 */
const GEAR: Record<GearSlot, string[]> = {
  weapon: [
    '........cc',
    '.......cwc',
    '......cwc.',
    '.....cwc..',
    '....cwc...',
    '.g.cwc....',
    '..gwc.....',
    '..bg......',
    '.b..g.....',
    'b.........',
  ],
  shield: [
    '.cccccccc.',
    'cwwwwwwwwc',
    'cwwwccwwwc',
    'cwwwccwwwc',
    'cwccccccwc',
    'cwwwccwwwc',
    '.cwwccwwc.',
    '.cwwwwwwc.',
    '..cwwwwc..',
    '...cccc...',
  ],
  helmet: [
    '...cccc...',
    '..cwwwwc..',
    '.cwwwwwwc.',
    '.cwwwwwwc.',
    'cccccccccc',
    'cw.kk.kkwc',
    'cw......wc',
    'cw......wc',
    '.c......c.',
    '..........',
  ],
  armor: [
    '.cc....cc.',
    'cwwc..cwwc',
    'cwwwccwwwc',
    '.cwwwwwwc.',
    '.cwwccwwc.',
    '.cwwccwwc.',
    '.cwwwwwwc.',
    '.cggggggc.',
    '.cwwwwwwc.',
    '.cccccccc.',
  ],
  boots: [
    '..........',
    '..cccc....',
    '..cwwc....',
    '..cwwc....',
    '..cwwc....',
    '..cwwc....',
    '..cwwwccc.',
    '..cwwwwwwc',
    '..cggggggc',
    '..cccccccc',
  ],
  ring: [
    '....ww....',
    '...wwww...',
    '....ww....',
    '..cccccc..',
    '.cc....cc.',
    '.c......c.',
    '.c......c.',
    '.cc....cc.',
    '..cccccc..',
    '..........',
  ],
  earring: [
    '....cc....',
    '...c..c...',
    '....cc....',
    '....g.....',
    '...yyy....',
    '..yyyyy...',
    '..yyyyy...',
    '...yyy....',
    '....y.....',
    '..........',
  ],
};

const POTION = [
  '...bbbb...',
  '....gg....',
  '....gg....',
  '...gggg...',
  '..gllllg..',
  '.glllllwg.',
  '.gllllllg.',
  '.gllllllg.',
  '..gllllg..',
  '...gggg...',
];

const SCROLL = [
  '..........',
  '.rrrrrrrr.',
  'rppppppppr',
  '.pppppppp.',
  '.pqqqqqpp.',
  '.pppppppp.',
  '.pqqqqpp..',
  '.pppppppp.',
  'rppppppppr',
  '.rrrrrrrr.',
];

export const POTION_COLORS = { hp: 0xc9403a, mp: 0x3d9fb3, guard: 0xe5ae46, escape: 0xe6dac0 } as const;

const cache = new Map<string, Grid>();
function cached(key: string, make: () => Grid) {
  let g = cache.get(key);
  if (!g) cache.set(key, (g = make()));
  return g;
}

function tile(g: Phaser.GameObjects.Graphics, x: number, y: number) {
  g.fillStyle(0x2a211a, 1).fillRect(x, y, 40, 44);
}

/** A gear piece in the tier color; `edge` also draws the tier-colored frame. */
export function paintGear(g: Phaser.GameObjects.Graphics, slot: GearSlot, color: number, x: number, y: number) {
  const grid = cached(`${slot}-${color}`, () =>
    finish(parse(GEAR[slot], { c: color, w: 0xd8d0c0, g: 0xe5ae46, b: 0x7a5a3a, y: color })),
  );
  tile(g, x, y);
  g.lineStyle(2, color, 1).strokeRect(x + 1, y + 1, 38, 42);
  paint(g, grid, x + 2, y + 4, 3);
}

/** A potion bottle in its liquid color, or the rolled-up return scroll. */
export function paintConsumable(g: Phaser.GameObjects.Graphics, kind: keyof typeof POTION_COLORS, x: number, y: number) {
  const grid = cached(`item-${kind}`, () =>
    kind === 'escape'
      ? finish(parse(SCROLL, { r: 0xb9a98a, p: 0xe6dac0, q: 0xc4562a }))
      : finish(parse(POTION, { b: 0x7a5a3a, g: 0xcfd6d8, l: POTION_COLORS[kind], w: 0xffffff })),
  );
  tile(g, x, y);
  paint(g, grid, x + 2, y + 4, 3);
}
