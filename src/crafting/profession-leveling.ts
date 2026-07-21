/**
 * Pure profession-leveling math (mirrors character/leveling.ts's shape,
 * deliberately not shared with it - professions are a secondary,
 * slower-paced progression track, not the same curve as character level).
 */
export const PROFESSION_LEVEL_CAP = 20;

export function xpForNextProfessionLevel(level: number): number {
  return level * 50;
}

export interface ProfessionXpGainResult {
  level: number;
  xp: number;
  leveledUp: boolean;
}

export function applyProfessionXpGain(
  profession: { level: number; xp: number },
  xpGained: number,
): ProfessionXpGainResult {
  if (profession.level >= PROFESSION_LEVEL_CAP) {
    return { level: PROFESSION_LEVEL_CAP, xp: 0, leveledUp: false };
  }

  let level = profession.level;
  let xp = profession.xp + xpGained;
  let leveledUp = false;

  while (
    level < PROFESSION_LEVEL_CAP &&
    xp >= xpForNextProfessionLevel(level)
  ) {
    xp -= xpForNextProfessionLevel(level);
    level += 1;
    leveledUp = true;
  }

  if (level >= PROFESSION_LEVEL_CAP) {
    level = PROFESSION_LEVEL_CAP;
    xp = 0;
  }

  return { level, xp, leveledUp };
}
