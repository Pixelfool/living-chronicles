/**
 * Pure, framework-free world event resolution - same family as
 * dungeon-resolver.ts, no Prisma, no content lookups, deterministic given
 * an rng. Two responsibilities, kept deliberately separate
 * (architecture.md §4.13):
 *
 * - assessMood() answers "how does this look right now" - a closed,
 *   named tier and nothing else. It never returns a raw score; turning a
 *   tier into words is content's job (WorldEventDefinition.moodFlavor),
 *   never this function's.
 * - resolveOutcome() answers "what actually happened" once an event's
 *   active window ends. Player contribution (fightScore/supportScore)
 *   shifts the odds toward whichever outcome is favoredByPlayerResponse,
 *   but never removes the world's own independence (M12 design
 *   discussion): a random roll means the same contribution never
 *   guarantees the same branch twice.
 */

/**
 * Known, deliberately deferred (M12 code review): this weights
 * fightScore and supportScore equally, while resolveOutcome() below
 * weights fightScore at 2x. Two independent, untuned formulas over the
 * same two inputs can disagree about how favorable things look - e.g. a
 * score right at this function's threshold (reading as HOLDING) can
 * still carry a real chance of the unfavored outcome in resolveOutcome.
 * Not reconciled now because there's no real play data yet to tune
 * either formula against; revisit both together once there is, rather
 * than guessing at weights a second time.
 */
export type WorldEventMood = 'STRUGGLING' | 'HOLDING';

export function assessMood(
  fightScore: number,
  supportScore: number,
  threshold: number,
): WorldEventMood {
  return fightScore + supportScore >= threshold ? 'HOLDING' : 'STRUGGLING';
}

// Deliberately re-declared rather than imported from content/schemas.ts's
// WorldEventOutcome (unlike dungeon-resolver.ts, which imports
// DungeonBeat/PreparednessTier as types) - flagged in the M12 code review
// as a small consistency gap, not fixed there. Low risk (a rename in
// schemas.ts wouldn't be caught here) but also low cost to leave for a
// future pass rather than touch as part of an unrelated change.
export interface WorldEventOutcomeOption {
  tag: string;
  favoredByPlayerResponse: boolean;
}

/**
 * A weighted lean, not a threshold: a base 40% chance the favored outcome
 * happens regardless of effort (the world's own trajectory), rising with
 * contribution but capped short of certainty. No reliance on array
 * order - the favored outcome is found by its explicit flag, and the
 * remaining weight is split evenly across whichever other outcome(s) are
 * present. The exact weighting is intentionally simple for a first pass;
 * tuning it is exactly the kind of thing real play should inform.
 */
export function resolveOutcome(
  fightScore: number,
  supportScore: number,
  outcomes: WorldEventOutcomeOption[],
  rng: () => number = Math.random,
): string {
  const favored = outcomes.find((outcome) => outcome.favoredByPlayerResponse);
  const rest = outcomes.filter((outcome) => !outcome.favoredByPlayerResponse);
  if (!favored || rest.length === 0) {
    throw new Error(
      'world event outcomes must include exactly one favoredByPlayerResponse outcome and at least one alternative',
    );
  }

  const contribution = fightScore * 2 + supportScore;
  const favoredChance = Math.min(0.9, 0.4 + contribution * 0.02);

  if (rng() < favoredChance) {
    return favored.tag;
  }
  return rest[Math.floor(rng() * rest.length)].tag;
}
