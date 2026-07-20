import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { applyXpGain } from '../character/leveling';
import { PrismaService } from '../prisma/prisma.service';
import { describeBattle, resolveBattle } from './combat-resolver';
import { findMonster, MONSTERS } from './monsters';

@Injectable()
export class CombatService {
  constructor(private readonly prisma: PrismaService) {}

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

    const updated = await this.prisma.character.update({
      where: { userId },
      data: {
        hp: newHp,
        maxHp: xpResult.maxHp,
        level: xpResult.level,
        xp: xpResult.xp,
        actionPoints: { decrement: 1 },
      },
    });

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
