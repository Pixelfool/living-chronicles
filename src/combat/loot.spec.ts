import { rollLoot } from './loot';

describe('rollLoot', () => {
  it('returns null for an empty table', () => {
    expect(rollLoot([])).toBeNull();
  });

  it('returns the item when the roll beats dropChance', () => {
    const result = rollLoot(
      [{ itemId: 'sword', dropChance: 0.5 }],
      () => 0.1,
    );
    expect(result).toBe('sword');
  });

  it('returns null when the roll does not beat dropChance', () => {
    const result = rollLoot(
      [{ itemId: 'sword', dropChance: 0.5 }],
      () => 0.9,
    );
    expect(result).toBeNull();
  });

  it('checks entries in order and stops at the first hit', () => {
    let call = 0;
    const rng = () => {
      call += 1;
      // First entry misses (roll 0.9 >= 0.1), second entry hits (roll 0.05 < 0.5).
      return call === 1 ? 0.9 : 0.05;
    };
    const result = rollLoot(
      [
        { itemId: 'rare', dropChance: 0.1 },
        { itemId: 'common', dropChance: 0.5 },
      ],
      rng,
    );
    expect(result).toBe('common');
  });
});
