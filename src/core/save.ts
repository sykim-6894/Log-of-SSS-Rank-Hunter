import { GameState } from './agency';

export const SAVE_KEY = 'sss-hunter-save-v1';

export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function saveGame(storage: Storage, state: GameState) {
  storage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function loadGame(storage: Storage): GameState | undefined {
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return undefined;
  try {
    const data = JSON.parse(raw) as GameState;
    if (data.version !== 1) return undefined;
    return data;
  } catch {
    return undefined;
  }
}
