import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ContentService } from '../content/content.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolveOutcome } from './world-event-resolver';

export interface WorldEventActivatedEvent {
  instanceId: string;
  cityId: string;
  definitionId: string;
}

export interface WorldEventResolvedEvent {
  instanceId: string;
  cityId: string;
  definitionId: string;
  outcomeTag: string;
}

/**
 * Same shape as RegenTask - bulk findMany + pure decision + batched
 * updates - but the first one in this codebase advancing world state
 * with nobody having taken an action (see WorldEventInstance's schema
 * comment in prisma/schema.prisma). Deliberately not transactional
 * per-row: nothing else writes `phase` on these rows between reads here
 * and the update, the same reasoning RegenTask already relies on.
 */
@Injectable()
export class WorldEventsTickTask {
  private readonly logger = new Logger(WorldEventsTickTask.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly content: ContentService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    const now = new Date();

    const emerging = await this.prisma.worldEventInstance.findMany({
      where: { phase: 'EMERGING', activeAt: { lte: now } },
    });
    for (const instance of emerging) {
      await this.prisma.worldEventInstance.update({
        where: { id: instance.id },
        data: { phase: 'ACTIVE' },
      });
      this.eventEmitter.emit('WorldEventActivated', {
        instanceId: instance.id,
        cityId: instance.cityId,
        definitionId: instance.definitionId,
      } satisfies WorldEventActivatedEvent);
    }

    const active = await this.prisma.worldEventInstance.findMany({
      where: { phase: 'ACTIVE', resolvesAt: { lte: now } },
    });
    for (const instance of active) {
      const definition = this.content.findWorldEvent(instance.definitionId);
      if (!definition) {
        this.logger.error(
          `world event instance ${instance.id} references unknown definition "${instance.definitionId}" - leaving unresolved`,
        );
        continue;
      }
      const outcomeTag = resolveOutcome(
        instance.fightScore,
        instance.supportScore,
        definition.outcomes,
      );
      await this.prisma.worldEventInstance.update({
        where: { id: instance.id },
        data: {
          phase: 'RESOLVED',
          resolvedOutcome: outcomeTag,
          resolvedAt: now,
        },
      });
      this.eventEmitter.emit('WorldEventResolved', {
        instanceId: instance.id,
        cityId: instance.cityId,
        definitionId: instance.definitionId,
        outcomeTag,
      } satisfies WorldEventResolvedEvent);
    }

    if (emerging.length > 0 || active.length > 0) {
      this.logger.debug(
        `Activated ${emerging.length}, resolved ${active.length} world event instance(s)`,
      );
    }
  }
}
