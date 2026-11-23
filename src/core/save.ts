import { GameState, HallOfFameEntry, SLOT_COUNT, worldRankers } from './agency';
import { Grade, Hunter, powerGrade } from './hunter';

export const SAVE_KEY = 'sss-hunter-save-v1';

export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function saveGame(storage: Storage, state: GameState) {
  storage.setItem(SAVE_KEY, JSON.stringify(state));
}

interface SaveV1 {
  version: 1;
  agent: GameState['agent'];
  hunter: Omit<Hunter, 'id' | 'origin' | 'contractGrade' | 'everSSS' | 'rescues' | 'skillPower'>;
  contractGrade: Grade;
  hallOfFame: Array<Omit<HallOfFameEntry, 'id'>>;
  hunterNumber: number;
}

/** Version 1 had one hunter and no rival agency. Keep the player's progress. */
export function migrateV1(v1: SaveV1): GameState {
  let id = 1;
  const hallOfFame = v1.hallOfFame.map((e) => ({ ...e, id: id++ }));
  const hunter: Hunter = {
    ...v1.hunter,
    id: id++,
    origin: 'ours',
    contractGrade: v1.contractGrade,
    everSSS: false,
    rescues: 0,
    skillPower: 1.5,
  };
  hunter.contractGrade = v1.contractGrade ?? powerGrade(hunter);
  const slots: Array<Hunter | null> = Array(SLOT_COUNT).fill(null);
  slots[0] = hunter;
  return {
    version: 2,
    agent: v1.agent,
    slots,
    activeSlot: 0,
    hallOfFame,
    rival: { name: '적월 길드', roster: [] },
    world: worldRankers(),
    nextHunterId: id,
    hunterNumber: v1.hunterNumber,
  };
}

export function loadGame(storage: Storage): GameState | undefined {
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return undefined;
  try {
    const data = JSON.parse(raw) as GameState | SaveV1;
    if (data.version === 1) return migrateV1(data);
    if (data.version === 2) return data;
    return undefined;
  } catch {
    return undefined;
  }
}
