import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { CharacterService } from '../character/character.service';
import {
  BattleFinishedEvent,
  PlayerLevelUpEvent,
} from '../combat/combat.service';
import { ContentService } from '../content/content.service';
import { Dungeon, DungeonBeat, PreparednessTier } from '../content/schemas';
import {
  InventoryService,
  ItemAcquiredEvent,
} from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  assessPreparedness,
  BeatOutcome,
  resolveBeat,
} from './dungeon-resolver';

type TransactionClient = Prisma.TransactionClient;

interface AppliedBeat {
  beat: DungeonBeat;
  outcome: BeatOutcome;
  itemInstanceId: string | null;
  cleared: boolean;
  clearRewardInstances: { id: string; itemId: string }[];
}

export interface DungeonEnteredEvent {
  userId: string;
  characterId: string;
  dungeonId: string;
}

export interface DungeonClearedEvent {
  userId: string;
  characterId: string;
  dungeonId: string;
}

export interface DungeonRetreatedEvent {
  userId: string;
  characterId: string;
  dungeonId: string;
  atBeat: number;
}

export interface DungeonListEntry {
  id: string;
  name: string;
  minLevel: number;
  entryCost: number;
}

export interface DungeonThreshold {
  dungeonId: string;
  name: string;
  rumor: string;
  tier: PreparednessTier;
  flavor: string;
}

export interface DungeonRunStatusView {
  dungeonId: string;
  name: string;
  status: 'IN_PROGRESS' | 'CLEARED' | 'RETREATED';
  currentBeat: number;
  totalBeats: number;
}

