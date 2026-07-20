import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { describeBattle, resolveFight } from '../combat/combat-resolver';
import {
  BattleFinishedEvent,
  PlayerLevelUpEvent,
} from '../combat/combat.service';
import { rollLoot } from '../combat/loot';
import { ContentService } from '../content/content.service';
import { InventoryService, ItemAcquiredEvent } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';

export interface PlayerEnteredLocationEvent {
  userId: string;
  characterId: string;
  cityId: string;
}

export interface TravelEncounter {
  monster: { id: string; name: string };
  log: string[];
  victory: boolean;
  xpGained: number;
  leveledUp: boolean;
  lootItemId: string | null;
}

@Injectable()
export class WorldService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly content: ContentService,
    private readonly inventory: InventoryService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  listCities() {
    return this.content.getCities();
  }

  listRoutes() {
    return this.content.getRegions();
  }

  async travel(userId: string, toCityId: string) {
    const destination = this.content.getCity(toCityId);
    if (!destination) {
      throw new NotFoundException('no such city');
    }

    const character = await this.prisma.character.findUnique({
      where: { userId },
    });
    if (!character) {
      throw new NotFoundException('no character on this account yet');
    }

    if (character.currentCityId === toCityId) {
      throw new BadRequestException('already there');
    }

    const route = this.content.findRoute(character.currentCityId, toCityId);
    if (!route) {
      throw new NotFoundException('no route between these cities');
    }

    if (character.actionPoints < route.travelCost) {
      throw new ConflictException(
        'not enough action points to travel there - rest and come back later',
      );
    }

    // Fight along the way (game-design.md §8): a chance-based encounter
    // drawn from the road's own monster table. This is part of the single
    // travel action already being paid for below, not a second toll.
    let encounter: TravelEncounter | null = null;
    let newHp = character.hp;
    let newMaxHp = character.maxHp;
    let newLevel = character.level;
    let newXp = character.xp;
    let lootItemId: string | null = null;

    const shouldEncounter =
      route.monsterIds.length > 0 && Math.random() < route.encounterChance;

    if (shouldEncounter) {
      const monsterId =
        route.monsterIds[Math.floor(Math.random() * route.monsterIds.length)];
      const monster = this.content.findMonster(monsterId);
      if (monster) {
        const bonuses = await this.inventory.getEquipmentBonuses(character.id);
        const { outcome, xpGained, xpResult, newHp: hpAfterFight } =
          resolveFight({ ...character, ...bonuses }, monster);
        newHp = hpAfterFight;
        newMaxHp = xpResult.maxHp;
        newLevel = xpResult.level;
        newXp = xpResult.xp;
        lootItemId = outcome.victory ? rollLoot(monster.lootTable) : null;
        encounter = {
          monster: { id: monster.id, name: monster.name },
          log: describeBattle(outcome, monster.name),
          victory: outcome.victory,
          xpGained,
          leveledUp: xpResult.leveledUp,
          lootItemId,
        };
      }
    }

    let itemInstanceId: string | null = null;

    // Same cross-module transaction pattern as CombatService.fight(): the
    // travel/AP/city update and any encounter loot grant succeed or fail
    // together (architecture.md §4.4, applied directly per build-plan M4).
    const updated = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.character.updateMany({
        where: { userId, actionPoints: { gte: route.travelCost } },
        data: {
          currentCityId: toCityId,
          actionPoints: { decrement: route.travelCost },
          hp: newHp,
          maxHp: newMaxHp,
          level: newLevel,
          xp: newXp,
        },
      });

      if (count === 0) {
        throw new ConflictException(
          'not enough action points to travel there - rest and come back later',
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

    this.eventEmitter.emit('PlayerEnteredLocation', {
      userId,
      characterId: character.id,
      cityId: toCityId,
    } satisfies PlayerEnteredLocationEvent);

    if (encounter) {
      this.eventEmitter.emit('BattleFinished', {
        userId,
        characterId: character.id,
        monsterId: encounter.monster.id,
        victory: encounter.victory,
        xpGained: encounter.xpGained,
      } satisfies BattleFinishedEvent);

      if (encounter.leveledUp) {
        this.eventEmitter.emit('PlayerLevelUp', {
          userId,
          characterId: character.id,
          newLevel,
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
    }

    return {
      city: { id: destination.id, name: destination.name },
      encounter,
      character: updated,
    };
  }
}
