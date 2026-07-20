/**
 * Pure, framework-free combat resolution (game-design.md §5: fast, legible
 * turns; a short readable account of what happened). Deliberately simple —
 * combat exists to feed the rest of the game, not to be a deep system in
 * its own right.
 */
const MAX_ROUNDS = 20;

export interface BattleRound {
  attacker: 'player' | 'monster';
  damage: number;
  targetHpAfter: number;
}

export interface BattleOutcome {
  victory: boolean;
  rounds: BattleRound[];
  playerHpRemaining: number;
  monsterHpRemaining: number;
}

export function resolveBattle(
  player: { hp: number; body: number },
  monster: { hp: number; attack: number; defense: number },
  rng: () => number = Math.random,
): BattleOutcome {
  const playerAttack = player.body * 2;
  const playerDefense = Math.floor(player.body / 2);
  const rollD6 = () => Math.floor(rng() * 6) + 1;

  let playerHp = player.hp;
  let monsterHp = monster.hp;
  const rounds: BattleRound[] = [];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const playerDamage = Math.max(1, playerAttack + rollD6() - monster.defense);
    monsterHp = Math.max(0, monsterHp - playerDamage);
    rounds.push({
      attacker: 'player',
      damage: playerDamage,
      targetHpAfter: monsterHp,
    });
    if (monsterHp <= 0) {
      return {
        victory: true,
        rounds,
        playerHpRemaining: playerHp,
        monsterHpRemaining: 0,
      };
    }

    const monsterDamage = Math.max(
      1,
      monster.attack + rollD6() - playerDefense,
    );
    playerHp = Math.max(0, playerHp - monsterDamage);
    rounds.push({
      attacker: 'monster',
      damage: monsterDamage,
      targetHpAfter: playerHp,
    });
    if (playerHp <= 0) {
      // Death is a setback, never an ending (game-design.md §4): clamp
      // at 1 HP rather than letting a fight end the character.
      return {
        victory: false,
        rounds,
        playerHpRemaining: 1,
        monsterHpRemaining: monsterHp,
      };
    }
  }

  // Stalemate: neither side went down within the round cap. Treat it as
  // a narrow escape rather than a loss.
  return {
    victory: false,
    rounds,
    playerHpRemaining: Math.max(playerHp, 1),
    monsterHpRemaining: monsterHp,
  };
}

export function describeBattle(
  outcome: BattleOutcome,
  monsterName: string,
): string[] {
  const lines = outcome.rounds.map((round) =>
    round.attacker === 'player'
      ? `You hit the ${monsterName} for ${round.damage} damage. (${round.targetHpAfter} HP left)`
      : `The ${monsterName} hits you for ${round.damage} damage. (${round.targetHpAfter} HP left)`,
  );

  if (outcome.victory) {
    lines.push(`You defeated the ${monsterName}!`);
  } else if (outcome.playerHpRemaining <= 1 && outcome.monsterHpRemaining > 0) {
    lines.push(`You were beaten badly by the ${monsterName} and stumble away.`);
  } else {
    lines.push(`The fight drags on too long and you break away.`);
  }

  return lines;
}
