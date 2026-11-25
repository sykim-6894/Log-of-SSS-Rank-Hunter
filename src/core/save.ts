import { GameState, HallOfFameEntry, refreshWorldRankers, SLOT_COUNT, worldRankers } from './agency';
import { baseRegen, Grade, Hunter, powerGrade } from './hunter';
import { CLASS_IDS, CLASSES, classSkills } from './classes';
import { emptyBag } from './items';
import { TOP_FLOOR } from './monsters';
import { L } from './lang';

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
    rival: { name: L('적월 길드', 'Red Moon Guild'), roster: [] },
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

/** Hunters from before classes: the look they had becomes their class, with its signature skill. */
export function giveClass(h: Hunter) {
  if (h.cls) return;
  h.cls = CLASS_IDS[(h.look ?? h.id) % CLASS_IDS.length];
  h.look = CLASSES[h.cls].look;
  h.skills = [{ id: classSkills(h.cls)[0], lv: 1 }];
  h.picks = 0;
}

export function loadGame(storage: Storage): GameState | undefined {
  return parseSave(storage.getItem(SAVE_KEY));
}

// ---------- Save slots ----------

/** Separate saves the player makes by hand, on top of the automatic one. */
export const SAVE_SLOTS = 3;
const slotKey = (slot: number) => `sss-hunter-slot-${slot + 1}`;

/** What a slot shows before it is loaded. */
export interface SlotSummary {
  savedAt: string;
  agency: string;
  day: number;
  gold: number;
  /** The strongest hunter under contract, if any. */
  hunter?: { name: string; level: number };
  hunters: number;
}

interface SlotFile {
  summary: SlotSummary;
  data: GameState;
}

export function summarize(state: GameState, now: Date): SlotSummary {
  const ours = state.slots.filter((h): h is Hunter => !!h);
  const best = [...ours].sort((a, b) => b.level - a.level)[0];
  return {
    savedAt: now.toISOString(),
    agency: state.agent.name,
    day: state.day ?? 0,
    gold: state.agent.gold,
    hunter: best ? { name: best.name, level: best.level } : undefined,
    hunters: ours.length,
  };
}

export function saveToSlot(storage: Storage, slot: number, state: GameState, now = new Date()) {
  const file: SlotFile = { summary: summarize(state, now), data: state };
  storage.setItem(slotKey(slot), JSON.stringify(file));
}

export function slotSummary(storage: Storage, slot: number): SlotSummary | undefined {
  try {
    const raw = storage.getItem(slotKey(slot));
    return raw ? (JSON.parse(raw) as SlotFile).summary : undefined;
  } catch {
    return undefined;
  }
}

export function loadFromSlot(storage: Storage, slot: number): GameState | undefined {
  try {
    const raw = storage.getItem(slotKey(slot));
    return raw ? parseSave(JSON.stringify((JSON.parse(raw) as SlotFile).data)) : undefined;
  } catch {
    return undefined;
  }
}

/** Reads any saved game, bringing old versions up to date. */
export function parseSave(raw: string | null): GameState | undefined {
  if (!raw) return undefined;
  try {
    const data = JSON.parse(raw) as GameState | SaveV2 | SaveV1;
    const state = data.version === 1 ? migrateV1(data) : data.version === 2 ? migrateV2(data) : data.version === 3 ? data : undefined;
    if (state) {
      refreshWorldRankers(state);
      // Agency levels came later: older saves count the cut paid so far and keep every feature open.
      if (state.agent.exp === undefined) {
        const paid = [...state.slots.map((h) => h?.totalTribute ?? 0), ...state.hallOfFame.map((e) => e.totalTribute ?? 0)];
        state.agent.exp = paid.reduce((a, b) => a + b, 0);
        state.agent.allOpen = (state.day ?? 0) > 0 || state.hallOfFame.length > 0;
      }
      for (const h of [...state.slots, ...state.rival.roster]) {
        if (!h) continue;
        giveClass(h);
        if (h.hpRegen === undefined || h.mpRegen === undefined) {
          const r = baseRegen(h.cls, h.level);
          h.hpRegen = r.hp;
          h.mpRegen = r.mp;
        }
        // Rivals used to be able to pass the top floor by one.
        h.bestFloor = Math.min(TOP_FLOOR, h.bestFloor);
      }
    }
    return state;
  } catch {
    return undefined;
  }
}
