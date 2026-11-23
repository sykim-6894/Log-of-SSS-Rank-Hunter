export interface MonsterKind {
  id: string;
  name: string;
  glyph: string;
  hp: number;
  atk: number;
  def: number;
  exp: number;
  gold: number;
  /** Points toward the hall of fame score. */
  score: number;
  boss?: boolean;
}

export const MONSTERS: Record<string, MonsterKind> = {
  goblin: { id: 'goblin', name: '게이트 고블린', glyph: 'g', hp: 8, atk: 4, def: 0, exp: 5, gold: 4, score: 5 },
  wolf: { id: 'wolf', name: '이계 늑대', glyph: 'w', hp: 12, atk: 5, def: 1, exp: 7, gold: 5, score: 8 },
  orc: { id: 'orc', name: '오크 전사', glyph: 'o', hp: 20, atk: 7, def: 2, exp: 12, gold: 9, score: 14 },
  lizard: { id: 'lizard', name: '리자드맨', glyph: 'L', hp: 26, atk: 9, def: 3, exp: 16, gold: 12, score: 20 },
  warden: { id: 'warden', name: '게이트 수문장', glyph: 'W', hp: 60, atk: 10, def: 3, exp: 60, gold: 50, score: 100, boss: true },
  overlord: { id: 'overlord', name: '이계의 군주', glyph: 'K', hp: 120, atk: 14, def: 5, exp: 150, gold: 120, score: 300, boss: true },
};

export const TOP_FLOOR = 10;

/** Which ordinary monsters can appear on a floor. */
export function monsterPool(floor: number): MonsterKind[] {
  if (floor <= 2) return [MONSTERS.goblin, MONSTERS.wolf];
  if (floor <= 5) return [MONSTERS.goblin, MONSTERS.wolf, MONSTERS.orc];
  if (floor <= 8) return [MONSTERS.wolf, MONSTERS.orc, MONSTERS.lizard];
  return [MONSTERS.orc, MONSTERS.lizard];
}

export function bossFor(floor: number): MonsterKind | undefined {
  if (floor === 5) return MONSTERS.warden;
  if (floor === 10) return MONSTERS.overlord;
  return undefined;
}

/** Monsters get 12% stronger per floor above the first. */
export function floorScale(floor: number): number {
  return 1 + 0.12 * (floor - 1);
}
