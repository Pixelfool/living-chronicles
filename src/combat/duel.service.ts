import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CharacterService } from '../character/character.service';
import { ContentService } from '../content/content.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { describeDuel, resolveDuel } from './duel-resolver';
import {
  computeGoldTransfer,
  isOnRepeatAttackCooldown,
  isSwornDuelist,
  levelGapAllowed,
  renounceCompletesAt,
} from './duel-eligibility';

// Rennick already exists as Ashford's monster hunter (M9 content) - a
// bounty hunter who also administers the duelist's oath is a small, free
// bit of characterization, not a new content type (M10 design discussion:
// no schema change needed for a single oath-giver).
const OATH_GIVER_NPC_ID = 'rennick';

export interface DuelistOathSwornEvent {
  userId: string;
  characterId: string;
}

export interface DuelistOathRenouncedEvent {
  userId: string;
  characterId: string;
}

export interface DuelFinishedEvent {
  attackerUserId: string;
  attackerCharacterId: string;
  defenderUserId: string;
  defenderCharacterId: string;
  winnerCharacterId: string | null;
  goldTransferred: number;
}

export interface DuelStatus {
  sworn: boolean;
  renouncing: boolean;
  renounceCompletesAt: Date | null;
}

export interface DuelTargetEntry {
  characterId: string;
  name: string;
  level: number;
}

