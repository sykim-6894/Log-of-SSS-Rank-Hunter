import { GameState, newGame } from '../core/agency';
import { randomSeed, Rng } from '../core/rng';
import { loadGame, saveGame } from '../core/save';

/** The one game state shared by all scenes, saved to the browser after every change. */
export const rng = new Rng(randomSeed());

function storage() {
  try {
    return window.localStorage;
  } catch {
    const mem = new Map<string, string>();
    return { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  }
}

const loaded = loadGame(storage());
export const isNewAgency = !loaded;
export let state: GameState = loaded ?? newGame(rng);

export function persist() {
  saveGame(storage(), state);
}

export function resetGame() {
  state = newGame(rng);
  persist();
}

persist();
