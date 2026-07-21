import { assessMood, resolveOutcome } from './world-event-resolver';

describe('assessMood', () => {
  it('reads as STRUGGLING below the threshold', () => {
    expect(assessMood(2, 1, 10)).toBe('STRUGGLING');
  });

  it('reads as HOLDING at or above the threshold', () => {
    expect(assessMood(6, 4, 10)).toBe('HOLDING');
    expect(assessMood(20, 0, 10)).toBe('HOLDING');
  });

  it('never returns anything outside the closed tier set', () => {
    const tiers = new Set(['STRUGGLING', 'HOLDING']);
    expect(tiers.has(assessMood(0, 0, 10))).toBe(true);
  });
});

describe('resolveOutcome', () => {
  const outcomes = [
    { tag: 'DEFENDED', favoredByPlayerResponse: true },
    { tag: 'UNOPPOSED', favoredByPlayerResponse: false },
  ];

  it('is not determined purely by array order - the favored tag wins on a low roll regardless of position', () => {
    const reordered = [outcomes[1], outcomes[0]];
    expect(resolveOutcome(0, 0, reordered, () => 0)).toBe('DEFENDED');
  });

  it('never guarantees the favored outcome even with heavy contribution', () => {
    // favoredChance caps at 0.9, so a roll of 0.95 always falls through
    // to the alternative no matter how much the players contributed.
    expect(resolveOutcome(1000, 1000, outcomes, () => 0.95)).toBe('UNOPPOSED');
  });

  it('never guarantees the alternative even with zero contribution', () => {
    // base favoredChance is 0.4 regardless of effort - a low roll still
    // lands on the favored outcome even if nobody did anything.
    expect(resolveOutcome(0, 0, outcomes, () => 0.1)).toBe('DEFENDED');
  });

  it('shifts the odds toward the favored outcome as contribution rises', () => {
    // A roll of 0.5 is below the base 0.4 + contribution lean once
    // contribution is high enough, and above it when contribution is
    // zero - demonstrating contribution genuinely moves the needle.
    expect(resolveOutcome(0, 0, outcomes, () => 0.5)).toBe('UNOPPOSED');
    expect(resolveOutcome(10, 0, outcomes, () => 0.5)).toBe('DEFENDED');
  });

  it('throws if no outcome is favoredByPlayerResponse', () => {
    expect(() =>
      resolveOutcome(
        0,
        0,
        [
          { tag: 'A', favoredByPlayerResponse: false },
          { tag: 'B', favoredByPlayerResponse: false },
        ],
        () => 0,
      ),
    ).toThrow();
  });

  it('throws if there is no alternative to the favored outcome', () => {
    expect(() =>
      resolveOutcome(
        0,
        0,
        [{ tag: 'ONLY', favoredByPlayerResponse: true }],
        () => 0,
      ),
    ).toThrow();
  });
});
