import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { computeRegenTick } from './regen';

@Injectable()
export class RegenTask {
  private readonly logger = new Logger(RegenTask.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async regenerate(): Promise<void> {
    const characters = await this.prisma.character.findMany();

    const updates = characters
      .map((character) => ({
        id: character.id,
        tick: computeRegenTick(character),
      }))
      .filter(
        (
          entry,
        ): entry is {
          id: string;
          tick: { hp: number; actionPoints: number };
        } => entry.tick !== null,
      )
      .map((entry) =>
        this.prisma.character.update({
          where: { id: entry.id },
          data: { hp: entry.tick.hp, actionPoints: entry.tick.actionPoints },
        }),
      );

    if (updates.length > 0) {
      await Promise.all(updates);
      this.logger.debug(`Regenerated ${updates.length} character(s)`);
    }
  }
}
