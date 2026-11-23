import * as Phaser from 'phaser';
import type { Hunter } from '../core/hunter';
import { describeGear, GEAR_SLOT_NAMES, GearSlot, MAX_TIER } from '../core/items';
import { INK, PALETTE, text } from './ui';

/** Height of the paper doll drawn by drawPaperDoll. */
export const DOLL_H = 236;

const FIG_W = 96; // middle column with the body
const ROW_H = 58;
const BOX_H = 52;

// Left column top to bottom, then right column. Each slot points at a spot on the body.
const LAYOUT: Array<{ slot: GearSlot; col: 0 | 1; row: number; to: [number, number] }> = [
  { slot: 'helmet', col: 0, row: 0, to: [0, 22] },
  { slot: 'armor', col: 0, row: 1, to: [0, 82] },
  { slot: 'weapon', col: 0, row: 2, to: [-28, 118] },
  { slot: 'boots', col: 0, row: 3, to: [-10, 214] },
  { slot: 'earring', col: 1, row: 0, to: [13, 30] },
  { slot: 'ring', col: 1, row: 1, to: [28, 120] },
  { slot: 'shield', col: 1, row: 2, to: [30, 104] },
];

/** Tier colors, from plain to rare. */
const TIER_COLORS = ['#c9b79a', '#c9b79a', '#7fd6c9', '#7fd6c9', '#e5ae46', '#e5ae46', '#d79bff'];

function fit(t: Phaser.GameObjects.Text, width: number) {
  let v = t.text;
  while (t.width > width && v.length > 1) t.setText(`${(v = v.slice(0, -1))}…`);
  return t;
}

/**
 * The hunter's body with seven gear slots around it: name and bonus in each box,
 * a thin line to where it is worn. Returns everything it created so callers can
 * track or destroy it.
 */
export function drawPaperDoll(scene: Phaser.Scene, x: number, y: number, w: number, h: Hunter) {
  const objs: Phaser.GameObjects.GameObject[] = [];
  const g = scene.add.graphics();
  objs.push(g);
  const boxW = (w - FIG_W - 16) / 2;
  const cx = x + w / 2;

  // Lines first so boxes and body sit on top of them.
  for (const l of LAYOUT) {
    const bx = l.col === 0 ? x + boxW : x + w - boxW;
    const by = y + l.row * ROW_H + BOX_H / 2;
    const worn = !!h.gear[l.slot];
    g.lineStyle(1, worn ? PALETTE.lineLight : PALETTE.line, 1);
    g.lineBetween(bx, by, cx + l.to[0], y + l.to[1]);
    g.fillStyle(worn ? PALETTE.gold : PALETTE.line, 1).fillRect(cx + l.to[0] - 2, y + l.to[1] - 2, 4, 4);
  }

  // Body: a plain pixel silhouette, tinted where gear is worn.
  const body = (slot: GearSlot) => (h.gear[slot] ? 0x6b5847 : 0x3a2f27);
  g.fillStyle(body('helmet'), 1).fillRect(cx - 13, y + 8, 26, 28); // head
  g.fillStyle(0x2a211a, 1).fillRect(cx - 7, y + 20, 4, 4).fillRect(cx + 3, y + 20, 4, 4); // eyes
  g.fillStyle(body('armor'), 1).fillRect(cx - 20, y + 42, 40, 70); // torso
  g.fillStyle(0x3a2f27, 1).fillRect(cx - 32, y + 44, 10, 62).fillRect(cx + 22, y + 44, 10, 62); // arms
  g.fillStyle(0x3a2f27, 1).fillRect(cx - 17, y + 114, 14, 86).fillRect(cx + 3, y + 114, 14, 86); // legs
  g.fillStyle(body('boots'), 1).fillRect(cx - 20, y + 200, 17, 18).fillRect(cx + 3, y + 200, 17, 18); // feet
  if (h.gear.weapon) g.fillStyle(0xb9a98a, 1).fillRect(cx - 30, y + 66, 4, 52); // blade
  if (h.gear.shield) g.fillStyle(0x7a5a3a, 1).fillRect(cx + 24, y + 86, 18, 26);

  for (const l of LAYOUT) {
    const bx = l.col === 0 ? x : x + w - boxW;
    const by = y + l.row * ROW_H;
    const gear = h.gear[l.slot];
    g.fillStyle(PALETTE.shadow, 1).fillRect(bx + 3, by + 3, boxW, BOX_H);
    g.fillStyle(gear ? PALETTE.panel : PALETTE.panelDark, 1).fillRect(bx, by, boxW, BOX_H);
    g.lineStyle(2, gear ? PALETTE.lineLight : PALETTE.line, 1).strokeRect(bx + 1, by + 1, boxW - 2, BOX_H - 2);
    objs.push(text(scene, bx + 8, by + 5, GEAR_SLOT_NAMES[l.slot], 12, INK.faint));
    if (gear) {
      const color = TIER_COLORS[Math.min(MAX_TIER, gear.tier) - 1];
      objs.push(text(scene, bx + boxW - 8, by + 5, `${gear.tier}단계`, 12, color).setOrigin(1, 0));
      objs.push(fit(text(scene, bx + 8, by + 19, gear.name, 12, color, true), boxW - 16));
      objs.push(fit(text(scene, bx + 8, by + 34, describeGear(gear), 12, INK.gate), boxW - 16));
    } else {
      objs.push(text(scene, bx + 8, by + 24, '비어 있음', 12, INK.faint));
    }
  }

  // Bottom-right cell: the total from all gear.
  const tx = x + w - boxW;
  const ty = y + 3 * ROW_H;
  const sum = { atk: 0, def: 0, hp: 0, mp: 0 };
  for (const gear of Object.values(h.gear)) {
    if (!gear) continue;
    sum.atk += gear.atk;
    sum.def += gear.def;
    sum.hp += gear.hp;
    sum.mp += gear.mp;
  }
  objs.push(text(scene, tx + 8, ty + 5, '장비 합계', 12, INK.gold, true));
  objs.push(fit(text(scene, tx + 8, ty + 21, `공격 +${sum.atk} 방어 +${sum.def}`, 12, INK.text), boxW - 12));
  objs.push(fit(text(scene, tx + 8, ty + 36, `체력 +${sum.hp} 마나 +${sum.mp}`, 12, INK.text), boxW - 12));
  return objs;
}
