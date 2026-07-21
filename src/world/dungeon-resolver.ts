/**
 * Pure, framework-free dungeon resolution - same family as
 * combat-resolver.ts, no Prisma, no content lookups, fully deterministic
 * given an rng. Two responsibilities, kept deliberately separate
 * (architecture.md §4.13):
 *
 * - resolveBeat() answers "what happens" when a character reaches a beat -
 *   a DISCOVERY beat is pure authored text with no mechanical consequence;
 *   COMBAT/BOSS beats reuse resolveFight() exactly as World's travel
 *   encounters do, so a dungeon fight is, mechanically, just a fight.
 * - assessPreparedness() answers "how does this look for this character" -
 *   a closed, named tier and nothing else. It never returns a score or a
 *   sentence; turning a tier into words is content's job
 *   (Dungeon.preparednessFlavor), never this function's.
 */
import { describeBattle, resolveFight } from '../combat/combat-resolver';
import { rollLoot } from '../combat/loot';
import { DungeonBeat, PreparednessTier } from '../content/schemas';

export interface BeatOutcome {
  kind: DungeonBeat['kind'];
  log: string[];
  victory: boolean | null;
  xpGained: number;
  newHp: number;
  newMaxHp: number;
  newLevel: number;
  newXp: number;
  leveledUp: boolean;
  lootItemId: string | null;
}

export function resolveBeat(
  character: {
    hp: number;
    maxHp: number;
    body: number;
    level: number;
    xp: number;
    attackBonus?: number;
    defenseBonus?: number;
  },
  beat: DungeonBeat,
  monster: {
    hp: number;
    attack: number;
    defense: number;
    xpReward: number;
    lootTable: { itemId: string; dropChance: number }[];
  } | null,
  rng: () => number = Math.random,
): BeatOutcome {
  if (beat.kind === 'DISCOVERY') {
    return {
      kind: 'DISCOVERY',
      log: [beat.text],
      victory: null,
      xpGained: 0,
      newHp: character.hp,
      newMaxHp: character.maxHp,
      newLevel: character.level,
      newXp: character.xp,
      leveledUp: false,
      lootItemId: null,
    };
  }

  if (!monster) {
    throw new Error(`combat beat resolved with no monster data`);
  }

  const { outcome, xpGained, xpResult, newHp } = resolveFight(
    character,
    monster,
    rng,
  );
  const lootItemId = outcome.victory ? rollLoot(monster.lootTable, rng) : null;
  const log = beat.kind === 'BOSS' && beat.text ? [beat.text] : [];

  return {
    kind: beat.kind,
    log: [...log, ...describeBattle(outcome, 'the dungeon')],
    victory: outcome.victory,
    xpGained,
    newHp,
    newMaxHp: xpResult.maxHp,
    newLevel: xpResult.level,
    newXp: xpResult.xp,
    leveledUp: xpResult.leveledUp,
    lootItemId,
  };
}

export function assessPreparedness(
  character: {
    hp: number;
    maxHp: number;
    level: number;
  },
  equipmentBonus: number,
  consumableCount: number,
  dungeon: { minLevel: number },
  hasClearedBefore: boolean,
): PreparednessTier {
  let score = 0;

  const hpRatio = character.maxHp > 0 ? character.hp / character.maxHp : 0;
  if (hpRatio >= 0.9) {
    score += 2;
  } else if (hpRatio >= 0.6) {
    score += 1;
  } else if (hpRatio < 0.3) {
    score -= 1;
  }

  const levelGap = character.level - dungeon.minLevel;
  if (levelGap >= 2) {
    score += 2;
  } else if (levelGap >= 0) {
    score += 1;
  } else {
    score -= 2;
  }

  if (consumableCount >= 2) {
    score += 1;
  }
  if (equipmentBonus >= 4) {
    score += 1;
  }
  if (hasClearedBefore) {
    score += 1;
  }

  if (score >= 4) {
    return 'CONFIDENT';
  }
  if (score >= 2) {
    return 'STEADY';
  }
  if (score >= 0) {
    return 'UNEASY';
  }
  return 'DESPERATE';
}
