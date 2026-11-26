import * as Phaser from 'phaser';
import { CLASSES } from '../core/classes';
import type { Hunter } from '../core/hunter';
import { L } from '../core/lang';
import { crawlKey, hasCrawl } from './crawl';
import { finish, Grid, gridTexture, OUTLINE, paint, parse } from './pixel';

/**
 * Hunter looks: tiny 10×12 pixel figures. Each letter is a color from the look's palette;
 * '.' is see-through. k (outline/eyes) and s (skin) are shared by all looks.
 */
interface Look {
  name: string;
  rows: string[];
  colors: Record<string, number>;
}

const SHARED = { k: OUTLINE, s: 0xe8b98a };

export const LOOKS: Look[] = [
  {
    name: L('검사', 'Swordsman'),
    colors: { h: 0x6b4a2b, a: 0x3d6fa8, g: 0xe5ae46, p: 0x6e5a44, w: 0xd8d8d8 },
    rows: [
      '...hhhh...',
      '..hhhhhh.w',
      '..hksskh.w',
      '...ssss..w',
      '..aaaaaa.w',
      '.aaaaaaaaw',
      '.s.aaaa.s.',
      '...gggg...',
      '...pppp...',
      '...p..p...',
      '...p..p...',
      '..kk..kk..',
    ],
  },
  {
    name: L('마법사', 'Mage'),
    colors: { b: 0x6a4aa8, a: 0x4b3a7a, w: 0xa87a4a, o: 0x7fd6c9 },
    rows: [
      'o...b.....',
      'w..bbb....',
      'w.bbbbb...',
      'wbbbbbbbb.',
      'w.skssk...',
      'w..ssss...',
      'waaaaaaa..',
      'ws.aaaa.s.',
      'w.aaaaaa..',
      'w.aaaaaa..',
      'w.aaaaaa..',
      'w..kk.kk..',
    ],
  },
  {
    name: L('궁수', 'Archer'),
    colors: { b: 0x4f7a3a, a: 0x6b8a4a, w: 0xa87a4a, g: 0x8a5a2b, p: 0x6e5a44 },
    rows: [
      '...bbbb...',
      '..bbbbbb..',
      '..bksskb.w',
      '..bssssb..w',
      '.saaaaaas.w',
      '..aaaaaa..w',
      '..aaaaaa.w',
      '...gggg...',
      '...pppp...',
      '...p..p...',
      '...p..p...',
      '..kk..kk..',
    ],
  },
  {
    name: L('기사', 'Knight'),
    colors: { m: 0x9aa0a8, n: 0x6b7078, c: 0xa8403a, g: 0xe5ae46 },
    rows: [
      '...mmmm...',
      '..mmmmmm..',
      '..mkkkkm..',
      '..nmmmmn..',
      'ccmmmmmmm.',
      'cgcmmmmmm.',
      'ccmmmmmm.s',
      'cc.gggg...',
      '...nnnn...',
      '...n..n...',
      '...n..n...',
      '..kk..kk..',
    ],
  },
];

export const LOOK_W = 10;
export const LOOK_H = 12;

export function lookOf(h: Hunter): number {
  if (h.cls) return CLASSES[h.cls].look;
  return (h.look ?? h.id) % LOOKS.length;
}

const grids = new Map<number, Grid>();

/** The look after the shared finishing pass (shading and outline), so heroes match the monsters. */
export function lookGrid(look: number): Grid {
  const i = look % LOOKS.length;
  let grid = grids.get(i);
  if (!grid) {
    const l = LOOKS[i];
    grid = finish(parse(l.rows, { ...SHARED, ...l.colors }));
    grids.set(i, grid);
  }
  return grid;
}

/**
 * Draws a look into a Graphics object, each pixel `scale` screen pixels wide. The outline
 * sits one pixel outside (x, y), so callers keep their old positions.
 */
export function drawLook(g: Phaser.GameObjects.Graphics, look: number, x: number, y: number, scale: number) {
  paint(g, lookGrid(look), x - scale, y - scale, scale);
}

/**
 * Puts a hero where drawLook would draw it, at the same size: the crawl sprite as an image
 * when that art is loaded, otherwise the pixel figure painted into `g`.
 */
export function placeLook(scene: Phaser.Scene, g: Phaser.GameObjects.Graphics, look: number, x: number, y: number, scale: number) {
  const key = lookTexture(scene, look);
  if (!key.startsWith('crawl-')) return void drawLook(g, look, x, y, scale);
  const side = (LOOK_H + 2) * scale;
  scene.add.image(x + ((LOOK_W + 1) * scale) / 2, y + (LOOK_H + 1) * scale, key).setOrigin(0.5, 1).setDisplaySize(side, side);
}

/** Makes one texture per look (2 screen pixels per pixel) the first time it is needed. */
export function lookTexture(scene: Phaser.Scene, look: number): string {
  if (hasCrawl(scene, `hero-${look % LOOKS.length}`)) return crawlKey(`hero-${look % LOOKS.length}`);
  return gridTexture(scene, `hunter-look-${look % LOOKS.length}`, lookGrid(look), 2);
}