@Injectable()
export class DungeonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly content: ContentService,
    private readonly character: CharacterService,
    private readonly inventory: InventoryService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async listAvailable(userId: string): Promise<DungeonListEntry[]> {
    const character = await this.character.getForUser(userId);
    return this.content
      .getDungeons()
      .filter(
        (dungeon) =>
          dungeon.cityId === character.currentCityId &&
          character.level >= dungeon.minLevel,
      )
      .map((dungeon) => ({
        id: dungeon.id,
        name: dungeon.name,
        minLevel: dungeon.minLevel,
        entryCost: dungeon.entryCost,
      }));
  }

  /**
   * Free, repeatable, no state change - the "threshold" read (M11 design
   * discussion). Safe to call as many times as a player wants to steel
   * themselves before actually committing to POST .../enter.
   */
  async getThreshold(
    userId: string,
    dungeonId: string,
  ): Promise<DungeonThreshold> {
    const dungeon = this.getDungeonOrThrow(dungeonId);
    const character = await this.character.getForUser(userId);

    const [equipped, allItems, hasClearedBefore] = await Promise.all([
      this.prisma.itemInstance.findMany({
        where: { characterId: character.id, equipped: true },
      }),
      this.prisma.itemInstance.findMany({
        where: { characterId: character.id },
      }),
      this.prisma.dungeonRun.findFirst({
        where: { characterId: character.id, dungeonId, status: 'CLEARED' },
      }),
    ]);
    const bonuses = this.inventory.sumEquipmentBonuses(equipped);
    const consumableCount = allItems.filter(
      (instance) =>
        this.content.findItem(instance.itemId)?.type === 'CONSUMABLE',
    ).length;

    const tier = assessPreparedness(
      character,
      bonuses.attackBonus + bonuses.defenseBonus,
      consumableCount,
      dungeon,
      hasClearedBefore !== null,
    );
    const flavorPool = dungeon.preparednessFlavor[tier];
    const flavor = flavorPool[Math.floor(Math.random() * flavorPool.length)];

    return {
      dungeonId: dungeon.id,
      name: dungeon.name,
      rumor: dungeon.rumor,
      tier,
      flavor,
    };
  }

  async getCurrent(userId: string): Promise<DungeonRunStatusView | null> {
    const character = await this.character.getForUser(userId);
    const run = await this.prisma.dungeonRun.findFirst({
      where: { characterId: character.id, status: 'IN_PROGRESS' },
    });
    if (!run) {
      return null;
    }
    const dungeon = this.getDungeonOrThrow(run.dungeonId);
    return {
      dungeonId: dungeon.id,
      name: dungeon.name,
      status: run.status,
      currentBeat: run.currentBeat,
      totalBeats: dungeon.beats.length,
    };
  }

  async enter(userId: string, dungeonId: string) {
    const dungeon = this.getDungeonOrThrow(dungeonId);

    // Fast-fail pre-check, re-validated against a fresh locked read inside
    // the transaction below - same shape as WorldService.travel().
    const precheck = await this.character.getForUser(userId);
    if (precheck.currentCityId !== dungeon.cityId) {
      throw new BadRequestException(
        'you need to be where this dungeon is to enter it',
      );
    }
    if (precheck.level < dungeon.minLevel) {
      throw new ForbiddenException(`requires level ${dungeon.minLevel}`);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.character.updateMany({
        where: {
          userId,
          currentCityId: dungeon.cityId,
          actionPoints: { gte: dungeon.entryCost },
        },
        data: { actionPoints: { decrement: dungeon.entryCost } },
      });
      if (count === 0) {
        throw new ConflictException(
          'not enough action points to enter - rest and come back later',
        );
      }

      const character = await tx.character.findUniqueOrThrow({
        where: { userId },
      });

      const existingRun = await tx.dungeonRun.findFirst({
        where: { characterId: character.id, status: 'IN_PROGRESS' },
      });
      if (existingRun) {
        throw new ConflictException(
          'you are already on an expedition - retreat from it first',
        );
      }

      const run = await tx.dungeonRun.create({
        data: { characterId: character.id, dungeonId: dungeon.id },
      });

      const applied = await this.resolveAndApplyBeat(
        tx,
        dungeon,
        run.id,
        character.id,
        0,
      );

      return { characterId: character.id, ...applied };
    });

    this.emitBeatEvents(userId, dungeon, result);
    this.eventEmitter.emit('DungeonEntered', {
      userId,
      characterId: result.characterId,
      dungeonId: dungeon.id,
    } satisfies DungeonEnteredEvent);
    if (result.cleared) {
      this.emitCleared(
        userId,
        result.characterId,
        dungeon.id,
        result.clearRewardInstances,
      );
    }

    return {
      dungeonId: dungeon.id,
      beatLog: result.outcome.log,
      cleared: result.cleared,
    };
  }

  async advance(userId: string) {
    const character = await this.character.getForUser(userId);
    const run = await this.prisma.dungeonRun.findFirst({
      where: { characterId: character.id, status: 'IN_PROGRESS' },
    });
    if (!run) {
      throw new NotFoundException('you are not on an expedition');
    }
    const dungeon = this.getDungeonOrThrow(run.dungeonId);
    if (run.currentBeat >= dungeon.beats.length) {
      throw new ConflictException('this expedition has already ended');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.dungeonRun.updateMany({
        where: {
          id: run.id,
          status: 'IN_PROGRESS',
          currentBeat: run.currentBeat,
        },
        data: { currentBeat: { increment: 1 } },
      });
      if (count === 0) {
        throw new ConflictException(
          'this expedition already moved on - refresh and try again',
        );
      }

      const applied = await this.resolveAndApplyBeat(
        tx,
        dungeon,
        run.id,
        character.id,
        run.currentBeat,
      );

      return { characterId: character.id, ...applied };
    });

    this.emitBeatEvents(userId, dungeon, result);
    if (result.cleared) {
      this.emitCleared(
        userId,
        result.characterId,
        dungeon.id,
        result.clearRewardInstances,
      );
    }

    return {
      dungeonId: dungeon.id,
      beatLog: result.outcome.log,
      cleared: result.cleared,
    };
  }

  async retreat(userId: string) {
    const character = await this.character.getForUser(userId);
    const run = await this.prisma.dungeonRun.findFirst({
      where: { characterId: character.id, status: 'IN_PROGRESS' },
    });
    if (!run) {
      throw new NotFoundException('you are not on an expedition');
    }

    const { count } = await this.prisma.dungeonRun.updateMany({
      where: { id: run.id, status: 'IN_PROGRESS' },
      data: { status: 'RETREATED', resolvedAt: new Date() },
    });
    if (count === 0) {
      throw new ConflictException('this expedition already ended');
    }

    this.eventEmitter.emit('DungeonRetreated', {
      userId,
      characterId: character.id,
      dungeonId: run.dungeonId,
      atBeat: run.currentBeat,
    } satisfies DungeonRetreatedEvent);

    return { dungeonId: run.dungeonId, atBeat: run.currentBeat };
  }

  /**
   * The one place a beat is actually resolved and persisted - shared by
   * enter() (always beatIndex 0, on a run it just created) and advance()
   * (whatever beatIndex its own conditional claim just moved onto).
   * Callers own the concurrency guard for their own call site (the AP
   * claim in enter(), the currentBeat claim in advance()); this only
   * needs a beat index it's already been told is safe to resolve. Writing
   * currentBeat here again in advance()'s case is a harmless repeat of
   * the same value its claim already set, not a second source of truth.
   */
  private async resolveAndApplyBeat(
    tx: TransactionClient,
    dungeon: Dungeon,
    runId: string,
    characterId: string,
    beatIndex: number,
  ): Promise<AppliedBeat> {
    const character = await tx.character.findUniqueOrThrow({
      where: { id: characterId },
    });
    const equipped = await tx.itemInstance.findMany({
      where: { characterId, equipped: true },
    });
    const bonuses = this.inventory.sumEquipmentBonuses(equipped);

    const beat = dungeon.beats[beatIndex];
    const monster =
      beat.kind === 'DISCOVERY'
        ? null
        : this.content.findMonster(beat.monsterId);
    if (beat.kind !== 'DISCOVERY' && !monster) {
      throw new Error('dungeon beat references unknown monster');
    }
    const outcome = resolveBeat(
      { ...character, ...bonuses },
      beat,
      monster ?? null,
    );
    // Real bug found by playing this: reaching the last beat index used
    // to be the *only* condition checked here, regardless of whether
    // outcome.victory was true or false - a player who lost the final
    // (often boss) fight still had the run marked CLEARED and received
    // the full clear reward, with the log narrating a defeat in the same
    // breath. victory is boolean|null (null only for a DISCOVERY beat,
    // which never fails), so !== false correctly still clears on a win
    // or a fight-free final beat, only blocking it on an actual loss.
    const cleared =
      beatIndex + 1 >= dungeon.beats.length && outcome.victory !== false;

    let itemInstanceId: string | null = null;
    if (outcome.lootItemId) {
      const created = await tx.itemInstance.create({
        data: { characterId, itemId: outcome.lootItemId },
      });
      itemInstanceId = created.id;
    }

    await tx.character.update({
      where: { id: characterId },
      data: {
        hp: outcome.newHp,
        maxHp: outcome.newMaxHp,
        level: outcome.newLevel,
        xp: outcome.newXp,
        ...(cleared ? { gold: { increment: dungeon.rewardGold } } : {}),
      },
    });

    const clearRewardInstances: { id: string; itemId: string }[] = [];
    if (cleared) {
      for (const itemId of dungeon.rewardItemIds) {
        const created = await tx.itemInstance.create({
          data: { characterId, itemId },
        });
        clearRewardInstances.push(created);
      }
    }

    await tx.dungeonRun.update({
      where: { id: runId },
      data: {
        currentBeat: beatIndex + 1,
        ...(cleared
          ? { status: 'CLEARED' as const, resolvedAt: new Date() }
          : {}),
      },
    });

    return { beat, outcome, itemInstanceId, cleared, clearRewardInstances };
  }

  private getDungeonOrThrow(dungeonId: string): Dungeon {
    const dungeon = this.content.findDungeon(dungeonId);
    if (!dungeon) {
      throw new NotFoundException('no such dungeon');
    }
    return dungeon;
  }

  /**
   * COMBAT/BOSS beats emit the exact same BattleFinished/PlayerLevelUp/
   * ItemAcquired events ordinary combat and travel encounters already
   * emit (M11 design discussion) - a fight is a fight regardless of where
   * it happened, so Quests' existing listeners pick these up for free.
   * DISCOVERY beats emit nothing; there's no consumer for "flavor text
   * happened" yet, and inventing one speculatively isn't warranted.
   */
  private emitBeatEvents(
    userId: string,
    dungeon: Dungeon,
    result: AppliedBeat & { characterId: string },
  ): void {
    if (result.beat.kind === 'DISCOVERY') {
      return;
    }
    this.eventEmitter.emit('BattleFinished', {
      userId,
      characterId: result.characterId,
      monsterId: result.beat.monsterId,
      victory: result.outcome.victory === true,
      xpGained: result.outcome.xpGained,
    } satisfies BattleFinishedEvent);

    if (result.outcome.leveledUp) {
      this.eventEmitter.emit('PlayerLevelUp', {
        userId,
        characterId: result.characterId,
        newLevel: result.outcome.newLevel,
      } satisfies PlayerLevelUpEvent);
    }

    if (result.outcome.lootItemId && result.itemInstanceId) {
      this.eventEmitter.emit('ItemAcquired', {
        userId,
        characterId: result.characterId,
        itemInstanceId: result.itemInstanceId,
        itemId: result.outcome.lootItemId,
      } satisfies ItemAcquiredEvent);
    }
  }

  private emitCleared(
    userId: string,
    characterId: string,
    dungeonId: string,
    clearRewardInstances: { id: string; itemId: string }[],
  ): void {
    this.eventEmitter.emit('DungeonCleared', {
      userId,
      characterId,
      dungeonId,
    } satisfies DungeonClearedEvent);

    for (const instance of clearRewardInstances) {
      this.eventEmitter.emit('ItemAcquired', {
        userId,
        characterId,
        itemInstanceId: instance.id,
        itemId: instance.itemId,
      } satisfies ItemAcquiredEvent);
    }
  }
}
