import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContentService } from '../content/content.service';
import { PrismaService } from '../prisma/prisma.service';
import { describeBattle, resolveFight } from './combat-resolver';

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

    const { outcome, xpGained, xpResult, newHp } = resolveFight(
      character,
      monster,
    );

    // Conditional on actionPoints still being >= 1 at write time - closes
    // a TOCTOU race where two concurrent fights could both pass the check
    // above and both decrement, driving actionPoints negative.
    const { count } = await this.prisma.character.updateMany({
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

    const updated = await this.prisma.character.findUniqueOrThrow({
      where: { userId },
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

    return {
      victory: outcome.victory,
      monster: { id: monster.id, name: monster.name },
      log: describeBattle(outcome, monster.name),
      xpGained,
      leveledUp: xpResult.leveledUp,
      character: updated,
    };
  }
}
