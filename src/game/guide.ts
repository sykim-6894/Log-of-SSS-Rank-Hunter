import * as Phaser from 'phaser';
import { L } from '../core/lang';
import { GH, GW, PORTRAIT } from './layout';
import { button, INK, PALETTE, text, title } from './ui';

/**
 * Officer Yoon of the Hunter Association walks a new agency through its first game and
 * explains each new thing the first time it turns up. Tips already read are remembered
 * on this device, apart from the save slots.
 */
const KEY = 'sss-hunter-guide';

interface GuideMemory {
  seen: string[];
  off?: boolean;
}

let mem: GuideMemory | undefined;

function memory(): GuideMemory {
  if (mem) return mem;
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    mem = raw ? (JSON.parse(raw) as GuideMemory) : { seen: [] };
    if (!Array.isArray(mem.seen)) mem = { seen: [] };
  } catch {
    mem = { seen: [] };
  }
  return mem;
}

function save() {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(memory()));
  } catch {
    // Private mode: the guide just forgets.
  }
}

/** True if this tip should show now: the guide is on and the tip was not read yet. */
export function tipWanted(id: string): boolean {
  const m = memory();
  return !m.off && !m.seen.includes(id);
}

export function markTip(id: string) {
  const m = memory();
  if (!m.seen.includes(id)) m.seen.push(id);
  save();
}

/** "안내 끄기": no more tips until the guide is reset in the settings. */
export function guideOff() {
  memory().off = true;
  save();
}

export function guideIsOff(): boolean {
  return !!memory().off;
}

/** "안내 다시 보기": every tip shows again. */
export function resetGuide() {
  mem = { seen: [] };
  save();
}

/** What a guide page points at: the button whose label starts with this text, or a screen area. */
export type GuideTarget = string | { x: number; y: number; w: number; h: number };

export interface GuidePage {
  text: string;
  target?: GuideTarget;
}

export const GUIDE_NAME = () => L('윤 주임 · 헌터 협회', 'Officer Yoon · Hunter Association');

/** Officer Yoon: dark bob, glasses, navy suit with a gold association badge. 12×13 pixels. */
const FACE = [
  '...HHHHHH...',
  '..HHHHHHHH..',
  '.HHHHHHHHHH.',
  '.HHSSSSSSHH.',
  '.HSGGSSGGSH.',
  '.HSGeSSGeSH.',
  '.HSSSSSSSSH.',
  '.HHSSmmSSHH.',
  '..H.SSSS.H..',
  '...NNWWNN...',
  '.NNNNWWNNNN.',
  '.NNNNWWNbNN.',
  '.NNNNNNNNNN.',
];
const FACE_COLORS: Record<string, number> = {
  H: 0x2b2230, S: 0xf0c9a0, G: 0x9a8b76, e: 0x2a211a, m: 0xc4562a, N: 0x2f3f66, W: 0xefe5cf, b: 0xe5ae46,
};

export function drawOfficer(g: Phaser.GameObjects.Graphics, x: number, y: number, px = 3) {
  FACE.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = FACE_COLORS[row[i]];
      if (c !== undefined) g.fillStyle(c, 1).fillRect(x + i * px, y + j * px, px, px);
    }
  });
}

/** Screen box of a button: the container holding a text that starts with the label. */
export function findTarget(scene: Phaser.Scene, target: GuideTarget | undefined) {
  if (!target) return undefined;
  if (typeof target !== 'string') return target;
  let found: { x: number; y: number; w: number; h: number } | undefined;
  const walk = (list: Phaser.GameObjects.GameObject[], parent?: Phaser.GameObjects.Container) => {
    for (const o of list) {
      if (found) return;
      if (o instanceof Phaser.GameObjects.Container) walk(o.list, o);
      else if (o instanceof Phaser.GameObjects.Text && o.visible && o.text.startsWith(target)) {
        const b = parent && parent.width > 0 ? parent.getBounds() : o.getBounds();
        found = { x: b.x, y: b.y, w: b.width, h: b.height };
      }
    }
  };
  walk(scene.children.list);
  return found;
}

/** A blinking frame around a target, on top of everything. */
export function pulse(scene: Phaser.Scene, r: { x: number; y: number; w: number; h: number }, depth = 90) {
  const g = scene.add.graphics().setDepth(depth);
  g.lineStyle(3, PALETTE.gold, 1).strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
  g.lineStyle(1, 0xffffff, 0.6).strokeRect(r.x - 7, r.y - 7, r.w + 14, r.h + 14);
  scene.tweens.add({ targets: g, alpha: 0.25, duration: 520, yoyo: true, repeat: -1 });
  return g;
}

