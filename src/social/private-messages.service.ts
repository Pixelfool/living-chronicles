import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { MutesService } from './mutes.service';

const THREAD_LIMIT = 50;
const INBOX_SCAN_LIMIT = 200;

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

  async inbox(userId: string): Promise<ConversationSummary[]> {
    const messages = await this.prisma.privateMessage.findMany({
      where: { OR: [{ senderId: userId }, { recipientId: userId }] },
      include: {
        sender: { select: { username: true } },
        recipient: { select: { username: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: INBOX_SCAN_LIMIT,
    });

    const conversations = new Map<string, ConversationSummary>();

    for (const m of messages) {
      const isFromMe = m.senderId === userId;
      const otherId = isFromMe ? m.recipientId : m.senderId;
      const otherUsername = isFromMe ? m.recipient.username : m.sender.username;
      const unread = !isFromMe && m.readAt === null;

      const existing = conversations.get(otherId);
      if (!existing) {
        conversations.set(otherId, {
          userId: otherId,
          username: otherUsername,
          lastMessage: m.body,
          lastMessageAt: m.createdAt,
          unreadCount: unread ? 1 : 0,
        });
      } else if (unread) {
        existing.unreadCount += 1;
      }
    }

    return [...conversations.values()].sort(
      (a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime(),
    );
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
