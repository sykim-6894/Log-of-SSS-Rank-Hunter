import { GameState, HallOfFameEntry, refreshWorldRankers, SLOT_COUNT, worldRankers } from './agency';
import { Grade, Hunter, powerGrade } from './hunter';
import { emptyBag } from './items';

export const SAVE_KEY = 'sss-hunter-save-v1';

export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function saveGame(storage: Storage, state: GameState) {
  storage.setItem(SAVE_KEY, JSON.stringify(state));
}

/** Before version 3 a hunter carried a plain potion count instead of a bag and gear. */
type OldHunter = Omit<Hunter, 'bag' | 'gear'> & { potions?: number };

interface SaveV1 {
  version: 1;
  agent: GameState['agent'];
  hunter: Omit<OldHunter, 'id' | 'origin' | 'contractGrade' | 'everSSS' | 'rescues' | 'skillPower'>;
  contractGrade: Grade;
  hallOfFame: Array<Omit<HallOfFameEntry, 'id'>>;
  hunterNumber: number;
}

/** Version 1 had one hunter and no rival agency. Keep the player's progress. */
export function migrateV1(v1: SaveV1): GameState {
  let id = 1;
  const hallOfFame = v1.hallOfFame.map((e) => ({ ...e, id: id++ }));
  const hunter: OldHunter = {
    ...v1.hunter,
    id: id++,
    origin: 'ours',
    contractGrade: v1.contractGrade,
    everSSS: false,
    rescues: 0,
    skillPower: 1.5,
  };
  hunter.contractGrade = v1.contractGrade ?? powerGrade(hunter as Hunter);
  const slots: Array<OldHunter | null> = Array(SLOT_COUNT).fill(null);
  slots[0] = hunter;
  return migrateV2({
    version: 2,
    agent: v1.agent,
    slots,
    activeSlot: 0,
    hallOfFame,
    rival: { name: '적월 길드', roster: [] },
    world: worldRankers(),
    nextHunterId: id,
    hunterNumber: v1.hunterNumber,
  });
}

interface SaveV2 extends Omit<GameState, 'version' | 'slots' | 'rival'> {
  version: 2;
  slots: Array<OldHunter | null>;
  rival: { name: string; roster: OldHunter[] };
}

/** Version 3 added the bag and gear: old potions become health potions. */
function upgradeHunter(old: OldHunter): Hunter {
  const { potions, ...rest } = old;
  return { ...rest, bag: { ...emptyBag(), hp: potions ?? 0 }, gear: {} };
}

export function migrateV2(v2: SaveV2): GameState {
  return {
    ...v2,
    version: 3,
    slots: v2.slots.map((h) => (h ? upgradeHunter(h) : null)),
    rival: { ...v2.rival, roster: v2.rival.roster.map(upgradeHunter) },
  };
}

export function loadGame(storage: Storage): GameState | undefined {
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return undefined;
  try {
    const data = JSON.parse(raw) as GameState | SaveV2 | SaveV1;
    const state = data.version === 1 ? migrateV1(data) : data.version === 2 ? migrateV2(data) : data.version === 3 ? data : undefined;
    if (state) refreshWorldRankers(state);
    return state;
  } catch {
    return undefined;
  }
}
