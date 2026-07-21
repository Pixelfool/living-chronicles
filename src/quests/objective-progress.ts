/**
 * Pure, framework-free quest objective progress math (M9 design
 * discussion: quest progress is event-driven, so this is the one place
 * that decides whether a domain event advances a given quest's
 * objectives - unit-testable without a database, same pattern as
 * combat-resolver.ts and profession-leveling.ts).
 */
import { QuestObjective } from '../content/schemas';

export type QuestSignal =
  | { kind: 'KILL_MONSTER'; monsterId: string }
  | { kind: 'COLLECT_ITEM'; itemId: string }
  | { kind: 'REACH_CITY'; cityId: string };

/**
 * REACH_CITY objectives have no meaningful "count" in content - reaching
 * the city either has or hasn't happened yet, so its target is fixed at 1.
 */
export function objectiveTarget(objective: QuestObjective): number {
  return objective.kind === 'REACH_CITY' ? 1 : objective.count;
}

function objectiveMatchesSignal(
  objective: QuestObjective,
  signal: QuestSignal,
): boolean {
  if (objective.kind !== signal.kind) {
    return false;
  }
  switch (objective.kind) {
    case 'KILL_MONSTER':
      return (
        objective.monsterId === (signal as { monsterId: string }).monsterId
      );
    case 'COLLECT_ITEM':
      return objective.itemId === (signal as { itemId: string }).itemId;
    case 'REACH_CITY':
      return objective.cityId === (signal as { cityId: string }).cityId;
  }
}

export interface AdvanceProgressResult {
  progress: number[];
  changed: boolean;
}

/**
 * Applies one domain-event-derived signal to a quest's current progress.
 * Every objective that matches the signal advances by one, capped at its
 * target - a quest can have more than one objective matching the same
 * signal kind (not in current content, but not disallowed either).
 */
export function advanceProgress(
  objectives: QuestObjective[],
  progress: number[],
  signal: QuestSignal,
): AdvanceProgressResult {
  let changed = false;
  const next = objectives.map((objective, index) => {
    const current = progress[index] ?? 0;
    const target = objectiveTarget(objective);
    if (current >= target || !objectiveMatchesSignal(objective, signal)) {
      return current;
    }
    changed = true;
    return Math.min(target, current + 1);
  });
  return { progress: next, changed };
}

export function isQuestComplete(
  objectives: QuestObjective[],
  progress: number[],
): boolean {
  return objectives.every(
    (objective, index) => (progress[index] ?? 0) >= objectiveTarget(objective),
  );
}
