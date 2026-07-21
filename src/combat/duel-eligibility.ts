/**
 * Pure eligibility rules for dueling (M10 design discussion): whether a
 * character currently counts as a sworn duelist, whether two characters
 * are close enough in level to fight, how much gold changes hands, and
 * whether a specific attacker is on cooldown against a specific
 * defender. Kept framework/DB-free so the rules themselves are testable
 * without a database, same pattern as objective-progress.ts.
 */

// Placeholder tuning, not a locked design decision (same caveat as
// leveling.ts's LEVEL_CAP) - the same window doubles as how long a
// defeated character is protected from being re-attacked by that
// specific opponent (M10 design discussion: pairwise, not a blanket
// shield from everyone).
const RENOUNCE_COOLDOWN_MS = 15 * 60 * 1000;
const REPEAT_ATTACK_COOLDOWN_MS = RENOUNCE_COOLDOWN_MS;
const MAX_LEVEL_GAP = 3;
const GOLD_TRANSFER_PERCENT = 0.1;
const GOLD_TRANSFER_CAP = 50;

export interface OathState {
  duelistOathSwornAt: Date | null;
  duelistOathRenounceRequestedAt: Date | null;
}

/**
 * True while a character counts as a sworn duelist - false if they've
 * never sworn, or if a requested renouncement's cooldown has fully
 * elapsed. Deliberately derived rather than a maintained boolean, the
 * same way a quest's completeness is derived from its objective
 * progress - nothing needs to actively flip this the moment the
 * cooldown lapses.
 */
export function isSwornDuelist(state: OathState, now: Date): boolean {
  if (!state.duelistOathSwornAt) {
    return false;
  }
  if (!state.duelistOathRenounceRequestedAt) {
    return true;
  }
  return (
    now.getTime() <
    renounceCompletesAt(state.duelistOathRenounceRequestedAt).getTime()
  );
}

export function renounceCompletesAt(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + RENOUNCE_COOLDOWN_MS);
}

export function levelGapAllowed(
  attackerLevel: number,
  defenderLevel: number,
): boolean {
  return Math.abs(attackerLevel - defenderLevel) <= MAX_LEVEL_GAP;
}

export function computeGoldTransfer(loserGold: number): number {
  return Math.min(
    GOLD_TRANSFER_CAP,
    Math.floor(loserGold * GOLD_TRANSFER_PERCENT),
  );
}

/**
 * True if `attackerCharacterId` most recently beat `defenderCharacterId`
 * (the other side of the pair) in a duel within the repeat-attack
 * cooldown window - the pairwise protection a defeated character gets
 * against being farmed by the same opponent again (M10 design
 * discussion: scoped to this specific pair, derived from the duel log,
 * not a blanket shield from everyone and not a separate stored field).
 * The loser is free to seek revenge themselves; only the winner is
 * blocked from re-targeting the same victim again so soon.
 */
export function isOnRepeatAttackCooldown(
  mostRecentDuelBetweenPair: {
    winnerCharacterId: string | null;
    createdAt: Date;
  } | null,
  attackerCharacterId: string,
  now: Date,
): boolean {
  if (
    !mostRecentDuelBetweenPair ||
    mostRecentDuelBetweenPair.winnerCharacterId !== attackerCharacterId
  ) {
    return false;
  }
  const cooldownEndsAt =
    mostRecentDuelBetweenPair.createdAt.getTime() + REPEAT_ATTACK_COOLDOWN_MS;
  return now.getTime() < cooldownEndsAt;
}
