/**
 * Which art the game is drawn with: the Dungeon Crawl tile set (default) or the original
 * hand-made pixel art. Chosen in the office settings; the page reloads to switch.
 */
export type Art = 'crawl' | 'pixel';
export const ART_KEY = 'sss-hunter-art';

function read(): Art {
  try {
    return globalThis.localStorage?.getItem(ART_KEY) === 'pixel' ? 'pixel' : 'crawl';
  } catch {
    return 'crawl';
  }
}

export const ART: Art = read();
