import * as Phaser from 'phaser';

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
  quiet: '#9a8b76',
  faint: '#6b5e4f',
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
    .setResolution(1);
}

export function title(scene: Phaser.Scene, x: number, y: number, value: string, size = 15, color = INK.text) {
  return scene.add.text(x, y, value, { fontFamily: FONT_TITLE, fontSize: `${size}px`, color }).setResolution(1);
}

/** Square panel with a double border and a hard drop shadow. Optional tab label on the top edge. */
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, label?: string) {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  g.fillStyle(PALETTE.shadow, 1).fillRect(x + 4, y + 4, w, h);
  g.fillStyle(PALETTE.panel, 1).fillRect(x, y, w, h);
  g.lineStyle(2, PALETTE.line, 1).strokeRect(x + 1, y + 1, w - 2, h - 2);
  g.lineStyle(1, PALETTE.panelDark, 1).strokeRect(x + 4, y + 4, w - 8, h - 8);
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
    g.fillStyle(lip, 1).fillRect(0, 4, w, h - 4);
    g.fillStyle(state === 'hover' && enabled ? hover : face, 1).fillRect(0, sink, w, h - 4);
    g.fillStyle(0xffffff, enabled ? 0.12 : 0.04).fillRect(2, sink + 2, w - 4, 2);
    label_.y = (h - 4) / 2 + sink;
  };
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
