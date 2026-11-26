import * as Phaser from 'phaser';
import { sfx } from './sfx';
import { RES } from './layout';
import { OUTLINE } from './pixel';

/** Warm ink-and-rust palette: a hunter agency office lit by gate light. */
export const PALETTE = {
  bg: 0x14110f,
  panel: 0x201a16,
  panelDark: 0x17130f,
  line: 0x4a3c30,
  lineLight: 0x6b5847,
  shadow: 0x080605,
  paper: 0xe6dac0,
  paperLine: 0xb9a98a,
  ink: 0x2a211a,
  rust: 0xc4562a,
  rustDark: 0x7a2f16,
  rustLight: 0xe07a45,
  gold: 0xe5ae46,
  hp: 0xc9403a,
  mp: 0x3d9fb3,
  gate: 0x7fd6c9,
  dim: 0x2d2520,
};

export const INK = {
  text: '#efe5cf',
  quiet: '#b0a18a',
  faint: '#8c7d69',
  gold: '#e5ae46',
  rust: '#e07a45',
  red: '#e0574f',
  ink: '#2a211a',
  inkQuiet: '#6f604d',
  stamp: '#b8362b',
  gate: '#7fd6c9',
};

export const FONT = 'Galmuri11, monospace';
export const FONT_TITLE = 'Galmuri14, Galmuri11, monospace';

export function text(scene: Phaser.Scene, x: number, y: number, value: string, size = 12, color = INK.text, bold = false) {
  return scene.add
    .text(x, y, value, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: bold ? 'bold' : 'normal', lineSpacing: 4 })
    .setResolution(RES);
}

export function title(scene: Phaser.Scene, x: number, y: number, value: string, size = 15, color = INK.text) {
  return scene.add.text(x, y, value, { fontFamily: FONT_TITLE, fontSize: `${size}px`, color }).setResolution(RES);
}

/** A rectangle with its four corner pixels cut off, the shape every frame and button shares. */
export function notched(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number, alpha = 1, cut = 2) {
  g.fillStyle(color, alpha).fillRect(x + cut, y, w - cut * 2, h).fillRect(x, y + cut, w, h - cut * 2);
}

/**
 * Panel in the shared pixel style: dark outline with cut corners, a bevel lit from the
 * top-left like the sprites, small corner studs and a hard drop shadow. Optional tab label.
 */
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, label?: string) {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  notched(g, x + 4, y + 4, w, h, PALETTE.shadow, 1, 4);
  notched(g, x, y, w, h, OUTLINE, 1, 4);
  notched(g, x + 2, y + 2, w - 4, h - 4, PALETTE.line, 1, 2);
  g.fillStyle(PALETTE.lineLight, 1).fillRect(x + 4, y + 2, w - 8, 2).fillRect(x + 2, y + 4, 2, h - 8);
  g.fillStyle(PALETTE.panel, 1).fillRect(x + 4, y + 4, w - 8, h - 8);
  g.lineStyle(1, PALETTE.panelDark, 1).strokeRect(x + 6.5, y + 6.5, w - 13, h - 13);
  g.fillStyle(PALETTE.lineLight, 1);
  for (const [sx, sy] of [[x + 8, y + 8], [x + w - 10, y + 8], [x + 8, y + h - 10], [x + w - 10, y + h - 10]]) g.fillRect(sx, sy, 2, 2);
  c.add(g);
  if (label) {
    const t = text(scene, x + 14, y - 7, ` ${label} `, 12, INK.gold, true);
    const bg = scene.add.graphics();
    bg.fillStyle(PALETTE.bg, 1).fillRect(t.x, t.y, t.width, t.height);
    c.add([bg, t]);
  }
  return c;
}

/** Chunky pixel button: a raised slab with a dark lip that presses down on click. */
export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  onClick: () => void,
  opts: { enabled?: boolean; primary?: boolean; size?: number } = {},
) {
  const enabled = opts.enabled ?? true;
  const face = !enabled ? PALETTE.dim : opts.primary ? PALETTE.rust : 0x3a2f27;
  const hover = opts.primary ? PALETTE.rustLight : 0x4b3d32;
  const lip = !enabled ? 0x1d1814 : opts.primary ? PALETTE.rustDark : 0x1f1915;
  const container = scene.add.container(x, y);
  const g = scene.add.graphics();
  const label_ = text(scene, w / 2, (h - 4) / 2, label, opts.size ?? 12, enabled ? (opts.primary ? '#fff4e2' : INK.text) : INK.faint, !!opts.primary)
    .setOrigin(0.5)
    .setAlign('center');
  const draw = (state: 'up' | 'hover' | 'down') => {
    const sink = state === 'down' ? 3 : 0;
    g.clear();
    notched(g, -1, -1 + sink, w + 2, h + 2 - sink, OUTLINE, enabled ? 1 : 0.6);
    notched(g, 0, 4, w, h - 4, lip);
    notched(g, 0, sink, w, h - 4, state === 'hover' && enabled ? hover : face);
    g.fillStyle(0xffffff, enabled ? 0.14 : 0.04).fillRect(2, sink + 2, w - 4, 2);
    g.fillStyle(0x000000, 0.18).fillRect(2, sink + h - 7, w - 4, 1);
    label_.y = (h - 4) / 2 + sink;
  };
  // Long labels (often English) shrink to fit instead of spilling over the edges.
  let size = opts.size ?? 12;
  while (label_.width > w - 8 && size > 9) label_.setFontSize(--size);
  draw('up');
  container.add([g, label_]);
  container.setSize(w, h);
  if (enabled) {
    const zone = scene.add.zone(0, 0, w, h).setOrigin(0).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => draw('hover'));
    zone.on('pointerout', () => draw('up'));
    zone.on('pointerdown', () => draw('down'));
    zone.on('pointerup', () => {
      draw('hover');
      sfx.click();
      onClick();
    });
    container.add(zone);
  }
  return container;
}

/** Segmented gauge, like a pixel health bar. */
export function bar(scene: Phaser.Scene, x: number, y: number, w: number, h: number, ratio: number, color: number) {
  const g = scene.add.graphics();
  const segments = Math.floor(w / 6);
  const filled = Math.round(Math.max(0, Math.min(1, ratio)) * segments);
  g.fillStyle(PALETTE.shadow, 1).fillRect(x - 2, y - 2, segments * 6 + 2, h + 4);
  for (let i = 0; i < segments; i++) {
    g.fillStyle(i < filled ? color : PALETTE.dim, 1).fillRect(x + i * 6, y, 4, h);
  }
  return g;
}

/** Dotted rule for ledgers and cards. */
export function dots(scene: Phaser.Scene, x: number, y: number, w: number, color: number = PALETTE.line) {
  const g = scene.add.graphics();
  g.fillStyle(color, 1);
  for (let i = 0; i < w; i += 4) g.fillRect(x + i, y, 2, 1);
  return g;
}
