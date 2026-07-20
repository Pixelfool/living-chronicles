import { describeBattle, resolveBattle } from './combat-resolver';

describe('resolveBattle', () => {
  it('the player always wins against a trivially weak monster', () => {
    const outcome = resolveBattle(
      { hp: 100, body: 20 },
      { hp: 1, attack: 0, defense: 0 },
    );
    expect(outcome.victory).toBe(true);
    expect(outcome.monsterHpRemaining).toBe(0);
  });

  it('clamps player HP at 1 instead of letting a fight end the character', () => {
    const outcome = resolveBattle(
      { hp: 1, body: 1 },
      { hp: 1000, attack: 1000, defense: 0 },
    );
    expect(outcome.victory).toBe(false);
    expect(outcome.playerHpRemaining).toBe(1);
  });

  it('is deterministic given a fixed rng', () => {
    const rng = () => 0.5;
    const a = resolveBattle({ hp: 30, body: 5 }, { hp: 20, attack: 4, defense: 1 }, rng);
    const b = resolveBattle({ hp: 30, body: 5 }, { hp: 20, attack: 4, defense: 1 }, rng);
    expect(a).toEqual(b);
  });

  it('never exceeds the round cap', () => {
    const rng = () => 0; // minimum roll every time -> long, grinding fight
    const outcome = resolveBattle(
      { hp: 10_000, body: 1 },
      { hp: 10_000, attack: 1, defense: 100 },
      rng,
    );
    expect(outcome.rounds.length).toBeLessThanOrEqual(40);
  });
});

describe('describeBattle', () => {
  it('produces one line per round plus a summary line', () => {
    const outcome = resolveBattle(
      { hp: 100, body: 20 },
      { hp: 1, attack: 0, defense: 0 },
    );
    const lines = describeBattle(outcome, 'Test Monster');
    expect(lines.length).toBe(outcome.rounds.length + 1);
    expect(lines[lines.length - 1]).toContain('defeated');
  });
});
