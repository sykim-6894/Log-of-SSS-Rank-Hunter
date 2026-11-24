import { Rng } from './rng';

/** Landscape floors: wide, for PC and sideways phones. */
export const MAP_W = 40;
export const MAP_H = 25;
/** Upright floors for phones held upright: narrow and tall, so the screen is filled. */
export const TALL_MAP_W = 24;
export const TALL_MAP_H = 40;

export function mapWidth(map: FloorMap): number {
  return map.tiles[0].length;
}

export function mapHeight(map: FloorMap): number {
  return map.tiles.length;
}

export enum Tile {
  Wall = 0,
  Floor = 1,
  Stairs = 2,
}

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface FloorMap {
  tiles: Tile[][]; // tiles[y][x]
  rooms: Room[];
  start: Point;
  stairs: Point;
}

export function center(r: Room): Point {
  return { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
}

function overlaps(a: Room, b: Room): boolean {
  // One tile of wall must stay between rooms.
  return a.x - 1 < b.x + b.w && a.x + a.w + 1 > b.x && a.y - 1 < b.y + b.h && a.y + a.h + 1 > b.y;
}

function carveH(tiles: Tile[][], x1: number, x2: number, y: number) {
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) tiles[y][x] = Tile.Floor;
}

function carveV(tiles: Tile[][], y1: number, y2: number, x: number) {
  for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) tiles[y][x] = Tile.Floor;
}

/** Random rooms joined in order by L-shaped corridors, so every room is reachable. */
export function generateFloor(rng: Rng, width = MAP_W, height = MAP_H): FloorMap {
  for (;;) {
    const map = tryGenerate(rng, width, height);
    if (map) return map;
  }
}

function tryGenerate(rng: Rng, width: number, height: number): FloorMap | undefined {
  const tiles: Tile[][] = Array.from({ length: height }, () => Array<Tile>(width).fill(Tile.Wall));
  const rooms: Room[] = [];
  const target = rng.int(6, 9);

  for (let tries = 0; tries < 300 && rooms.length < target; tries++) {
    const w = rng.int(4, 9);
    const h = rng.int(3, 6);
    const room = { x: rng.int(1, width - w - 2), y: rng.int(1, height - h - 2), w, h };
    if (rooms.some((r) => overlaps(r, room))) continue;
    rooms.push(room);
  }

  if (rooms.length < 4) return undefined;

  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) tiles[y][x] = Tile.Floor;
  }

  for (let i = 1; i < rooms.length; i++) {
    const a = center(rooms[i - 1]);
    const b = center(rooms[i]);
    if (rng.chance(0.5)) {
      carveH(tiles, a.x, b.x, a.y);
      carveV(tiles, a.y, b.y, b.x);
    } else {
      carveV(tiles, a.y, b.y, a.x);
      carveH(tiles, a.x, b.x, b.y);
    }
  }

  const start = center(rooms[0]);
  const stairs = center(rooms[rooms.length - 1]);
  tiles[stairs.y][stairs.x] = Tile.Stairs;
  return { tiles, rooms, start, stairs };
}

export function isWalkable(map: FloorMap, x: number, y: number): boolean {
  if (x < 0 || y < 0 || y >= map.tiles.length || x >= map.tiles[0].length) return false;
  return map.tiles[y][x] !== Tile.Wall;
}
