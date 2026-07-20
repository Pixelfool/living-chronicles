import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { MutesService } from './mutes.service';

export const GLOBAL_CHANNEL = 'global';
const HISTORY_LIMIT = 50;

export interface ChatMessagePostedEvent {
  messageId: string;
  senderId: string;
  channel: string;
}

export interface ChatMessageView {
  id: string;
  senderId: string;
  username: string;
  body: string;
  createdAt: Date;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mutes: MutesService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findChatIdentity(
    userId: string,
  ): Promise<{ id: string; username: string } | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true },
    });
  }

  async postMessage(
    senderId: string,
    username: string,
    body: string,
  ): Promise<ChatMessageView> {
    const message = await this.prisma.chatMessage.create({
      data: { senderId, channel: GLOBAL_CHANNEL, body },
    });

    this.eventEmitter.emit('ChatMessagePosted', {
      messageId: message.id,
      senderId,
      channel: GLOBAL_CHANNEL,
    } satisfies ChatMessagePostedEvent);

    return {
      id: message.id,
      senderId,
      username,
      body: message.body,
      createdAt: message.createdAt,
    };
  }

  /** Most recent messages, with anything from a sender the viewer has muted filtered out. */
  async recentHistory(viewerUserId: string): Promise<ChatMessageView[]> {
    const mutedIds = await this.mutes.listMutedByViewer(viewerUserId);

    const messages = await this.prisma.chatMessage.findMany({
      where: {
        channel: GLOBAL_CHANNEL,
        ...(mutedIds.size > 0 ? { senderId: { notIn: [...mutedIds] } } : {}),
      },
      include: { sender: { select: { username: true } } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
    });

    return messages.reverse().map((m) => ({
      id: m.id,
      senderId: m.senderId,
      username: m.sender.username,
      body: m.body,
      createdAt: m.createdAt,
    }));
  }
}
