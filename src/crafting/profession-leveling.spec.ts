import {
  applyProfessionXpGain,
  PROFESSION_LEVEL_CAP,
  xpForNextProfessionLevel,
} from './profession-leveling';

describe('profession-leveling', () => {
  it('does not level up when xp is below the threshold', () => {
    const result = applyProfessionXpGain({ level: 1, xp: 0 }, 20);
    expect(result.level).toBe(1);
    expect(result.xp).toBe(20);
    expect(result.leveledUp).toBe(false);
  });

  it('levels up and carries remaining xp over', () => {
    const result = applyProfessionXpGain({ level: 1, xp: 40 }, 20);
    expect(result.level).toBe(2);
    expect(result.xp).toBe(10);
    expect(result.leveledUp).toBe(true);
  });

  it('can level up multiple times from one large xp gain', () => {
    const result = applyProfessionXpGain({ level: 1, xp: 0 }, 1000);
    expect(result.level).toBeGreaterThan(2);
    expect(result.leveledUp).toBe(true);
  });

  it('never exceeds the level cap', () => {
    const result = applyProfessionXpGain(
      { level: PROFESSION_LEVEL_CAP, xp: 0 },
      10_000,
    );
    expect(result.level).toBe(PROFESSION_LEVEL_CAP);
    expect(result.xp).toBe(0);
    expect(result.leveledUp).toBe(false);
  });

  it('xpForNextProfessionLevel grows with level', () => {
    expect(xpForNextProfessionLevel(2)).toBeGreaterThan(
      xpForNextProfessionLevel(1),
    );
  });
});
