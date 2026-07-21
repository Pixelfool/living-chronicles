import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CharacterService } from '../character/character.service';
import { ContentService } from '../content/content.service';
import {
  InventoryService,
  ItemAcquiredEvent,
} from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { describeBattle, resolveFight } from './combat-resolver';
import { rollLoot } from './loot';

export interface BattleFinishedEvent {
  userId: string;
  characterId: string;
  monsterId: string;
  victory: boolean;
  xpGained: number;
}

export interface PlayerLevelUpEvent {
  userId: string;
  characterId: string;
  newLevel: number;
}

@Injectable()
export class CombatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly content: ContentService,
    private readonly inventory: InventoryService,
    private readonly character: CharacterService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  listMonsters() {
    return this.content.getMonsters();
  }

  async fight(userId: string, monsterId: string) {
    const monster = this.content.findMonster(monsterId);
    if (!monster) {
      throw new NotFoundException('no such monster');
    }

    // Fast-fail pre-check so an obviously-bad request (no character yet)
    // doesn't pay for opening a transaction. Not the source of
    // correctness - the transaction below is.
    await this.character.getForUser(userId);

    const result = await this.prisma.$transaction(async (tx) => {
      // Claiming the action point up front both gates on it atomically
      // AND takes a row lock for the rest of this transaction (Postgres
      // holds the lock an UPDATE acquires until commit). Everything
      // read after this point - hp, xp, level, equipped gear - is
      // therefore guaranteed fresh: no other concurrent fight or travel
      // can be mutating this same character while we hold the lock, so
      // there's no stale snapshot left to silently overwrite.
      const { count } = await tx.character.updateMany({
        where: { userId, actionPoints: { gte: 1 } },
        data: { actionPoints: { decrement: 1 } },
      });

      if (count === 0) {
        throw new ConflictException(
          'not enough action points to fight - rest and come back later',
        );
      }

      const character = await tx.character.findUniqueOrThrow({
        where: { userId },
      });
      const equipped = await tx.itemInstance.findMany({
        where: { characterId: character.id, equipped: true },
      });
      const bonuses = this.inventory.sumEquipmentBonuses(equipped);

      const { outcome, xpGained, xpResult, newHp } = resolveFight(
        { ...character, ...bonuses },
        monster,
      );

      const lootItemId = outcome.victory ? rollLoot(monster.lootTable) : null;
      let itemInstanceId: string | null = null;

      await tx.character.update({
        where: { userId },
        data: {
          hp: newHp,
          maxHp: xpResult.maxHp,
          level: xpResult.level,
          xp: xpResult.xp,
        },
      });

      if (lootItemId) {
        const created = await tx.itemInstance.create({
          data: { characterId: character.id, itemId: lootItemId },
        });
        itemInstanceId = created.id;
      }

      const updated = await tx.character.findUniqueOrThrow({
        where: { userId },
      });

      return {
        outcome,
        xpGained,
        xpResult,
        lootItemId,
        itemInstanceId,
        updated,
        characterId: character.id,
      };
    });

    this.eventEmitter.emit('BattleFinished', {
      userId,
      characterId: result.characterId,
      monsterId: monster.id,
      victory: result.outcome.victory,
      xpGained: result.xpGained,
    } satisfies BattleFinishedEvent);

    if (result.xpResult.leveledUp) {
      this.eventEmitter.emit('PlayerLevelUp', {
        userId,
        characterId: result.characterId,
        newLevel: result.xpResult.level,
      } satisfies PlayerLevelUpEvent);
    }

    if (result.lootItemId && result.itemInstanceId) {
      this.eventEmitter.emit('ItemAcquired', {
        userId,
        characterId: result.characterId,
        itemInstanceId: result.itemInstanceId,
        itemId: result.lootItemId,
      } satisfies ItemAcquiredEvent);
    }

    return {
      victory: result.outcome.victory,
      monster: { id: monster.id, name: monster.name },
      log: describeBattle(result.outcome, monster.name),
      xpGained: result.xpGained,
      leveledUp: result.xpResult.leveledUp,
      lootItemId: result.lootItemId,
      character: result.updated,
    };
  }
}
