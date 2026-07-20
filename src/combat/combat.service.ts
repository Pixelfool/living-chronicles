import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContentService } from '../content/content.service';
import { InventoryService, ItemAcquiredEvent } from '../inventory/inventory.service';
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

    const character = await this.prisma.character.findUnique({
      where: { userId },
    });
    if (!character) {
      throw new NotFoundException('no character on this account yet');
    }

    if (character.actionPoints < 1) {
      throw new ConflictException(
        'not enough action points to fight - rest and come back later',
      );
    }

    const bonuses = await this.inventory.getEquipmentBonuses(character.id);
    const { outcome, xpGained, xpResult, newHp } = resolveFight(
      { ...character, ...bonuses },
      monster,
    );

    const lootItemId = outcome.victory ? rollLoot(monster.lootTable) : null;
    let itemInstanceId: string | null = null;

    // Combat -> Inventory is a real cross-module write (build-plan-v1 M4):
    // the AP-gated stat update and the loot grant must succeed or fail
    // together, so this is one Postgres transaction applied directly at
    // this call site (architecture.md §4.4), not a generic framework.
    const updated = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.character.updateMany({
        where: { userId, actionPoints: { gte: 1 } },
        data: {
          hp: newHp,
          maxHp: xpResult.maxHp,
          level: xpResult.level,
          xp: xpResult.xp,
          actionPoints: { decrement: 1 },
        },
      });

      if (count === 0) {
        throw new ConflictException(
          'not enough action points to fight - rest and come back later',
        );
      }

      if (lootItemId) {
        const created = await tx.itemInstance.create({
          data: { characterId: character.id, itemId: lootItemId },
        });
        itemInstanceId = created.id;
      }

      return tx.character.findUniqueOrThrow({ where: { userId } });
    });

    this.eventEmitter.emit('BattleFinished', {
      userId,
      characterId: character.id,
      monsterId: monster.id,
      victory: outcome.victory,
      xpGained,
    } satisfies BattleFinishedEvent);

    if (xpResult.leveledUp) {
      this.eventEmitter.emit('PlayerLevelUp', {
        userId,
        characterId: character.id,
        newLevel: xpResult.level,
      } satisfies PlayerLevelUpEvent);
    }

    if (lootItemId && itemInstanceId) {
      this.eventEmitter.emit('ItemAcquired', {
        userId,
        characterId: character.id,
        itemInstanceId,
        itemId: lootItemId,
      } satisfies ItemAcquiredEvent);
    }

    return {
      victory: outcome.victory,
      monster: { id: monster.id, name: monster.name },
      log: describeBattle(outcome, monster.name),
      xpGained,
      leveledUp: xpResult.leveledUp,
      lootItemId,
      character: updated,
    };
  }
}
