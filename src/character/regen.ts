/**
 * Pure regen-tick math, kept separate from the cron wiring for
 * testability. Placeholder tuning: full regen over roughly ten ticks.
 */
const HP_REGEN_PERCENT_PER_TICK = 0.1;

export interface RegenerableCharacter {
  hp: number;
  maxHp: number;
  actionPoints: number;
  maxActionPoints: number;
}

export function computeRegenTick(
  character: RegenerableCharacter,
): { hp: number; actionPoints: number } | null {
  const needsHp = character.hp < character.maxHp;
  const needsAp = character.actionPoints < character.maxActionPoints;
  if (!needsHp && !needsAp) {
    return null;
  }

  const hpGain = Math.max(1, Math.ceil(character.maxHp * HP_REGEN_PERCENT_PER_TICK));
  const hp = Math.min(character.maxHp, character.hp + hpGain);
  const actionPoints = Math.min(
    character.maxActionPoints,
    character.actionPoints + 1,
  );

  return { hp, actionPoints };
}
