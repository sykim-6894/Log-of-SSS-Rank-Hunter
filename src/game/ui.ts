import * as Phaser from 'phaser';

export const COLORS = {
  bg: 0x0d0f14,
  panel: 0x171b24,
  panelLine: 0x2a3140,
  accent: 0x4f8cff,
  gold: 0xf2c14e,
  danger: 0xe5484d,
  good: 0x46a758,
  mana: 0x5b8def,
  text: '#e8ecf3',
  quiet: '#8a93a6',
};

export const FONT = '"Pretendard", "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

export function text(scene: Phaser.Scene, x: number, y: number, value: string, size = 16, color = COLORS.text, bold = false) {
  return scene.add.text(x, y, value, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color,
    fontStyle: bold ? 'bold' : 'normal',
  });
}

export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number) {
  const g = scene.add.graphics();
  g.fillStyle(COLORS.panel, 1);
  g.fillRoundedRect(x, y, w, h, 10);
  g.lineStyle(1, COLORS.panelLine, 1);
  g.strokeRoundedRect(x, y, w, h, 10);
  return g;
}

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
  const fill = !enabled ? 0x22262f : opts.primary ? COLORS.accent : 0x2b3242;
  const container = scene.add.container(x, y);
  const bg = scene.add.graphics();
  const draw = (hover: boolean) => {
    bg.clear();
    bg.fillStyle(fill, 1);
    if (hover && enabled) bg.fillStyle(opts.primary ? 0x6a9dff : 0x38415a, 1);
    bg.fillRoundedRect(0, 0, w, h, 8);
  };
  draw(false);
  const label_ = text(scene, w / 2, h / 2, label, opts.size ?? 15, enabled ? COLORS.text : '#5b6273', !!opts.primary)
    .setOrigin(0.5)
    .setAlign('center');
  container.add([bg, label_]);
  container.setSize(w, h);
  if (enabled) {
    const zone = scene.add.zone(0, 0, w, h).setOrigin(0).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => draw(true));
    zone.on('pointerout', () => draw(false));
    zone.on('pointerup', onClick);
    container.add(zone);
  }
  return container;
}

export function bar(scene: Phaser.Scene, x: number, y: number, w: number, h: number, ratio: number, color: number) {
  const g = scene.add.graphics();
  g.fillStyle(0x0a0c10, 1);
  g.fillRoundedRect(x, y, w, h, 4);
  g.fillStyle(color, 1);
  g.fillRoundedRect(x, y, Math.max(0, Math.min(1, ratio)) * w, h, 4);
  return g;
}
