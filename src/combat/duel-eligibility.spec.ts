import {
  computeGoldTransfer,
  isOnRepeatAttackCooldown,
  isSwornDuelist,
  levelGapAllowed,
  renounceCompletesAt,
} from './duel-eligibility';

describe('isSwornDuelist', () => {
  const now = new Date('2026-01-01T12:00:00Z');

  it('is false when the oath was never sworn', () => {
    expect(
      isSwornDuelist(
        { duelistOathSwornAt: null, duelistOathRenounceRequestedAt: null },
        now,
      ),
    ).toBe(false);
  });

  it('is true once sworn, with no renouncement pending', () => {
    expect(
      isSwornDuelist(
        {
          duelistOathSwornAt: new Date('2025-01-01'),
          duelistOathRenounceRequestedAt: null,
        },
        now,
      ),
    ).toBe(true);
  });

  it('stays true while a renouncement is still within its cooldown', () => {
    expect(
      isSwornDuelist(
        {
          duelistOathSwornAt: new Date('2025-01-01'),
          duelistOathRenounceRequestedAt: new Date(now.getTime() - 60_000),
        },
        now,
      ),
    ).toBe(true);
  });

  it('becomes false once the renouncement cooldown has fully elapsed', () => {
    expect(
      isSwornDuelist(
        {
          duelistOathSwornAt: new Date('2025-01-01'),
          duelistOathRenounceRequestedAt: new Date(now.getTime() - 999_999_999),
        },
        now,
      ),
    ).toBe(false);
  });
});

describe('renounceCompletesAt', () => {
  it('is strictly after the requested time', () => {
    const requestedAt = new Date('2026-01-01T00:00:00Z');
    expect(renounceCompletesAt(requestedAt).getTime()).toBeGreaterThan(
      requestedAt.getTime(),
    );
  });
});

describe('levelGapAllowed', () => {
  it('allows characters within the level gap', () => {
    expect(levelGapAllowed(5, 7)).toBe(true);
    expect(levelGapAllowed(7, 5)).toBe(true);
  });

  it('rejects characters too far apart in level, in either direction', () => {
    expect(levelGapAllowed(1, 10)).toBe(false);
    expect(levelGapAllowed(10, 1)).toBe(false);
  });
});

describe('computeGoldTransfer', () => {
  it("takes a percentage of the loser's gold", () => {
    expect(computeGoldTransfer(100)).toBe(10);
  });

  it('caps the transfer regardless of how wealthy the loser is', () => {
    expect(computeGoldTransfer(100_000)).toBe(50);
  });

  it('never transfers more than the loser actually has', () => {
    expect(computeGoldTransfer(3)).toBe(0);
  });
});

describe('isOnRepeatAttackCooldown', () => {
  const now = new Date('2026-01-01T12:00:00Z');

  it('is false with no prior duel between the pair', () => {
    expect(isOnRepeatAttackCooldown(null, 'attacker-id', now)).toBe(false);
  });

  it('blocks the winner of a recent duel from attacking the same victim again', () => {
    expect(
      isOnRepeatAttackCooldown(
        {
          winnerCharacterId: 'attacker-id',
          createdAt: new Date(now.getTime() - 60_000),
        },
        'attacker-id',
        now,
      ),
    ).toBe(true);
  });

  it('does not block the loser from seeking revenge themselves', () => {
    expect(
      isOnRepeatAttackCooldown(
        {
          winnerCharacterId: 'other-character-id',
          createdAt: new Date(now.getTime() - 60_000),
        },
        'attacker-id',
        now,
      ),
    ).toBe(false);
  });

  it('does not block a draw from either side attacking again', () => {
    expect(
      isOnRepeatAttackCooldown(
        {
          winnerCharacterId: null,
          createdAt: new Date(now.getTime() - 60_000),
        },
        'attacker-id',
        now,
      ),
    ).toBe(false);
  });

  it('stops blocking once the cooldown has elapsed', () => {
    expect(
      isOnRepeatAttackCooldown(
        {
          winnerCharacterId: 'attacker-id',
          createdAt: new Date(now.getTime() - 999_999_999),
        },
        'attacker-id',
        now,
      ),
    ).toBe(false);
  });
});
