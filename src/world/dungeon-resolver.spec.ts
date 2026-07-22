import { assessPreparedness, resolveBeat } from './dungeon-resolver';

const character = { hp: 20, maxHp: 20, body: 10, level: 3, xp: 0 };

describe('resolveBeat', () => {
  it('resolves a DISCOVERY beat as pure text with no mechanical change', () => {
    const outcome = resolveBeat(
      character,
      { kind: 'DISCOVERY', text: 'The wheel has stopped turning.' },
      null,
    );
    expect(outcome.victory).toBeNull();
    expect(outcome.log).toEqual(['The wheel has stopped turning.']);
    expect(outcome.newHp).toBe(character.hp);
    expect(outcome.xpGained).toBe(0);
    expect(outcome.lootItemId).toBeNull();
  });

  it('resolves a COMBAT beat through the same fight math as ordinary combat', () => {
    const outcome = resolveBeat(
      character,
      { kind: 'COMBAT', monsterId: 'rat' },
      {
        name: 'Sewer Rat',
        hp: 1,
        attack: 0,
        defense: 0,
        xpReward: 15,
        lootTable: [],
      },
    );
    expect(outcome.victory).toBe(true);
    expect(outcome.xpGained).toBe(15);
  });

  it("describes the fight using the monster's actual name, not a placeholder", () => {
    // Regression test: this used to hardcode describeBattle(outcome, 'the
    // dungeon'), producing "You hit the the dungeon" - describeBattle's own
    // template already prepends "the".
    const outcome = resolveBeat(
      character,
      { kind: 'COMBAT', monsterId: 'rat' },
      {
        name: 'Sewer Rat',
        hp: 1,
        attack: 0,
        defense: 0,
        xpReward: 15,
        lootTable: [],
      },
    );
    expect(outcome.log.some((line) => line.includes('Sewer Rat'))).toBe(true);
    expect(outcome.log.some((line) => line.includes('the dungeon'))).toBe(
      false,
    );
  });

  it('prefixes a BOSS beat log with its authored text', () => {
    const outcome = resolveBeat(
      character,
      { kind: 'BOSS', monsterId: 'thing', text: 'Something bigger moved in.' },
      {
        name: 'The Millbrook Thing',
        hp: 1,
        attack: 0,
        defense: 0,
        xpReward: 100,
        lootTable: [],
      },
    );
    expect(outcome.log[0]).toBe('Something bigger moved in.');
  });

  it('throws if a combat beat is resolved with no monster data', () => {
    expect(() =>
      resolveBeat(character, { kind: 'COMBAT', monsterId: 'rat' }, null),
    ).toThrow();
  });
});

describe('assessPreparedness', () => {
  const dungeon = { minLevel: 3 };

  it('reads as CONFIDENT for a full-health, over-leveled, well-stocked character', () => {
    const tier = assessPreparedness(
      { hp: 20, maxHp: 20, level: 6 },
      6,
      3,
      dungeon,
      true,
    );
    expect(tier).toBe('CONFIDENT');
  });

  it('reads as DESPERATE for a badly hurt, under-leveled, empty-handed character', () => {
    const tier = assessPreparedness(
      { hp: 4, maxHp: 20, level: 1 },
      0,
      0,
      dungeon,
      false,
    );
    expect(tier).toBe('DESPERATE');
  });

  it('never returns anything outside the closed tier set', () => {
    const tiers = new Set(['CONFIDENT', 'STEADY', 'UNEASY', 'DESPERATE']);
    const tier = assessPreparedness(
      { hp: 10, maxHp: 20, level: 3 },
      2,
      1,
      dungeon,
      false,
    );
    expect(tiers.has(tier)).toBe(true);
  });
});
