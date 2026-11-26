import type * as Phaser from 'phaser';
import { darken, finish, Grid, gridTexture, mix, paintCanvas, parse } from './pixel';

/**
 * Dungeon tiles in the same pixel style as the sprites: 12×12 pixels, drawn 2× into one
 * texture with a frame per tile. Walls are seen from a three-quarter view: a wall with
 * floor below shows its brick face, the rest show their dark top.
 */
export const TILESET = 'tileset';
const P = 12; // pixels per tile side
const S = 2; // texture pixels per tile pixel

const FLOOR = 0x3f362e;
const FLOOR_LIGHT = 0x4b4137;
const FLOOR_DARK = 0x2b241e;
const BRICK = 0x6b5643;
const BRICK_LIGHT = 0x8a7258;
const MORTAR = 0x33281f;
const TOP = 0x1d1815;
const TOP_LIGHT = 0x4a3d31;

export type TileFrame =
  | 'floor0' | 'floor1' | 'floor2' | 'floor3'
  | 'wallFront' | 'wallFront2' | 'wallTop'
  | 'stairsOpen' | 'stairsShut' | 'shadowN' | 'shadowW'
  | 'rimN' | 'rimE' | 'rimW';

function blank(): Grid {
  return Array.from({ length: P }, () => Array<number | undefined>(P).fill(undefined));
}

/** A small seeded random, so the tiles look the same on every device. */
function rand(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** Flagstones: mortar on the bottom and right edge (so tiles join up), a split, lit top edges, specks. */
function floor(variant: number): Grid {
  const g = blank();
  const r = rand(variant * 977 + 13);
  // Most tiles are one big slab; one variant is split into two.
  const split = variant === 2 ? 5 : -9;
  for (let y = 0; y < P; y++) {
    for (let x = 0; x < P; x++) {
      let c = FLOOR;
      const mortar = y === P - 1 || x === P - 1 || y === split;
      const lit = y === 0 || x === 0 || y === split + 1;
      if (mortar) c = FLOOR_DARK;
      else if (lit) c = FLOOR_LIGHT;
      g[y][x] = c;
    }
  }
  for (let i = 0; i < 3; i++) {
    const x = 1 + Math.floor(r() * (P - 3));
    const y = 1 + Math.floor(r() * (P - 3));
    if (g[y][x] === FLOOR) g[y][x] = r() < 0.5 ? FLOOR_DARK : mix(FLOOR, FLOOR_LIGHT, 0.6);
  }
  if (variant === 3) {
    // A thin crack.
    for (const [x, y] of [[3, 2], [4, 3], [4, 4], [5, 5], [5, 6]]) g[y][x] = FLOOR_DARK;
  }
  return g;
}

/** Brick face with a lit cap on top and a dark foot where it meets the floor. */
function wallFront(alt: boolean): Grid {
  const g = blank();
  for (let y = 0; y < P; y++) {
    for (let x = 0; x < P; x++) {
      let c = BRICK;
      if (y <= 1) c = y === 0 ? TOP_LIGHT : TOP;
      else if (y === P - 1) c = MORTAR;
      else {
        const row = Math.floor((y - 2) / 3);
        const off = (row + (alt ? 1 : 0)) % 2 === 0 ? 0 : 3;
        const inRow = (y - 2) % 3;
        if (inRow === 2 || (x + off) % 6 === 5) c = MORTAR;
        else if (inRow === 0) c = BRICK_LIGHT;
      }
      g[y][x] = c;
    }
  }
  return g;
}

/** The dark top of a wall, with faint stone seams. */
function wallTop(): Grid {
  const g = blank();
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) g[y][x] = TOP;
  return g;
}

/** Steps leading up, gold-edged when the way is open. */
function stairs(open: boolean): Grid {
  const g = floor(0);
  const edge = open ? 0xe5ae46 : 0x6b5330;
  const step = open ? 0x8a6a3a : 0x4a3e30;
  for (let i = 0; i < 4; i++) {
    const y0 = 8 - i * 2;
    const x0 = 2 + i;
    for (let x = x0; x < P - 2; x++) {
      g[y0][x] = edge;
      g[y0 + 1][x] = step;
      g[y0 + 2] && (g[y0 + 2][x] = darken(step, 0.4));
    }
  }
  return g;
}

