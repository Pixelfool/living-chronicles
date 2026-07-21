import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MutesService } from './mutes.service';

const THREAD_LIMIT = 50;

export interface PrivateMessageSentEvent {
  messageId: string;
  senderId: string;
  recipientId: string;
}

export interface PrivateMessageView {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
}

export interface ConversationSummary {
  userId: string;
  username: string;
  lastMessage: string;
  lastMessageAt: Date;
  unreadCount: number;
}

@Injectable()
export class PrivateMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mutes: MutesService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async send(
    senderId: string,
    targetUsername: string,
    body: string,
  ): Promise<PrivateMessageView> {
    const target = await this.prisma.user.findUnique({
      where: { username: targetUsername },
    });
    if (!target) {
      throw new NotFoundException('no such player');
    }
    if (target.id === senderId) {
      throw new BadRequestException('cannot message yourself');
    }

    if (await this.mutes.isMuted(target.id, senderId)) {
      throw new ForbiddenException(
        'this player is not accepting your messages',
      );
    }

    const message = await this.prisma.privateMessage.create({
      data: { senderId, recipientId: target.id, body },
    });

    this.eventEmitter.emit('PrivateMessageSent', {
      messageId: message.id,
      senderId,
      recipientId: target.id,
    } satisfies PrivateMessageSentEvent);

    return message;
  }

  /**
   * One row per conversation the user is in, not per message - a naive
   * "scan the N most recent messages and group them" approach silently
   * drops whole conversations once enough *other* conversations are more
   * active than the scan window, which is exactly the kind of bug that's
   * invisible in a two-person test and real the moment someone has more
   * than a couple of active friends. DISTINCT ON is the standard Postgres
   * idiom for "latest row per group" and keeps this to two indexed
   * queries, bounded by conversation count, not message count.
   */
  async inbox(userId: string): Promise<ConversationSummary[]> {
    const lastMessages = await this.prisma.$queryRaw<
      { correspondentId: string; body: string; createdAt: Date }[]
    >(Prisma.sql`
      SELECT DISTINCT ON (correspondent_id)
        correspondent_id AS "correspondentId",
        body,
        "createdAt"
      FROM (
        SELECT
          CASE WHEN "senderId" = ${userId} THEN "recipientId" ELSE "senderId" END
            AS correspondent_id,
          body,
          "createdAt"
        FROM private_messages
        WHERE "senderId" = ${userId} OR "recipientId" = ${userId}
      ) conversations
      ORDER BY correspondent_id, "createdAt" DESC
    `);

    if (lastMessages.length === 0) {
      return [];
    }

    const unreadCounts = await this.prisma.$queryRaw<
      { correspondentId: string; unreadCount: bigint }[]
    >(Prisma.sql`
      SELECT "senderId" AS "correspondentId", COUNT(*) AS "unreadCount"
      FROM private_messages
      WHERE "recipientId" = ${userId} AND "readAt" IS NULL
      GROUP BY "senderId"
    `);
    const unreadByCorrespondent = new Map(
      unreadCounts.map((u) => [u.correspondentId, Number(u.unreadCount)]),
    );

    const correspondentIds = lastMessages.map((m) => m.correspondentId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: correspondentIds } },
      select: { id: true, username: true },
    });
    const usernameById = new Map(users.map((u) => [u.id, u.username]));

    return lastMessages
      .map((m) => ({
        userId: m.correspondentId,
        username: usernameById.get(m.correspondentId) ?? 'unknown player',
        lastMessage: m.body,
        lastMessageAt: m.createdAt,
        unreadCount: unreadByCorrespondent.get(m.correspondentId) ?? 0,
      }))
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
  }

  async thread(
    userId: string,
    otherUserId: string,
  ): Promise<PrivateMessageView[]> {
    const messages = await this.prisma.privateMessage.findMany({
      where: {
        OR: [
          { senderId: userId, recipientId: otherUserId },
          { senderId: otherUserId, recipientId: userId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: THREAD_LIMIT,
    });

    return messages.reverse();
  }

  async markRead(userId: string, otherUserId: string) {
    await this.prisma.privateMessage.updateMany({
      where: { senderId: otherUserId, recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }
}
