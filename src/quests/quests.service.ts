import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  BattleFinishedEvent,
  PlayerLevelUpEvent,
} from '../combat/combat.service';
import { CharacterService } from '../character/character.service';
import { applyXpGain } from '../character/leveling';
import { ContentService } from '../content/content.service';
import { Quest } from '../content/schemas';
import { ItemAcquiredEvent } from '../inventory/inventory.service';
import { isUniqueConstraintViolation } from '../prisma/prisma.errors';
import { PrismaService } from '../prisma/prisma.service';
import { PlayerEnteredLocationEvent } from '../world/world.service';
import {
  advanceProgress,
  isQuestComplete,
  objectiveTarget,
  QuestSignal,
} from './objective-progress';

export interface QuestAcceptedEvent {
  userId: string;
  characterId: string;
  questId: string;
}

export interface QuestCompletedEvent {
  userId: string;
  characterId: string;
  questId: string;
}

export interface AvailableQuestEntry {
  id: string;
  name: string;
  giverNpcId: string;
  giverName: string;
  minLevel: number;
  blurb: string;
}

export interface QuestProgressEntry {
  questId: string;
  name: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  objectives: { description: string; progress: number; target: number }[];
  readyToTurnIn: boolean;
}

@Injectable()
export class QuestsService {
  private readonly logger = new Logger(QuestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly content: ContentService,
    private readonly character: CharacterService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async listAvailable(userId: string): Promise<AvailableQuestEntry[]> {
    const character = await this.character.getForUser(userId);
    const existing = await this.prisma.questProgress.findMany({
      where: { characterId: character.id },
    });
    const existingByQuestId = new Map(existing.map((p) => [p.questId, p]));

    const available: AvailableQuestEntry[] = [];
    for (const quest of this.content.getQuests()) {
      const giver = this.content.findNpc(quest.giverNpcId);
      if (!giver || giver.cityId !== character.currentCityId) {
        continue;
      }
      if (existingByQuestId.has(quest.id)) {
        continue;
      }
      if (character.level < quest.minLevel) {
        continue;
      }
      if (quest.requiresQuestId) {
        const prereq = existingByQuestId.get(quest.requiresQuestId);
        if (!prereq || prereq.status !== 'COMPLETED') {
          continue;
        }
      }
      available.push({
        id: quest.id,
        name: quest.name,
        giverNpcId: giver.id,
        giverName: giver.name,
        minLevel: quest.minLevel,
        blurb: quest.blurb,
      });
    }
    return available;
  }

  async listMine(userId: string): Promise<QuestProgressEntry[]> {
    const character = await this.character.getForUser(userId);
    const progressRows = await this.prisma.questProgress.findMany({
      where: { characterId: character.id },
      orderBy: { acceptedAt: 'asc' },
    });

    const entries: QuestProgressEntry[] = [];
    for (const row of progressRows) {
      const quest = this.content.findQuest(row.questId);
      if (!quest) {
        continue;
      }
      entries.push({
        questId: quest.id,
        name: quest.name,
        status: row.status,
        objectives: quest.objectives.map((objective, index) => ({
          description: this.describeObjective(quest, index),
          progress: Math.min(
            row.objectiveProgress[index] ?? 0,
            objectiveTarget(objective),
          ),
          target: objectiveTarget(objective),
        })),
        readyToTurnIn:
          row.status === 'IN_PROGRESS' &&
          isQuestComplete(quest.objectives, row.objectiveProgress),
      });
    }
    return entries;
  }

  /**
   * Player-facing text - resolves display names via ContentService (same
   * as every other module does for monsters/items/cities) rather than
   * leaking internal content-pack ids like "rat" or "scrap-metal" into
   * the quest log.
   */
  private describeObjective(quest: Quest, index: number): string {
    const objective = quest.objectives[index];
    switch (objective.kind) {
      case 'KILL_MONSTER': {
        const name =
          this.content.findMonster(objective.monsterId)?.name ??
          objective.monsterId;
        return `Defeat ${objective.count}x ${name}`;
      }
      case 'COLLECT_ITEM': {
        const name =
          this.content.findItem(objective.itemId)?.name ?? objective.itemId;
        return `Collect ${objective.count}x ${name}`;
      }
      case 'REACH_CITY': {
        const name =
          this.content.getCity(objective.cityId)?.name ?? objective.cityId;
        return `Travel to ${name}`;
      }
    }
  }

  async accept(userId: string, questId: string) {
    const character = await this.character.getForUser(userId);
    const quest = this.content.findQuest(questId);
    if (!quest) {
      throw new NotFoundException('no such quest');
    }
    const giver = this.content.findNpc(quest.giverNpcId);
    if (!giver || giver.cityId !== character.currentCityId) {
      throw new BadRequestException(
        'you need to be where this quest giver is to accept it',
      );
    }
    if (character.level < quest.minLevel) {
      throw new ForbiddenException(`requires level ${quest.minLevel}`);
    }
    if (quest.requiresQuestId) {
      const prereq = await this.prisma.questProgress.findUnique({
        where: {
          characterId_questId: {
            characterId: character.id,
            questId: quest.requiresQuestId,
          },
        },
      });
      if (!prereq || prereq.status !== 'COMPLETED') {
        throw new ForbiddenException(
          'you have not completed the prerequisite quest',
        );
      }
    }

    try {
      await this.prisma.questProgress.create({
        data: {
          characterId: character.id,
          questId: quest.id,
          objectiveProgress: quest.objectives.map(() => 0),
        },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException('you have already accepted this quest');
      }
      throw error;
    }

    this.eventEmitter.emit('QuestAccepted', {
      userId,
      characterId: character.id,
      questId: quest.id,
    } satisfies QuestAcceptedEvent);

    return { questId: quest.id, name: quest.name };
  }

  async complete(userId: string, questId: string) {
    const character = await this.character.getForUser(userId);
    const quest = this.content.findQuest(questId);
    if (!quest) {
      throw new NotFoundException('no such quest');
    }
    const giver = this.content.findNpc(quest.giverNpcId);
    if (!giver || giver.cityId !== character.currentCityId) {
      throw new BadRequestException(
        'you need to be where this quest giver is to turn this in',
      );
    }

    const progress = await this.prisma.questProgress.findUnique({
      where: {
        characterId_questId: { characterId: character.id, questId: quest.id },
      },
    });
    if (!progress || progress.status !== 'IN_PROGRESS') {
      throw new NotFoundException('you have not accepted this quest');
    }
    // Not re-checked inside the transaction below - safe only because
    // objectiveProgress is monotonically non-decreasing (applySignal only
    // ever advances it, capped at each objective's target - see
    // objective-progress.ts) and nothing in this codebase ever resets or
    // decrements it. If a future feature (abandon/reset, rolling back
    // progress, etc.) breaks that invariant, this check needs to move
    // inside the transaction against a freshly locked read, the same way
    // the giver-location check below relies on location being a one-time
    // gate rather than a persisted, raceable invariant (M9 review).
    if (!isQuestComplete(quest.objectives, progress.objectiveProgress)) {
      throw new BadRequestException('objectives are not complete yet');
    }

    // Rewards are granted inside the same transaction that flips this
    // quest to COMPLETED - QuestCompleted is only emitted after commit, so
    // nothing about reward distribution ever depends on an event listener
    // actually running (M9 design discussion).
    const result = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.questProgress.updateMany({
        where: {
          characterId: character.id,
          questId: quest.id,
          status: 'IN_PROGRESS',
        },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      if (count === 0) {
        throw new ConflictException('this quest was already turned in');
      }

      const fresh = await tx.character.findUniqueOrThrow({
        where: { id: character.id },
      });
      const xpResult = applyXpGain(fresh, quest.rewardXp);

      await tx.character.update({
        where: { id: character.id },
        data: {
          level: xpResult.level,
          xp: xpResult.xp,
          maxHp: xpResult.maxHp,
          gold: { increment: quest.rewardGold },
        },
      });

      const createdInstances = [];
      for (const itemId of quest.rewardItemIds) {
        createdInstances.push(
          await tx.itemInstance.create({
            data: { characterId: character.id, itemId },
          }),
        );
      }

      return { xpResult, createdInstances };
    });

    this.eventEmitter.emit('QuestCompleted', {
      userId,
      characterId: character.id,
      questId: quest.id,
    } satisfies QuestCompletedEvent);

    if (result.xpResult.leveledUp) {
      this.eventEmitter.emit('PlayerLevelUp', {
        userId,
        characterId: character.id,
        newLevel: result.xpResult.level,
      } satisfies PlayerLevelUpEvent);
    }

    for (const instance of result.createdInstances) {
      this.eventEmitter.emit('ItemAcquired', {
        userId,
        characterId: character.id,
        itemInstanceId: instance.id,
        itemId: instance.itemId,
      } satisfies ItemAcquiredEvent);
    }

    return {
      questId: quest.id,
      rewardXp: quest.rewardXp,
      rewardGold: quest.rewardGold,
      rewardItemIds: quest.rewardItemIds,
    };
  }

  /**
   * Quests is the first module whose job is mainly *listening*, not
   * emitting (M9 design discussion: the first real consumer of the
   * domain event catalog). Every current listener here is core code, not
   * a third-party plugin's, so an exception surfacing as a logged error
   * rather than crashing the process is a bug to fix directly - the
   * per-listener failure isolation in architecture.md §4.7 is explicitly
   * deferred until a plugin is actually on this bus (build-plan-v1.md §4).
   *
   * Two signals for the same character can genuinely race (nothing about
   * the event bus serializes them), so each row is locked with SELECT ...
   * FOR UPDATE before being read and rewritten - a plain read-then-write
   * would silently lose an update under concurrent signals, the same
   * failure mode combat.service.ts's action-point claim already guards
   * against for a different table.
   */
  private async applySignal(
    characterId: string,
    signal: QuestSignal,
  ): Promise<void> {
    const inProgress = await this.prisma.questProgress.findMany({
      where: { characterId, status: 'IN_PROGRESS' },
      select: { id: true, questId: true },
    });
    for (const row of inProgress) {
      const quest = this.content.findQuest(row.questId);
      if (!quest) {
        continue;
      }
      try {
        await this.prisma.$transaction(async (tx) => {
          const locked = await tx.$queryRaw<{ objectiveProgress: number[] }[]>`
            SELECT "objectiveProgress" FROM "quest_progress" WHERE "id" = ${row.id} FOR UPDATE
          `;
          const current = locked[0]?.objectiveProgress ?? [];
          const { progress, changed } = advanceProgress(
            quest.objectives,
            current,
            signal,
          );
          if (!changed) {
            return;
          }
          await tx.questProgress.update({
            where: { id: row.id },
            data: { objectiveProgress: progress },
          });
        });
      } catch (error) {
        this.logger.error(
          `failed to advance quest "${row.questId}" progress for character ${characterId}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  @OnEvent('BattleFinished')
  async onBattleFinished(event: BattleFinishedEvent): Promise<void> {
    if (!event.victory) {
      return;
    }
    await this.applySignal(event.characterId, {
      kind: 'KILL_MONSTER',
      monsterId: event.monsterId,
    });
  }

  @OnEvent('ItemAcquired')
  async onItemAcquired(event: ItemAcquiredEvent): Promise<void> {
    await this.applySignal(event.characterId, {
      kind: 'COLLECT_ITEM',
      itemId: event.itemId,
    });
  }

  @OnEvent('PlayerEnteredLocation')
  async onPlayerEnteredLocation(
    event: PlayerEnteredLocationEvent,
  ): Promise<void> {
    await this.applySignal(event.characterId, {
      kind: 'REACH_CITY',
      cityId: event.cityId,
    });
  }
}
