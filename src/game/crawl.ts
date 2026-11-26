import type * as Phaser from 'phaser';
import { ART } from './art';

/**
 * Sprites from the Dungeon Crawl Stone Soup tile set (CC0, public/assets/crawl/LICENSE.txt):
 * 32×32 heroes, monsters, floor, walls and props. Each scene queues them in preload();
 * the art helpers use them when loaded and fall back to the built-in pixel art otherwise.
 */
export const CRAWL_SIZE = 32;

const FILES = [
  'hero-0', 'hero-1', 'hero-2', 'hero-3',
  'goblin', 'archer', 'wolf', 'orc', 'lizard', 'knight', 'shaman', 'beast', 'warden', 'overlord', 'dragon', 'master', 'stalker',
  'floor0', 'floor1', 'floor2', 'floor3', 'floor4', 'floor5', 'floor6', 'floor7',
  'wall0', 'wall1', 'wall2', 'wall3', 'chest', 'stairs', 'merchant',
];

export const crawlKey = (name: string) => `crawl-${name}`;

export function preloadCrawl(scene: Phaser.Scene) {
  if (ART !== 'crawl') return;
  for (const f of FILES) if (!scene.textures.exists(crawlKey(f))) scene.load.image(crawlKey(f), `assets/crawl/${f}.png`);
}

export function hasCrawl(scene: Phaser.Scene, name: string) {
  return scene.textures.exists(crawlKey(name));
}

/** The image behind a loaded crawl texture, for drawing into canvases. */
export function crawlImage(scene: Phaser.Scene, name: string) {
  return scene.textures.get(crawlKey(name)).getSourceImage() as CanvasImageSource;
}
