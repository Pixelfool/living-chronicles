import { QuestObjective } from '../content/schemas';
import {
  advanceProgress,
  isQuestComplete,
  objectiveTarget,
} from './objective-progress';

describe('objectiveTarget', () => {
  it('uses the objective count for KILL_MONSTER and COLLECT_ITEM', () => {
    expect(
      objectiveTarget({ kind: 'KILL_MONSTER', monsterId: 'rat', count: 3 }),
    ).toBe(3);
    expect(
      objectiveTarget({
        kind: 'COLLECT_ITEM',
        itemId: 'scrap-metal',
        count: 5,
      }),
    ).toBe(5);
  });

  it('is always 1 for REACH_CITY', () => {
    expect(objectiveTarget({ kind: 'REACH_CITY', cityId: 'ashford' })).toBe(1);
  });
});

describe('advanceProgress', () => {
  const objectives: QuestObjective[] = [
    { kind: 'KILL_MONSTER', monsterId: 'bandit', count: 2 },
    { kind: 'COLLECT_ITEM', itemId: 'scrap-metal', count: 3 },
  ];

  it('advances only the objective matching the signal', () => {
    const result = advanceProgress(objectives, [0, 0], {
      kind: 'KILL_MONSTER',
      monsterId: 'bandit',
    });
    expect(result).toEqual({ progress: [1, 0], changed: true });
  });

  it('ignores a signal that matches no objective', () => {
    const result = advanceProgress(objectives, [0, 0], {
      kind: 'KILL_MONSTER',
      monsterId: 'rat',
    });
    expect(result).toEqual({ progress: [0, 0], changed: false });
  });

  it('caps progress at the objective target and reports unchanged once capped', () => {
    const result = advanceProgress(objectives, [2, 0], {
      kind: 'KILL_MONSTER',
      monsterId: 'bandit',
    });
    expect(result).toEqual({ progress: [2, 0], changed: false });
  });

  it('advances a REACH_CITY objective to its fixed target of 1', () => {
    const reachObjectives: QuestObjective[] = [
      { kind: 'REACH_CITY', cityId: 'ashford' },
    ];
    const result = advanceProgress(reachObjectives, [0], {
      kind: 'REACH_CITY',
      cityId: 'ashford',
    });
    expect(result).toEqual({ progress: [1], changed: true });
  });
});

describe('isQuestComplete', () => {
  const objectives: QuestObjective[] = [
    { kind: 'KILL_MONSTER', monsterId: 'bandit', count: 2 },
    { kind: 'COLLECT_ITEM', itemId: 'scrap-metal', count: 3 },
  ];

  it('is false until every objective has met its target', () => {
    expect(isQuestComplete(objectives, [2, 2])).toBe(false);
    expect(isQuestComplete(objectives, [2, 3])).toBe(true);
  });

  it('treats missing progress entries as zero', () => {
    expect(isQuestComplete(objectives, [])).toBe(false);
  });
});
