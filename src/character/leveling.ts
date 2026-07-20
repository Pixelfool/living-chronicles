/**
 * Pure leveling math (game-design.md §4: levels climb quickly at first,
 * slow down toward a real cap rather than an infinite curve). Numbers
 * here are placeholder tuning, not a locked design decision.
 */
export const LEVEL_CAP = 20;

export function xpForNextLevel(level: number): number {
  return level * 100;
}

export function maxHpForCharacter(body: number, level: number): number {
  return 20 + body * 4 + (level - 1) * 5;
}

export interface XpGainResult {
  level: number;
  xp: number;
  maxHp: number;
  leveledUp: boolean;
}

export function applyXpGain(
  character: { level: number; xp: number; body: number },
  xpGained: number,
): XpGainResult {
  if (character.level >= LEVEL_CAP) {
    return {
      level: LEVEL_CAP,
      xp: 0,
      maxHp: maxHpForCharacter(character.body, LEVEL_CAP),
      leveledUp: false,
    };
  }

  let level = character.level;
  let xp = character.xp + xpGained;
  let leveledUp = false;

  while (level < LEVEL_CAP && xp >= xpForNextLevel(level)) {
    xp -= xpForNextLevel(level);
    level += 1;
    leveledUp = true;
  }

  if (level >= LEVEL_CAP) {
    level = LEVEL_CAP;
    xp = 0;
  }

  return { level, xp, maxHp: maxHpForCharacter(character.body, level), leveledUp };
}
