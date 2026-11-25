import * as Phaser from 'phaser';
import { CLASSES } from '../core/classes';
import type { Hunter } from '../core/hunter';
import { L } from '../core/lang';

/**
 * Hunter looks: tiny 10×12 pixel figures. Each letter is a color from the look's palette;
 * '.' is see-through. k (outline/eyes) and s (skin) are shared by all looks.
 */
interface Look {
  name: string;
  rows: string[];
  colors: Record<string, number>;
}

const SHARED = { k: 0x1a1410, s: 0xe8b98a };

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

/** Draws a look into a Graphics object, each pixel `scale` screen pixels wide. */
export function drawLook(g: Phaser.GameObjects.Graphics, look: number, x: number, y: number, scale: number) {
  const l = LOOKS[look % LOOKS.length];
  const colors: Record<string, number> = { ...SHARED, ...l.colors };
  l.rows.forEach((row, ry) => {
    for (let rx = 0; rx < Math.min(row.length, LOOK_W + 1); rx++) {
      const c = colors[row[rx]];
      if (c === undefined) continue;
      g.fillStyle(c, 1).fillRect(x + rx * scale, y + ry * scale, scale, scale);
    }
  });
}

/** Makes one texture per look (2 screen pixels per pixel) the first time it is needed. */
export function lookTexture(scene: Phaser.Scene, look: number): string {
  const key = `hunter-look-${look % LOOKS.length}`;
  if (!scene.textures.exists(key)) {
    const g = scene.add.graphics();
    drawLook(g, look, 0, 0, 2);
    g.generateTexture(key, (LOOK_W + 1) * 2, LOOK_H * 2);
    g.destroy();
  }
  return key;
}
