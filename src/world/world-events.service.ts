import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CharacterService } from '../character/character.service';
import { describeBattle, resolveFight } from '../combat/combat-resolver';
import {
  BattleFinishedEvent,
  PlayerLevelUpEvent,
} from '../combat/combat.service';
import { rollLoot } from '../combat/loot';
import { ContentService } from '../content/content.service';
import { WorldEventDefinition } from '../content/schemas';
import { AuditLogService } from '../economy/audit-log.service';
import {
  InventoryService,
  ItemAcquiredEvent,
} from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { assessMood } from './world-event-resolver';

/**
 * How many combined responses "count" before the mood tips from
 * STRUGGLING to HOLDING. Not authored per-definition (M12 design
 * discussion §"first implementation pass" - keeping this pass small);
 * a fixed engine constant for now.
 */
const MOOD_THRESHOLD = 10;

export type WorldEventView =
  | { phase: 'NONE' }
  | { phase: 'EMERGING'; name: string; telegraph: string }
  | {
      phase: 'ACTIVE';
      name: string;
      mood: 'STRUGGLING' | 'HOLDING';
      flavor: string;
      responseTypes: string[];
    }
  | { phase: 'RESOLVED'; name: string; residue: string; flavor: string };

@Injectable()
export class WorldEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly content: ContentService,
    private readonly character: CharacterService,
    private readonly inventory: InventoryService,
    private readonly auditLog: AuditLogService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * The "world tells its own story" read (M12 design discussion). Never
   * exposes fightScore/supportScore - only a closed mood tier during
   * ACTIVE, and only the authored residue text once RESOLVED, so there is
   * nothing here for a player to optimize against.
   */
  async getForCity(cityId: string): Promise<WorldEventView> {
    const instance = await this.currentOrMostRecentResolved(cityId);
    if (!instance) {
      return { phase: 'NONE' };
    }
    const definition = this.getDefinitionOrThrow(instance.definitionId);

    if (instance.phase === 'EMERGING') {
      return {
        phase: 'EMERGING',
        name: definition.name,
        telegraph: definition.telegraph,
      };
    }

    if (instance.phase === 'ACTIVE') {
      const mood = assessMood(
        instance.fightScore,
        instance.supportScore,
        MOOD_THRESHOLD,
      );
      const pool = definition.moodFlavor[mood];
      return {
        phase: 'ACTIVE',
        name: definition.name,
        mood,
        flavor: pool[Math.floor(Math.random() * pool.length)],
        responseTypes: definition.responseTypes,
      };
    }

    const outcome = definition.outcomes.find(
      (candidate) => candidate.tag === instance.resolvedOutcome,
    );
    if (!outcome) {
      throw new Error(
        `resolved world event instance references unknown outcome tag "${instance.resolvedOutcome}"`,
      );
    }
    return {
      phase: 'RESOLVED',
      name: definition.name,
      residue: outcome.residue,
      flavor: outcome.flavor[Math.floor(Math.random() * outcome.flavor.length)],
    };
  }

  /**
   * Same shape as CombatService.fight()/DungeonsService's beat resolution
   * - a fight is a fight regardless of where it happens, so it emits the
   * same BattleFinished/PlayerLevelUp/ItemAcquired events. The only thing
   * specific to a world event is the anonymous fightScore increment,
   * which is never linked back to this character (M12 design discussion).
   */
  async fight(userId: string, cityId: string) {
    const instance = await this.getActiveInstanceOrThrow(cityId, 'FIGHT');
    const definition = this.getDefinitionOrThrow(instance.definitionId);
    if (!definition.monsterId) {
      throw new Error(
        `world event "${definition.id}" recognizes FIGHT but has no monsterId`,
      );
    }
    const monster = this.content.findMonster(definition.monsterId);
    if (!monster) {
      throw new Error(
        `world event "${definition.id}" references unknown monster "${definition.monsterId}"`,
      );
    }

    // Fast-fail pre-check, re-validated against a fresh read inside the
    // transaction below - same shape as DungeonsService.enter().
    const precheck = await this.character.getForUser(userId);
    if (precheck.currentCityId !== cityId) {
      throw new BadRequestException(
        'you need to be in this city to respond to this',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.character.updateMany({
        where: { userId, currentCityId: cityId, actionPoints: { gte: 1 } },
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

      // Conditional claim, not a blind update: the instance may have
      // been resolved by WorldEventsTickTask between the pre-check above
      // and this transaction. Gating on phase: 'ACTIVE' here means a
      // response that arrives just after resolution fails loudly instead
      // of silently incrementing a score nobody will ever read again -
      // the same conditional-claim idiom every other transactional write
      // in this codebase uses (architecture.md §4.4). The only trace a
      // successful response leaves anywhere is this anonymous aggregate
      // increment, never linked to characterId (Watch is not tracked,
      // and neither is who fought).
      const { count: scoreCount } = await tx.worldEventInstance.updateMany({
        where: { id: instance.id, phase: 'ACTIVE' },
        data: { fightScore: { increment: 1 } },
      });
      if (scoreCount === 0) {
        throw new ConflictException(
          'this moment has already passed - the situation has moved on',
        );
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
      log: describeBattle(result.outcome, monster.name),
      character: result.updated,
    };
  }

  /** Same conditional-claim shape as fight(), against gold instead of AP. */
  async support(userId: string, cityId: string) {
    const instance = await this.getActiveInstanceOrThrow(cityId, 'SUPPORT');
    const definition = this.getDefinitionOrThrow(instance.definitionId);
    if (!definition.supportCost) {
      throw new Error(
        `world event "${definition.id}" recognizes SUPPORT but has no supportCost`,
      );
    }
    const cost = definition.supportCost.gold;

    const precheck = await this.character.getForUser(userId);
    if (precheck.currentCityId !== cityId) {
      throw new BadRequestException(
        'you need to be in this city to respond to this',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.character.updateMany({
        where: { userId, currentCityId: cityId, gold: { gte: cost } },
        data: { gold: { decrement: cost } },
      });
      if (count === 0) {
        throw new ConflictException('not enough gold to support the defense');
      }

      // Same conditional-claim reasoning as fight(): the instance may
      // have resolved between the pre-check and here, in which case this
      // response no longer means anything and should fail loudly rather
      // than silently tally a score nobody will read again.
      const { count: scoreCount } = await tx.worldEventInstance.updateMany({
        where: { id: instance.id, phase: 'ACTIVE' },
        data: { supportScore: { increment: 1 } },
      });
      if (scoreCount === 0) {
        throw new ConflictException(
          'this moment has already passed - the situation has moved on',
        );
      }

      // Gold left circulation - the same economy-critical audit trail
      // every other gold sink writes (ShopsService.buy/sell,
      // TradesService.accept), which this response had been missing.
      await this.auditLog.record(tx, 'WorldEventSupport', userId, {
        cityId,
        definitionId: definition.id,
        instanceId: instance.id,
        gold: cost,
      });
    });

    const updated = await this.character.getForUser(userId);
    return { character: updated };
  }

  private async currentOrMostRecentResolved(cityId: string) {
    const current = await this.prisma.worldEventInstance.findFirst({
      where: { cityId, phase: { in: ['EMERGING', 'ACTIVE'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (current) {
      return current;
    }
    return this.prisma.worldEventInstance.findFirst({
      where: { cityId, phase: 'RESOLVED' },
      orderBy: { resolvedAt: 'desc' },
    });
  }

  private async getActiveInstanceOrThrow(
    cityId: string,
    responseType: 'FIGHT' | 'SUPPORT',
  ) {
    // findFirst with no orderBy and no DB-level uniqueness constraint:
    // deliberately unguarded against two simultaneous ACTIVE/EMERGING
    // instances for the same city (M12 code review). Unreachable today -
    // only the dev seed script creates instances - but the safeguard
    // belongs with whatever spawn-selection mechanism eventually could
    // create a second one, not here in advance of it
    // (build-plan-v1.md §4).
    const instance = await this.prisma.worldEventInstance.findFirst({
      where: { cityId, phase: 'ACTIVE' },
    });
    if (!instance) {
      throw new NotFoundException('nothing is currently unfolding here');
    }
    const definition = this.getDefinitionOrThrow(instance.definitionId);
    if (!definition.responseTypes.includes(responseType)) {
      throw new BadRequestException("this situation doesn't call for that");
    }
    return instance;
  }

  private getDefinitionOrThrow(id: string): WorldEventDefinition {
    const definition = this.content.findWorldEvent(id);
    if (!definition) {
      throw new Error(
        `world event instance references unknown definition "${id}"`,
      );
    }
    return definition;
  }
}