/** Ambient shade along an edge that touches a wall (alpha painted separately). */
function shadeGrid(dir: 'N' | 'W'): Grid {
  const g = blank();
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) if ((dir === 'N' ? y : x) < 3) g[y][x] = 0x000000;
  return g;
}

const ORDER: TileFrame[] = [
  'floor0', 'floor1', 'floor2', 'floor3', 'wallFront', 'wallFront2', 'wallTop', 'stairsOpen', 'stairsShut', 'shadowN', 'shadowW', 'rimN', 'rimE', 'rimW',
];

/** A lit edge on a wall top where it meets the floor, so rooms read clearly. */
function rim(dir: 'N' | 'E' | 'W'): Grid {
  const g = blank();
  for (let i = 0; i < P; i++) {
    if (dir === 'N') g[0][i] = TOP_LIGHT;
    if (dir === 'E') g[i][P - 1] = TOP_LIGHT;
    if (dir === 'W') g[i][0] = TOP_LIGHT;
  }
  return g;
}

/** Makes the tileset texture once and returns its key. Frames are named after TileFrame. */
export function tileset(scene: Phaser.Scene): string {
  if (scene.textures.exists(TILESET)) return TILESET;
  const size = P * S;
  const tex = scene.textures.createCanvas(TILESET, size * ORDER.length, size);
  if (!tex) return TILESET;
  const ctx = tex.getContext();
  const grids: Record<TileFrame, Grid> = {
    floor0: floor(0), floor1: floor(1), floor2: floor(2), floor3: floor(3),
    wallFront: wallFront(false), wallFront2: wallFront(true), wallTop: wallTop(),
    stairsOpen: stairs(true), stairsShut: stairs(false), shadowN: shadeGrid('N'), shadowW: shadeGrid('W'),
    rimN: rim('N'), rimE: rim('E'), rimW: rim('W'),
  };
  ORDER.forEach((name, i) => {
    if (name === 'shadowN' || name === 'shadowW') {
      // Soft gradient: darker right at the wall.
      for (let d = 0; d < 3; d++) {
        ctx.fillStyle = `rgba(0,0,0,${[0.42, 0.26, 0.12][d]})`;
        if (name === 'shadowN') ctx.fillRect(i * size, d * S, size, S);
        else ctx.fillRect(i * size + d * S, 0, S, size);
      }
    } else paintCanvas(ctx, grids[name], i * size, 0, S);
    tex.add(name, 0, i * size, 0, size, size);
  });
  tex.refresh();
  return TILESET;
}

// ---- Props that stand on tiles (outlined like the sprites) ----

const CHEST = parse(
  [
    '............',
    '............',
    '............',
    '..wwwwwwww..',
    '.wbbbbbbbbw.',
    '.bbbbggbbbb.',
    '.ddddggdddd.',
    '.bbbbyybbbb.',
    '.bbbbggbbbb.',
    '.bbbbbbbbbb.',
    '.dddddddddd.',
    '............',
  ],
  { w: 0xa8703a, b: 0x8a5a2b, d: 0x5e3b1c, g: 0xe5ae46, y: 0xfff0a0 },
);

const MERCHANT = parse(
  [
    '....hhhh....',
    '...hhhhhh...',
    '..hhkssk.h..',
    '..hhsssshh..',
    '.pphhhhhh...',
    'pppphcchh...',
    'ppppcccccs..',
    'ppppcccc.yy.',
    '.pp.cccc.yy.',
    '....cccc....',
    '....c..c....',
    '...kk..kk...',
  ],
  { h: 0x3d5a3a, s: 0xe8b98a, c: 0x5a7a4a, p: 0x8a6a4a, y: 0xe5ae46 },
);

export function chestTexture(scene: Phaser.Scene) {
  return gridTexture(scene, 'prop-chest', finish(CHEST), 2);
}

export function merchantTexture(scene: Phaser.Scene) {
  return gridTexture(scene, 'prop-merchant', finish(MERCHANT), 2);
}

