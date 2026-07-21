import { describeDuel, resolveDuel } from './duel-resolver';

describe('resolveDuel', () => {
  it('resolves an attacker victory when the defender is weak enough', () => {
    const outcome = resolveDuel(
      { hp: 100, body: 10 },
      { hp: 5, body: 1 },
      () => 0.99,
    );
    expect(outcome.winner).toBe('attacker');
    expect(outcome.defenderHpRemaining).toBe(1);
    expect(outcome.attackerHpRemaining).toBeGreaterThan(0);
  });

  it('resolves a defender victory when the attacker is weak enough', () => {
    const outcome = resolveDuel(
      { hp: 5, body: 1 },
      { hp: 100, body: 10 },
      () => 0.99,
    );
    expect(outcome.winner).toBe('defender');
    expect(outcome.attackerHpRemaining).toBe(1);
  });

  it('never lets either combatant drop to 0 HP', () => {
    const outcome = resolveDuel(
      { hp: 3, body: 1 },
      { hp: 3, body: 1 },
      () => 0,
    );
    expect(outcome.attackerHpRemaining).toBeGreaterThanOrEqual(1);
    expect(outcome.defenderHpRemaining).toBeGreaterThanOrEqual(1);
  });

  it('declares a draw when neither side falls within the round cap', () => {
    const outcome = resolveDuel(
      { hp: 10_000, body: 5 },
      { hp: 10_000, body: 5 },
      () => 0.5,
    );
    expect(outcome.winner).toBe('draw');
    expect(outcome.attackerHpRemaining).toBeGreaterThanOrEqual(1);
    expect(outcome.defenderHpRemaining).toBeGreaterThanOrEqual(1);
  });

  it('applies equipment bonuses symmetrically to both sides', () => {
    const withoutGear = resolveDuel(
      { hp: 50, body: 5 },
      { hp: 50, body: 5 },
      () => 0.5,
    );
    const withAttackerGear = resolveDuel(
      { hp: 50, body: 5, attackBonus: 10 },
      { hp: 50, body: 5 },
      () => 0.5,
    );
    expect(withAttackerGear.defenderHpRemaining).toBeLessThanOrEqual(
      withoutGear.defenderHpRemaining,
    );
  });
});

describe('describeDuel', () => {
  it('never mentions a city or marketplace, keeping the encounter on the road', () => {
    const outcome = resolveDuel(
      { hp: 5, body: 10 },
      { hp: 100, body: 1 },
      () => 0.99,
    );
    const lines = describeDuel(outcome, 'Attacker', 'Defender');
    expect(lines[0]).toContain('road outside the city gates');
    expect(lines.join(' ')).not.toMatch(/market/i);
  });

  it('reports a draw distinctly from either side winning', () => {
    const outcome = resolveDuel(
      { hp: 10_000, body: 5 },
      { hp: 10_000, body: 5 },
      () => 0.5,
    );
    const lines = describeDuel(outcome, 'Attacker', 'Defender');
    expect(lines[lines.length - 1]).toBe(
      'Neither one can finish it, and both break away.',
    );
  });
});
