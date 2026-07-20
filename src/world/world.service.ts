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
import {
  InventoryService,
  ItemAcquiredEvent,
} from '../inventory/inventory.service';
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

    // Fast-fail pre-check only - every fact it establishes (current city,
    // route, AP) is re-validated against a fresh, locked read inside the
    // transaction below before anything is written.
    const precheck = await this.prisma.character.findUnique({
      where: { userId },
    });
    if (!precheck) {
      throw new NotFoundException('no character on this account yet');
    }
    if (precheck.currentCityId === toCityId) {
      throw new BadRequestException('already there');
    }
    if (!this.content.findRoute(precheck.currentCityId, toCityId)) {
      throw new NotFoundException('no route between these cities');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const beforeClaim = await tx.character.findUniqueOrThrow({
        where: { userId },
      });

      if (beforeClaim.currentCityId === toCityId) {
        throw new BadRequestException('already there');
      }
      const route = this.content.findRoute(beforeClaim.currentCityId, toCityId);
      if (!route) {
        throw new NotFoundException('no route between these cities');
      }

      // Claiming the action points up front, gated on both AP and the
      // current city still matching what we just read, both locks the
      // row for the rest of this transaction and rules out a concurrent
      // travel having already moved (or spent) this character out from
      // under us. Everything read after this point is guaranteed fresh.
      const { count } = await tx.character.updateMany({
        where: {
          userId,
          currentCityId: beforeClaim.currentCityId,
          actionPoints: { gte: route.travelCost },
        },
        data: { actionPoints: { decrement: route.travelCost } },
      });

      if (count === 0) {
        throw new ConflictException(
          'not enough action points to travel there - rest and come back later',
        );
      }

      const character = await tx.character.findUniqueOrThrow({
        where: { userId },
      });

      // Fight along the way (game-design.md §8): a chance-based encounter
      // drawn from the road's own monster table. This is part of the
      // single travel action already paid for above, not a second toll.
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
          const equipped = await tx.itemInstance.findMany({
            where: { characterId: character.id, equipped: true },
          });
          const bonuses = this.inventory.sumEquipmentBonuses(equipped);
          const {
            outcome,
            xpGained,
            xpResult,
            newHp: hpAfterFight,
          } = resolveFight({ ...character, ...bonuses }, monster);
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

      await tx.character.update({
        where: { userId },
        data: {
          currentCityId: toCityId,
          hp: newHp,
          maxHp: newMaxHp,
          level: newLevel,
          xp: newXp,
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
        encounter,
        newLevel,
        lootItemId,
        itemInstanceId,
        updated,
        characterId: character.id,
      };
    });

    this.eventEmitter.emit('PlayerEnteredLocation', {
      userId,
      characterId: result.characterId,
      cityId: toCityId,
    } satisfies PlayerEnteredLocationEvent);

    if (result.encounter) {
      this.eventEmitter.emit('BattleFinished', {
        userId,
        characterId: result.characterId,
        monsterId: result.encounter.monster.id,
        victory: result.encounter.victory,
        xpGained: result.encounter.xpGained,
      } satisfies BattleFinishedEvent);

      if (result.encounter.leveledUp) {
        this.eventEmitter.emit('PlayerLevelUp', {
          userId,
          characterId: result.characterId,
          newLevel: result.newLevel,
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
    }

    return {
      city: { id: destination.id, name: destination.name },
      encounter: result.encounter,
      character: result.updated,
    };
  }
}
