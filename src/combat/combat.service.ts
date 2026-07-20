import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { applyXpGain } from '../character/leveling';
import { PrismaService } from '../prisma/prisma.service';
import { describeBattle, resolveBattle } from './combat-resolver';
import { findMonster, MONSTERS } from './monsters';

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
    private readonly eventEmitter: EventEmitter2,
  ) {}

  listMonsters() {
    return MONSTERS;
  }

  async fight(userId: string, monsterId: string) {
    const monster = findMonster(monsterId);
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

    const outcome = resolveBattle(
      { hp: character.hp, body: character.body },
      monster,
    );

    const xpGained = outcome.victory ? monster.xpReward : 0;
    const xpResult = applyXpGain(
      { level: character.level, xp: character.xp, body: character.body },
      xpGained,
    );

    const newHp = xpResult.leveledUp
      ? xpResult.maxHp
      : Math.min(outcome.playerHpRemaining, xpResult.maxHp);

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