@Injectable()
export class DuelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly content: ContentService,
    private readonly character: CharacterService,
    private readonly inventory: InventoryService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private oathGiverCityId(): string {
    const npc = this.content.findNpc(OATH_GIVER_NPC_ID);
    if (!npc) {
      throw new Error(
        `content pack is missing the oath-giver npc "${OATH_GIVER_NPC_ID}"`,
      );
    }
    return npc.cityId;
  }

  /**
   * Lazily finalizes a lapsed renouncement (M10 design discussion: same
   * lazy-resolution idiom as CraftingService.resolveDueJob - nothing
   * polls this on a timer, it's finalized the next time anything touches
   * this character's duel status). Must run before every other duel
   * action so a character whose renouncement has genuinely lapsed is
   * always re-swearable, not stuck.
   */
  private async finalizeLapsedRenounce(characterId: string): Promise<void> {
    const character = await this.prisma.character.findUniqueOrThrow({
      where: { id: characterId },
    });
    if (
      !character.duelistOathSwornAt ||
      !character.duelistOathRenounceRequestedAt ||
      isSwornDuelist(character, new Date())
    ) {
      return;
    }

    const { count } = await this.prisma.character.updateMany({
      where: {
        id: characterId,
        duelistOathRenounceRequestedAt:
          character.duelistOathRenounceRequestedAt,
      },
      data: {
        duelistOathSwornAt: null,
        duelistOathRenounceRequestedAt: null,
      },
    });
    if (count > 0) {
      this.eventEmitter.emit('DuelistOathRenounced', {
        userId: character.userId,
        characterId: character.id,
      } satisfies DuelistOathRenouncedEvent);
    }
  }

  async getStatus(userId: string): Promise<DuelStatus> {
    const character = await this.character.getForUser(userId);
    await this.finalizeLapsedRenounce(character.id);
    const fresh = await this.prisma.character.findUniqueOrThrow({
      where: { id: character.id },
    });
    return {
      sworn: isSwornDuelist(fresh, new Date()),
      renouncing: fresh.duelistOathRenounceRequestedAt !== null,
      renounceCompletesAt: fresh.duelistOathRenounceRequestedAt
        ? renounceCompletesAt(fresh.duelistOathRenounceRequestedAt)
        : null,
    };
  }

  async swearOath(userId: string): Promise<DuelStatus> {
    const character = await this.character.getForUser(userId);
    await this.finalizeLapsedRenounce(character.id);

    if (character.currentCityId !== this.oathGiverCityId()) {
      throw new BadRequestException(
        'you need to be where the oath is sworn to take it',
      );
    }

    const { count } = await this.prisma.character.updateMany({
      where: { id: character.id, duelistOathSwornAt: null },
      data: { duelistOathSwornAt: new Date() },
    });
    if (count === 0) {
      throw new ConflictException('you have already sworn the oath');
    }

    this.eventEmitter.emit('DuelistOathSworn', {
      userId,
      characterId: character.id,
    } satisfies DuelistOathSwornEvent);

    return this.getStatus(userId);
  }

  async requestRenounce(userId: string): Promise<DuelStatus> {
    const character = await this.character.getForUser(userId);
    await this.finalizeLapsedRenounce(character.id);

    if (character.currentCityId !== this.oathGiverCityId()) {
      throw new BadRequestException(
        'you need to be where you swore the oath to renounce it',
      );
    }

    const { count } = await this.prisma.character.updateMany({
      where: {
        id: character.id,
        duelistOathSwornAt: { not: null },
        duelistOathRenounceRequestedAt: null,
      },
      data: { duelistOathRenounceRequestedAt: new Date() },
    });
    if (count === 0) {
      throw new ConflictException(
        'you are not a sworn duelist, or you have already renounced the oath',
      );
    }

    return this.getStatus(userId);
  }

  private async mostRecentDuelBetween(
    aCharacterId: string,
    bCharacterId: string,
  ) {
    return this.prisma.duel.findFirst({
      where: {
        OR: [
          {
            attackerCharacterId: aCharacterId,
            defenderCharacterId: bCharacterId,
          },
          {
            attackerCharacterId: bCharacterId,
            defenderCharacterId: aCharacterId,
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { winnerCharacterId: true, createdAt: true },
    });
  }

  async listTargets(userId: string): Promise<DuelTargetEntry[]> {
    const character = await this.character.getForUser(userId);
    await this.finalizeLapsedRenounce(character.id);
    const self = await this.prisma.character.findUniqueOrThrow({
      where: { id: character.id },
    });
    if (!isSwornDuelist(self, new Date())) {
      throw new ForbiddenException('swear the oath before you can duel');
    }

    // Deliberately doesn't expose gold or exact HP (M10 design
    // discussion: showing them turns target selection into a spreadsheet
    // optimization - "who's richest and weakest" - instead of a decision
    // grounded in who you actually have a reason to fight).
    const candidates = await this.prisma.character.findMany({
      where: { id: { not: self.id }, duelistOathSwornAt: { not: null } },
    });

    const targets: DuelTargetEntry[] = [];
    for (const candidate of candidates) {
      if (!isSwornDuelist(candidate, new Date())) {
        continue;
      }
      if (!levelGapAllowed(self.level, candidate.level)) {
        continue;
      }
      const mostRecent = await this.mostRecentDuelBetween(
        self.id,
        candidate.id,
      );
      if (isOnRepeatAttackCooldown(mostRecent, self.id, new Date())) {
        continue;
      }
      targets.push({
        characterId: candidate.id,
        name: candidate.name,
        level: candidate.level,
      });
    }
    return targets;
  }

  async myHistory(userId: string) {
    const character = await this.character.getForUser(userId);
    const duels = await this.prisma.duel.findMany({
      where: {
        OR: [
          { attackerCharacterId: character.id },
          { defenderCharacterId: character.id },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return duels.map((duel) => {
      const asAttacker = duel.attackerCharacterId === character.id;
      return {
        opponentCharacterId: asAttacker
          ? duel.defenderCharacterId
          : duel.attackerCharacterId,
        role: asAttacker ? ('attacker' as const) : ('defender' as const),
        outcome:
          duel.winnerCharacterId === null
            ? ('draw' as const)
            : duel.winnerCharacterId === character.id
              ? ('won' as const)
              : ('lost' as const),
        goldTransferred: duel.goldTransferred,
        createdAt: duel.createdAt,
      };
    });
  }

  async attack(userId: string, defenderCharacterId: string) {
    const attackerChar = await this.character.getForUser(userId);
    if (attackerChar.id === defenderCharacterId) {
      throw new BadRequestException('you cannot duel yourself');
    }
    await this.finalizeLapsedRenounce(attackerChar.id);

    const defenderChar = await this.prisma.character.findUnique({
      where: { id: defenderCharacterId },
    });
    if (!defenderChar) {
      throw new NotFoundException('no such character');
    }
    await this.finalizeLapsedRenounce(defenderChar.id);

    // Fast-fail pre-checks only - re-validated against fresh, locked
    // reads inside the transaction below (same pattern as
    // world.service.ts's travel() and combat.service.ts's fight()).
    const attackerPrecheck = await this.prisma.character.findUniqueOrThrow({
      where: { id: attackerChar.id },
    });
    if (!isSwornDuelist(attackerPrecheck, new Date())) {
      throw new ForbiddenException('swear the oath before you can duel');
    }
    const defenderPrecheck = await this.prisma.character.findUniqueOrThrow({
      where: { id: defenderCharacterId },
    });
    if (!isSwornDuelist(defenderPrecheck, new Date())) {
      throw new ForbiddenException('that character is not a sworn duelist');
    }
    if (!levelGapAllowed(attackerPrecheck.level, defenderPrecheck.level)) {
      throw new ForbiddenException('that character is too far from your level');
    }
    const mostRecent = await this.mostRecentDuelBetween(
      attackerChar.id,
      defenderCharacterId,
    );
    if (isOnRepeatAttackCooldown(mostRecent, attackerChar.id, new Date())) {
      throw new ForbiddenException(
        'you recently beat this character - give them a rest before challenging them again',
      );
    }

    // Fixed lock order between the two character rows, regardless of
    // attacker/defender role, so two characters dueling each other at the
    // same moment can never deadlock (M10 design discussion - the first
    // time this codebase locks two independently-selected character rows
    // in a single transaction).
    const [firstId, secondId] = [attackerChar.id, defenderCharacterId].sort();

    const result = await this.prisma.$transaction(async (tx) => {
      // Claiming the action point up front both gates on it atomically
      // AND takes a row lock for the rest of this transaction on the
      // attacker - same idiom as combat.service.ts's fight().
      const { count } = await tx.character.updateMany({
        where: { id: attackerChar.id, actionPoints: { gte: 1 } },
        data: { actionPoints: { decrement: 1 } },
      });
      if (count === 0) {
        throw new ConflictException(
          'not enough action points to duel - rest and come back later',
        );
      }

      const rows = await Promise.all(
        [firstId, secondId].map((id) =>
          tx.character.findUniqueOrThrow({ where: { id } }),
        ),
      );
      const attackerRow = rows.find((c) => c.id === attackerChar.id)!;
      const defenderRow = rows.find((c) => c.id === defenderCharacterId)!;

      if (!isSwornDuelist(attackerRow, new Date())) {
        throw new ConflictException('your oath status changed - try again');
      }
      if (!isSwornDuelist(defenderRow, new Date())) {
        throw new ConflictException('their oath status changed - try again');
      }

      const attackerEquipped = await tx.itemInstance.findMany({
        where: { characterId: attackerRow.id, equipped: true },
      });
      const defenderEquipped = await tx.itemInstance.findMany({
        where: { characterId: defenderRow.id, equipped: true },
      });
      const attackerBonuses =
        this.inventory.sumEquipmentBonuses(attackerEquipped);
      const defenderBonuses =
        this.inventory.sumEquipmentBonuses(defenderEquipped);

      const outcome = resolveDuel(
        { hp: attackerRow.hp, body: attackerRow.body, ...attackerBonuses },
        { hp: defenderRow.hp, body: defenderRow.body, ...defenderBonuses },
      );

      const winnerCharacterId =
        outcome.winner === 'attacker'
          ? attackerRow.id
          : outcome.winner === 'defender'
            ? defenderRow.id
            : null;
      const loserGold =
        outcome.winner === 'attacker'
          ? defenderRow.gold
          : outcome.winner === 'defender'
            ? attackerRow.gold
            : 0;
      const goldTransferred =
        outcome.winner === 'draw' ? 0 : computeGoldTransfer(loserGold);
      const attackerGoldDelta =
        outcome.winner === 'attacker'
          ? goldTransferred
          : outcome.winner === 'defender'
            ? -goldTransferred
            : 0;

      // Writes happen in the same fixed order the lock was acquired in,
      // not attacker-then-defender.
      for (const id of [firstId, secondId]) {
        if (id === attackerRow.id) {
          await tx.character.update({
            where: { id },
            data: {
              hp: outcome.attackerHpRemaining,
              gold: { increment: attackerGoldDelta },
            },
          });
        } else {
          await tx.character.update({
            where: { id },
            data: {
              hp: outcome.defenderHpRemaining,
              gold: { increment: -attackerGoldDelta },
            },
          });
        }
      }

      const duel = await tx.duel.create({
        data: {
          attackerCharacterId: attackerRow.id,
          defenderCharacterId: defenderRow.id,
          winnerCharacterId,
          attackerHpAfter: outcome.attackerHpRemaining,
          defenderHpAfter: outcome.defenderHpRemaining,
          goldTransferred,
        },
      });

      return { outcome, duel, attackerRow, defenderRow };
    });

    this.eventEmitter.emit('DuelFinished', {
      attackerUserId: attackerChar.userId,
      attackerCharacterId: attackerChar.id,
      defenderUserId: defenderChar.userId,
      defenderCharacterId,
      winnerCharacterId: result.duel.winnerCharacterId,
      goldTransferred: result.duel.goldTransferred,
    } satisfies DuelFinishedEvent);

    return {
      log: describeDuel(result.outcome, attackerChar.name, defenderChar.name),
      winner: result.outcome.winner,
      attackerHpRemaining: result.outcome.attackerHpRemaining,
      defenderHpRemaining: result.outcome.defenderHpRemaining,
      goldTransferred: result.duel.goldTransferred,
    };
  }
}
