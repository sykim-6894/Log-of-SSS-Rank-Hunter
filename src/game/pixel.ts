import type * as Phaser from 'phaser';

/**
 * One art style for every sprite in the game. Sprites are written as rows of letters
 * (each letter a color, '.' see-through) and then go through the same finishing pass:
 *  - colors are pulled a little toward one warm key light, so all sprites share a mood,
 *  - every pixel facing up gets a warm highlight, every pixel facing down/right a cool shade,
 *  - a one-pixel dark outline goes around the whole silhouette.
 * Heroes, monsters, chests, stairs and item icons all use it, so they read as one set.
 */

export type Grid = Array<Array<number | undefined>>;

/** The one outline color for every sprite. */
export const OUTLINE = 0x140e0c;
const KEY_LIGHT = 0xffe6b8;
const SHADE = 0x24142c;
const WARM = 0xb08050;

export function mix(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 0xff;
  const m = (s: number) => Math.round(ch(a, s) * (1 - t) + ch(b, s) * t) << s;
  return m(16) | m(8) | m(0);
}

/** Pulls a color toward the shared warm tone and takes the edge off very loud colors. */
export function grade(c: number): number {
  const r = (c >> 16) & 0xff;
  const g = (c >> 8) & 0xff;
  const b = c & 0xff;
  const grey = Math.round(r * 0.3 + g * 0.59 + b * 0.11);
  const desat = mix(c, (grey << 16) | (grey << 8) | grey, 0.12);
  return mix(desat, WARM, 0.1);
}

export const lighten = (c: number, t = 0.28) => mix(c, KEY_LIGHT, t);
export const darken = (c: number, t = 0.34) => mix(c, SHADE, t);

/** Letters to colors. The letter 'k' is always the outline color. */
export function parse(rows: string[], colors: Record<string, number>): Grid {
  const w = Math.max(...rows.map((r) => r.length));
  return rows.map((row) => {
    const out: Array<number | undefined> = [];
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      out.push(ch === 'k' ? OUTLINE : ch !== undefined ? colors[ch] : undefined);
    }
    return out;
  });
}

/**
 * The finishing pass: grade, light from above, shade below and right, then outline.
 * The result is one pixel bigger on every side when outlined.
 */
export function finish(src: Grid, opts: { outline?: boolean; shade?: boolean } = {}): Grid {
  const outline = opts.outline ?? true;
  const shade = opts.shade ?? true;
  const h = src.length;
  const w = src[0]?.length ?? 0;
  const at = (x: number, y: number) => (y >= 0 && y < h && x >= 0 && x < w ? src[y][x] : undefined);
  const pad = outline ? 1 : 0;
  const out: Grid = Array.from({ length: h + pad * 2 }, () => Array<number | undefined>(w + pad * 2).fill(undefined));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = src[y][x];
      if (c === undefined) continue;
      if (c === OUTLINE) {
        out[y + pad][x + pad] = c;
        continue;
      }
      let v = grade(c);
      if (shade) {
        if (at(x, y - 1) === undefined) v = lighten(v);
        else if (at(x, y + 1) === undefined || at(x + 1, y) === undefined) v = darken(v);
      }
      out[y + pad][x + pad] = v;
    }
  }
  if (outline) {
    for (let y = 0; y < out.length; y++) {
      for (let x = 0; x < out[0].length; x++) {
        if (out[y][x] !== undefined) continue;
        const sx = x - pad;
        const sy = y - pad;
        if (at(sx - 1, sy) !== undefined || at(sx + 1, sy) !== undefined || at(sx, sy - 1) !== undefined || at(sx, sy + 1) !== undefined) {
          out[y][x] = OUTLINE;
        }
      }
    }
  }
  return out;
}

/** Paints a grid into a Graphics object, `scale` screen pixels per sprite pixel. */
export function paint(g: Phaser.GameObjects.Graphics, grid: Grid, x: number, y: number, scale: number, alpha = 1) {
  grid.forEach((row, ry) =>
    row.forEach((c, rx) => {
      if (c !== undefined) g.fillStyle(c, alpha).fillRect(x + rx * scale, y + ry * scale, scale, scale);
    }),
  );
}

function hex(c: number) {
  return `#${c.toString(16).padStart(6, '0')}`;
}

export function paintCanvas(ctx: CanvasRenderingContext2D, grid: Grid, x: number, y: number, scale: number) {
  grid.forEach((row, ry) =>
    row.forEach((c, rx) => {
      if (c === undefined) return;
      ctx.fillStyle = hex(c);
      ctx.fillRect(x + rx * scale, y + ry * scale, scale, scale);
    }),
  );
}

/** Makes (once) a texture from a grid, `scale` texture pixels per sprite pixel. */
export function gridTexture(scene: Phaser.Scene, key: string, grid: Grid, scale = 2): string {
  if (scene.textures.exists(key)) return key;
  const w = (grid[0]?.length ?? 1) * scale;
  const h = grid.length * scale;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return key;
  paintCanvas(tex.getContext(), grid, 0, 0, scale);
  tex.refresh();
  return key;
}

/** Soft oval shadow under a standing figure, shared by heroes and monsters. */
export function footShadow(g: Phaser.GameObjects.Graphics, cx: number, by: number, w: number) {
  g.fillStyle(0x000000, 0.32).fillEllipse(cx, by, w, Math.max(4, w * 0.32));
}
