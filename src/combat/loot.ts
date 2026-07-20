export interface LootEntry {
  itemId: string;
  dropChance: number;
}

/**
 * Pure, framework-free loot roll: each entry in the table gets its own
 * independent chance, checked in order; the first one that hits drops.
 * Deliberately simple - no weighting, no guaranteed-drop mechanics yet.
 */
export function rollLoot(
  lootTable: LootEntry[],
  rng: () => number = Math.random,
): string | null {
  for (const entry of lootTable) {
    if (rng() < entry.dropChance) {
      return entry.itemId;
    }
  }
  return null;
}
