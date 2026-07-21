/**
 * Pure, framework-free duel resolution - the PvP counterpart to
 * combat-resolver.ts's resolveBattle, kept as its own file rather than a
 * refactor of that (working, tested) resolver (M10 design discussion:
 * lower risk than reshaping NPC combat under this milestone, and it
 * keeps a future change to one from silently affecting the other). Both
 * sides here are real characters, so both get the same attack/defense
 * formula - unlike NPC combat, where only the player side is derived
 * from body/gear and the monster side is flat content data.
 */
const MAX_ROUNDS = 20;

export interface DuelCombatant {
  hp: number;
  body: number;
  attackBonus?: number;
  defenseBonus?: number;
}

export interface DuelRound {
  side: 'attacker' | 'defender';
  damage: number;
  targetHpAfter: number;
}

export interface DuelOutcome {
  winner: 'attacker' | 'defender' | 'draw';
  rounds: DuelRound[];
  attackerHpRemaining: number;
  defenderHpRemaining: number;
}

export function resolveDuel(
  attacker: DuelCombatant,
  defender: DuelCombatant,
  rng: () => number = Math.random,
): DuelOutcome {
  const attackerAttack = attacker.body * 2 + (attacker.attackBonus ?? 0);
  const attackerDefense =
    Math.floor(attacker.body / 2) + (attacker.defenseBonus ?? 0);
  const defenderAttack = defender.body * 2 + (defender.attackBonus ?? 0);
  const defenderDefense =
    Math.floor(defender.body / 2) + (defender.defenseBonus ?? 0);
  const rollD6 = () => Math.floor(rng() * 6) + 1;

  let attackerHp = attacker.hp;
  let defenderHp = defender.hp;
  const rounds: DuelRound[] = [];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const attackerDamage = Math.max(
      1,
      attackerAttack + rollD6() - defenderDefense,
    );
    defenderHp = Math.max(0, defenderHp - attackerDamage);
    rounds.push({
      side: 'attacker',
      damage: attackerDamage,
      targetHpAfter: defenderHp,
    });
    if (defenderHp <= 0) {
      return {
        winner: 'attacker',
        rounds,
        attackerHpRemaining: attackerHp,
        // Death is a setback, never an ending (game-design.md §4) - the
        // loser walks away at 1 HP, same as an NPC fight, not 0.
        defenderHpRemaining: 1,
      };
    }

    const defenderDamage = Math.max(
      1,
      defenderAttack + rollD6() - attackerDefense,
    );
    attackerHp = Math.max(0, attackerHp - defenderDamage);
    rounds.push({
      side: 'defender',
      damage: defenderDamage,
      targetHpAfter: attackerHp,
    });
    if (attackerHp <= 0) {
      return {
        winner: 'defender',
        rounds,
        attackerHpRemaining: 1,
        defenderHpRemaining: defenderHp,
      };
    }
  }

  // Stalemate: neither side went down within the round cap. A draw, not a
  // loss for either side (M10 design discussion: no arbitrary tie-breaker
  // - nobody's gold or repeat-attack cooldown is affected by a draw).
  return {
    winner: 'draw',
    rounds,
    attackerHpRemaining: Math.max(attackerHp, 1),
    defenderHpRemaining: Math.max(defenderHp, 1),
  };
}

/**
 * Deliberately places the encounter outside the city, on the road,
 * rather than naming wherever the character's account actually happens
 * to be standing - duels are location-independent by design (M10 design
 * discussion: no persisted "current region" state exists to check
 * against), but the narrative should still preserve cities reading as
 * calm, safe hubs rather than places duels visibly happen.
 */
export function describeDuel(
  outcome: DuelOutcome,
  attackerName: string,
  defenderName: string,
): string[] {
  const lines = [
    `${attackerName} catches ${defenderName} on the road outside the city gates.`,
  ];
  lines.push(
    ...outcome.rounds.map((round) =>
      round.side === 'attacker'
        ? `${attackerName} strikes ${defenderName} for ${round.damage} damage. (${round.targetHpAfter} HP left)`
        : `${defenderName} strikes back for ${round.damage} damage. (${round.targetHpAfter} HP left)`,
    ),
  );

  if (outcome.winner === 'attacker') {
    lines.push(`${defenderName} is beaten and withdraws.`);
  } else if (outcome.winner === 'defender') {
    lines.push(`${attackerName} is beaten back and withdraws.`);
  } else {
    lines.push('Neither one can finish it, and both break away.');
  }

  return lines;
}
