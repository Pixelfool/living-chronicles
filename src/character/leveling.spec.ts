import { applyXpGain, LEVEL_CAP, maxHpForCharacter, xpForNextLevel } from './leveling';

describe('leveling', () => {
  it('does not level up when xp is below the threshold', () => {
    const result = applyXpGain({ level: 1, xp: 0, body: 5 }, 50);
    expect(result.level).toBe(1);
    expect(result.xp).toBe(50);
    expect(result.leveledUp).toBe(false);
  });

  it('levels up and carries remaining xp over', () => {
    const result = applyXpGain({ level: 1, xp: 90, body: 5 }, 50);
    expect(result.level).toBe(2);
    expect(result.xp).toBe(40);
    expect(result.leveledUp).toBe(true);
    expect(result.maxHp).toBe(maxHpForCharacter(5, 2));
  });

  it('can level up multiple times from one large xp gain', () => {
    const result = applyXpGain({ level: 1, xp: 0, body: 3 }, 1000);
    expect(result.level).toBeGreaterThan(2);
    expect(result.leveledUp).toBe(true);
  });

  it('never exceeds the level cap', () => {
    const result = applyXpGain({ level: LEVEL_CAP, xp: 0, body: 5 }, 10_000);
    expect(result.level).toBe(LEVEL_CAP);
    expect(result.xp).toBe(0);
    expect(result.leveledUp).toBe(false);
  });

  it('xpForNextLevel grows with level', () => {
    expect(xpForNextLevel(2)).toBeGreaterThan(xpForNextLevel(1));
  });
});
