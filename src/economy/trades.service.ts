import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CharacterService } from '../character/character.service';
import { ContentService } from '../content/content.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';

export interface TradeOfferCreatedEvent {
  tradeId: string;
  fromUserId: string;
  toUserId: string;
}

export interface TradeCompletedEvent {
  tradeId: string;
  fromUserId: string;
  toUserId: string;
}

export interface TradeItemSummary {
  itemInstanceId: string;
  itemId: string;
  name: string;
}

export interface TradeOfferView {
  id: string;
  fromUserId: string;
  fromUsername: string;
  toUserId: string;
  toUsername: string;
  offeredItems: TradeItemSummary[];
  offeredGold: number;
  requestedGold: number;
  status: string;
  createdAt: Date;
}

@Injectable()
export class TradesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly content: ContentService,
    private readonly character: CharacterService,
    private readonly auditLog: AuditLogService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async describeOffers(
    offers: {
      id: string;
      fromUserId: string;
      toUserId: string;
      offeredItemInstanceIds: string[];
      offeredGold: number;
      requestedGold: number;
      status: string;
      createdAt: Date;
    }[],
  ): Promise<TradeOfferView[]> {
    const userIds = [
      ...new Set(offers.flatMap((o) => [o.fromUserId, o.toUserId])),
    ];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true },
    });
    const usernameById = new Map(users.map((u) => [u.id, u.username]));

    const allInstanceIds = offers.flatMap((o) => o.offeredItemInstanceIds);
    const instances =
      allInstanceIds.length > 0
        ? await this.prisma.itemInstance.findMany({
            where: { id: { in: allInstanceIds } },
          })
        : [];
    const instanceById = new Map(instances.map((i) => [i.id, i]));

    return offers.map((o) => ({
      id: o.id,
      fromUserId: o.fromUserId,
      fromUsername: usernameById.get(o.fromUserId) ?? 'unknown player',
      toUserId: o.toUserId,
      toUsername: usernameById.get(o.toUserId) ?? 'unknown player',
      offeredItems: o.offeredItemInstanceIds
        .map((id) => instanceById.get(id))
        .filter((instance) => instance !== undefined)
        .map((instance) => ({
          itemInstanceId: instance.id,
          itemId: instance.itemId,
          name: this.content.findItem(instance.itemId)?.name ?? instance.itemId,
        })),
      offeredGold: o.offeredGold,
      requestedGold: o.requestedGold,
      status: o.status,
      createdAt: o.createdAt,
    }));
  }

  async create(
    fromUserId: string,
    toUsername: string,
    offeredItemInstanceIds: string[],
    offeredGold: number,
    requestedGold: number,
  ) {
    const target = await this.prisma.user.findUnique({
      where: { username: toUsername },
    });
    if (!target) {
      throw new NotFoundException('no such player');
    }
    if (target.id === fromUserId) {
      throw new BadRequestException('cannot trade with yourself');
    }

    const fromCharacter = await this.character.getForUser(fromUserId);
    await this.character.getForUser(target.id);

    if (offeredGold > fromCharacter.gold) {
      throw new BadRequestException('you do not have that much gold to offer');
    }

    if (offeredItemInstanceIds.length > 0) {
      const owned = await this.prisma.itemInstance.count({
        where: {
          id: { in: offeredItemInstanceIds },
          characterId: fromCharacter.id,
        },
      });
      if (owned !== offeredItemInstanceIds.length) {
        throw new BadRequestException(
          "you don't own one or more of the items you're offering",
        );
      }
    }

    const offer = await this.prisma.tradeOffer.create({
      data: {
        fromUserId,
        toUserId: target.id,
        offeredItemInstanceIds,
        offeredGold,
        requestedGold,
      },
    });

    this.eventEmitter.emit('TradeOfferCreated', {
      tradeId: offer.id,
      fromUserId,
      toUserId: target.id,
    } satisfies TradeOfferCreatedEvent);

    return offer;
  }

  async list(userId: string): Promise<{
    incoming: TradeOfferView[];
    outgoing: TradeOfferView[];
  }> {
    const offers = await this.prisma.tradeOffer.findMany({
      where: {
        status: 'PENDING',
        OR: [{ fromUserId: userId }, { toUserId: userId }],
      },
      orderBy: { createdAt: 'desc' },
    });

    const described = await this.describeOffers(offers);
    return {
      incoming: described.filter((o) => o.toUserId === userId),
      outgoing: described.filter((o) => o.fromUserId === userId),
    };
  }

  async cancel(userId: string, tradeId: string) {
    const { count } = await this.prisma.tradeOffer.updateMany({
      where: { id: tradeId, fromUserId: userId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    if (count === 0) {
      throw new NotFoundException('no such pending trade offer');
    }
    return { success: true };
  }

  async decline(userId: string, tradeId: string) {
    const { count } = await this.prisma.tradeOffer.updateMany({
      where: { id: tradeId, toUserId: userId, status: 'PENDING' },
      data: { status: 'DECLINED' },
    });
    if (count === 0) {
      throw new NotFoundException('no such pending trade offer');
    }
    return { success: true };
  }

  async accept(userId: string, tradeId: string) {
    const offer = await this.prisma.tradeOffer.findUnique({
      where: { id: tradeId },
    });
    if (!offer || offer.toUserId !== userId) {
      throw new NotFoundException('no such pending trade offer');
    }
    if (offer.status !== 'PENDING') {
      throw new ConflictException('this offer has already been resolved');
    }

    const fromCharacter = await this.character.getForUser(offer.fromUserId);
    const toCharacter = await this.character.getForUser(offer.toUserId);

    await this.prisma.$transaction(async (tx) => {
      const { count: claimed } = await tx.tradeOffer.updateMany({
        where: { id: tradeId, status: 'PENDING' },
        data: { status: 'ACCEPTED' },
      });
      if (claimed === 0) {
        throw new ConflictException('this offer has already been resolved');
      }

      // Everything below re-validates against fresh state - the offer may
      // have gone stale since it was created (items sold/traded away,
      // gold spent elsewhere).
      if (offer.offeredItemInstanceIds.length > 0) {
        const stillOwned = await tx.itemInstance.count({
          where: {
            id: { in: offer.offeredItemInstanceIds },
            characterId: fromCharacter.id,
          },
        });
        if (stillOwned !== offer.offeredItemInstanceIds.length) {
          throw new ConflictException(
            'the sender no longer has all the offered items',
          );
        }
      }

      const { count: fromGoldClaimed } = await tx.character.updateMany({
        where: { id: fromCharacter.id, gold: { gte: offer.offeredGold } },
        data: { gold: { decrement: offer.offeredGold } },
      });
      if (fromGoldClaimed === 0) {
        throw new ConflictException('the sender no longer has enough gold');
      }

      const { count: toGoldClaimed } = await tx.character.updateMany({
        where: { id: toCharacter.id, gold: { gte: offer.requestedGold } },
        data: { gold: { decrement: offer.requestedGold } },
      });
      if (toGoldClaimed === 0) {
        throw new ConflictException(
          'you do not have enough gold to accept this offer',
        );
      }

      await tx.character.update({
        where: { id: fromCharacter.id },
        data: { gold: { increment: offer.requestedGold } },
      });
      await tx.character.update({
        where: { id: toCharacter.id },
        data: { gold: { increment: offer.offeredGold } },
      });

      if (offer.offeredItemInstanceIds.length > 0) {
        await tx.itemInstance.updateMany({
          where: { id: { in: offer.offeredItemInstanceIds } },
          data: { characterId: toCharacter.id, equipped: false },
        });
      }

      await this.auditLog.record(tx, 'TradeCompleted', userId, {
        tradeId,
        fromUserId: offer.fromUserId,
        toUserId: offer.toUserId,
        offeredItemInstanceIds: offer.offeredItemInstanceIds,
        offeredGold: offer.offeredGold,
        requestedGold: offer.requestedGold,
      });
    });

    this.eventEmitter.emit('TradeCompleted', {
      tradeId,
      fromUserId: offer.fromUserId,
      toUserId: offer.toUserId,
    } satisfies TradeCompletedEvent);

    return { success: true };
  }
}
