import { describeBattle, resolveBattle, resolveFight } from './combat-resolver';

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
    const a = resolveBattle(
      { hp: 30, body: 5 },
      { hp: 20, attack: 4, defense: 1 },
      rng,
    );
    const b = resolveBattle(
      { hp: 30, body: 5 },
      { hp: 20, attack: 4, defense: 1 },
      rng,
    );
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

  it('equipment attackBonus increases damage dealt', () => {
    const rng = () => 0; // fixed roll so only the bonus varies the outcome
    const unequipped = resolveBattle(
      { hp: 100, body: 5 },
      { hp: 1000, attack: 0, defense: 0 },
      rng,
    );
    const equipped = resolveBattle(
      { hp: 100, body: 5, attackBonus: 10 },
      { hp: 1000, attack: 0, defense: 0 },
      rng,
    );
    expect(equipped.rounds[0].damage).toBeGreaterThan(unequipped.rounds[0].damage);
  });

  it('equipment defenseBonus reduces damage taken', () => {
    const rng = () => 0;
    const unequipped = resolveBattle(
      { hp: 100, body: 5 },
      { hp: 1000, attack: 20, defense: 0 },
      rng,
    );
    const equipped = resolveBattle(
      { hp: 100, body: 5, defenseBonus: 10 },
      { hp: 1000, attack: 20, defense: 0 },
      rng,
    );
    // round index 1 is the monster's first hit against the player
    expect(equipped.rounds[1].damage).toBeLessThan(unequipped.rounds[1].damage);
  });
});

describe('resolveFight', () => {
  it('awards xp and clamps hp to the (possibly new) max on a win', () => {
    const result = resolveFight(
      { hp: 10, body: 20, level: 1, xp: 0 },
      { hp: 1, attack: 0, defense: 0, xpReward: 15 },
    );
    expect(result.outcome.victory).toBe(true);
    expect(result.xpGained).toBe(15);
    expect(result.xpResult.xp).toBe(15);
    expect(result.newHp).toBeLessThanOrEqual(result.xpResult.maxHp);
  });

  it('awards no xp and clamps hp at 1 on a loss', () => {
    const result = resolveFight(
      { hp: 1, body: 1, level: 1, xp: 0 },
      { hp: 1000, attack: 1000, defense: 0, xpReward: 999 },
    );
    expect(result.outcome.victory).toBe(false);
    expect(result.xpGained).toBe(0);
    expect(result.newHp).toBe(1);
  });

  it('fully heals on a level-up', () => {
    const result = resolveFight(
      { hp: 5, body: 20, level: 1, xp: 95 },
      { hp: 1, attack: 0, defense: 0, xpReward: 15 },
    );
    expect(result.xpResult.leveledUp).toBe(true);
    expect(result.newHp).toBe(result.xpResult.maxHp);
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
