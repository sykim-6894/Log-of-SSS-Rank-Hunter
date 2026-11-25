import { GameState, newGame } from '../core/agency';
import { randomSeed, Rng } from '../core/rng';
import { loadFromSlot, loadGame, saveGame, saveToSlot, SlotSummary, slotSummary } from '../core/save';

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
/** A game was going on when the page opened (the title screen offers to continue it). */
export const hadGame = !!loaded && loaded.agent.named !== false;
export let state: GameState = loaded ?? newGame(rng);
let welcome = !loaded;

/** True once for a brand-new agency: the office shows its welcome. */
export function takeWelcome(): boolean {
  const w = welcome;
  welcome = false;
  return w;
}

export function persist() {
  saveGame(storage(), state);
}

export function resetGame() {
  state = newGame(rng);
  welcome = true;
  persist();
}

export function saveSlot(slot: number) {
  saveToSlot(storage(), slot, state);
}

export function slotInfo(slot: number): SlotSummary | undefined {
  return slotSummary(storage(), slot);
}

/** Replaces the current game with a saved slot. False if the slot is empty or unreadable. */
export function loadSlot(slot: number): boolean {
  const s = loadFromSlot(storage(), slot);
  if (!s) return false;
  state = s;
  welcome = false;
  persist();
  return true;
}

/** Set before reloading the page for a rotation, so the title screen is skipped once. */
const SKIP_TITLE = 'sss-skip-title';
export function skipTitleOnce() {
  try {
    window.sessionStorage.setItem(SKIP_TITLE, '1');
  } catch {
    // Without session storage the title just shows again.
  }
}
export function takeSkipTitle(): boolean {
  try {
    const v = window.sessionStorage.getItem(SKIP_TITLE) === '1';
    window.sessionStorage.removeItem(SKIP_TITLE);
    return v;
  } catch {
    return false;
  }
}

persist();