export interface GuideOptions {
  /** Called for every object made, so the tower can draw them with its fixed camera. */
  place?: <T extends Phaser.GameObjects.GameObject>(o: T) => T;
  /** After the last page, or after "안내 끄기". */
  onClose?: () => void;
  /** Keep blinking around the last page's target after closing, until the screen changes. */
  keepPulse?: boolean;
}

/**
 * Officer Yoon's speech panel. Pages turn with [다음]; the game waits underneath.
 * The panel sits at the bottom, or at the top when the target is in the lower half.
 */
export function showGuide(scene: Phaser.Scene, pages: GuidePage[], opts: GuideOptions = {}) {
  const place = opts.place ?? (<T extends Phaser.GameObjects.GameObject>(o: T) => o);
  let objs: Phaser.GameObjects.GameObject[] = [];
  const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
    objs.push(place(o));
    return o;
  };
  const clear = () => {
    objs.forEach((o) => o.destroy());
    objs = [];
  };
  let done = false;
  const close = (off: boolean) => {
    if (done) return;
    done = true;
    const last = pages[pages.length - 1];
    clear();
    if (off) guideOff();
    else if (opts.keepPulse) {
      const r = findTarget(scene, last.target);
      if (r) place(pulse(scene, r, 40));
    }
    opts.onClose?.();
  };

  const draw = (i: number) => {
    clear();
    const page = pages[i];
    const r = findTarget(scene, page.target);
    // Catch every touch so nothing underneath reacts while the officer talks.
    const block = add(scene.add.zone(0, 0, GW, GH).setOrigin(0).setDepth(88).setInteractive());
    block.on('pointerup', () => undefined);
    const shade = add(scene.add.graphics().setDepth(88));
    shade.fillStyle(0x000000, 0.35).fillRect(0, 0, GW, GH);
    if (r) {
      // Let the target show through brighter.
      shade.clear();
      shade.fillStyle(0x000000, 0.45);
      shade.fillRect(0, 0, GW, r.y - 6);
      shade.fillRect(0, r.y + r.h + 6, GW, GH - r.y - r.h - 6);
      shade.fillRect(0, r.y - 6, r.x - 6, r.h + 12);
      shade.fillRect(r.x + r.w + 6, r.y - 6, GW - r.x - r.w - 6, r.h + 12);
      add(pulse(scene, r, 89));
    }

    const w = Math.min(GW - 20, 560);
    const x = (GW - w) / 2;
    const face = 12 * 3;
    const tx = x + 16 + face + 14;
    const body = add(text(scene, tx, 0, page.text, PORTRAIT ? 13 : 12, INK.text).setWordWrapWidth(x + w - 16 - tx, true).setDepth(91));
    const h = Math.max(face + 40, 36 + body.height) + 50;
    const lower = r ? r.y + r.h / 2 > GH * 0.55 : false;
    const y = lower ? (PORTRAIT ? 70 : 20) : GH - h - (PORTRAIT ? 24 : 16);

    const g = add(scene.add.graphics().setDepth(90));
    g.fillStyle(PALETTE.shadow, 1).fillRect(x + 4, y + 4, w, h);
    g.fillStyle(PALETTE.panel, 1).fillRect(x, y, w, h);
    g.lineStyle(2, PALETTE.gold, 1).strokeRect(x + 1, y + 1, w - 2, h - 2);
    g.fillStyle(PALETTE.panelDark, 1).fillRect(x + 12, y + 14, face + 8, face + 8);
    drawOfficer(g, x + 16, y + 18);
    add(title(scene, tx, y + 12, GUIDE_NAME(), 13, INK.gold).setDepth(91));
    body.y = y + 34;
    if (pages.length > 1) add(text(scene, x + w - 14, y + 12, `${i + 1}/${pages.length}`, 12, INK.faint).setOrigin(1, 0).setDepth(91));

    const last = i === pages.length - 1;
    const nb = add(button(scene, x + w - 130, y + h - 46, 116, 34, last ? L('알겠어요', 'Got it') : L('다음 ▶', 'Next ▶'), () => (last ? close(false) : draw(i + 1)), { primary: true, size: 13 }).setDepth(92));
    void nb;
    add(button(scene, x + 14, y + h - 42, 96, 28, L('안내 끄기', 'Hide tips'), () => close(true), { size: 11 }).setDepth(92));
  };
  draw(0);
  return { close: () => close(false), objects: () => objs };
}
