import { computeRegenTick } from './regen';

describe('computeRegenTick', () => {
  it('returns null when already at max hp and action points', () => {
    const result = computeRegenTick({
      hp: 30,
      maxHp: 30,
      actionPoints: 10,
      maxActionPoints: 10,
    });
    expect(result).toBeNull();
  });

  it('regenerates hp and action points without exceeding the max', () => {
    const result = computeRegenTick({
      hp: 25,
      maxHp: 30,
      actionPoints: 8,
      maxActionPoints: 10,
    });
    expect(result).not.toBeNull();
    expect(result?.hp).toBeGreaterThan(25);
    expect(result?.hp).toBeLessThanOrEqual(30);
    expect(result?.actionPoints).toBe(9);
  });

  it('does not overshoot the cap on the final tick', () => {
    const result = computeRegenTick({
      hp: 29,
      maxHp: 30,
      actionPoints: 10,
      maxActionPoints: 10,
    });
    expect(result?.hp).toBe(30);
    expect(result?.actionPoints).toBe(10);
  });
});
