import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { isUniqueConstraintViolation } from '../prisma/prisma.errors';
import { PrismaService } from '../prisma/prisma.service';

export interface FriendRequestSentEvent {
  requestId: string;
  requesterId: string;
  addresseeId: string;
}

export interface FriendRequestAcceptedEvent {
  requesterId: string;
  addresseeId: string;
}

export interface FriendEntry {
  requestId: string;
  userId: string;
  username: string;
}

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async sendRequest(userId: string, targetUsername: string) {
    const target = await this.prisma.user.findUnique({
      where: { username: targetUsername },
    });
    if (!target) {
      throw new NotFoundException('no such player');
    }
    if (target.id === userId) {
      throw new BadRequestException('cannot send a friend request to yourself');
    }

    const existing = await this.prisma.friendRequest.findFirst({
      where: {
        OR: [
          { requesterId: userId, addresseeId: target.id },
          { requesterId: target.id, addresseeId: userId },
        ],
        status: { in: ['PENDING', 'ACCEPTED'] },
      },
    });
    if (existing) {
      throw new ConflictException(
        existing.status === 'ACCEPTED'
          ? 'already friends with that player'
          : 'a friend request already exists between you two',
      );
    }

    let request;
    try {
      request = await this.prisma.friendRequest.create({
        data: { requesterId: userId, addresseeId: target.id },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          'a friend request already exists between you two',
        );
      }
      throw error;
    }

    this.eventEmitter.emit('FriendRequestSent', {
      requestId: request.id,
      requesterId: userId,
      addresseeId: target.id,
    } satisfies FriendRequestSentEvent);

    return request;
  }

  async respond(userId: string, requestId: string, accept: boolean) {
    const req = await this.prisma.friendRequest.findUnique({
      where: { id: requestId },
    });
    if (!req || req.addresseeId !== userId) {
      throw new NotFoundException('no such friend request');
    }
    if (req.status !== 'PENDING') {
      throw new ConflictException('this request has already been resolved');
    }

    const updated = await this.prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: accept ? 'ACCEPTED' : 'DECLINED' },
    });

    if (accept) {
      this.eventEmitter.emit('FriendRequestAccepted', {
        requesterId: req.requesterId,
        addresseeId: req.addresseeId,
      } satisfies FriendRequestAcceptedEvent);
    }

    return updated;
  }

  async list(userId: string): Promise<{
    friends: FriendEntry[];
    incoming: FriendEntry[];
    outgoing: FriendEntry[];
  }> {
    const requests = await this.prisma.friendRequest.findMany({
      where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
      include: { requester: true, addressee: true },
      orderBy: { createdAt: 'desc' },
    });

    const friends: FriendEntry[] = [];
    const incoming: FriendEntry[] = [];
    const outgoing: FriendEntry[] = [];

    for (const r of requests) {
      const other = r.requesterId === userId ? r.addressee : r.requester;
      const entry: FriendEntry = {
        requestId: r.id,
        userId: other.id,
        username: other.username,
      };
      if (r.status === 'ACCEPTED') {
        friends.push(entry);
      } else if (r.status === 'PENDING' && r.addresseeId === userId) {
        incoming.push(entry);
      } else if (r.status === 'PENDING' && r.requesterId === userId) {
        outgoing.push(entry);
      }
    }

    return { friends, incoming, outgoing };
  }

  async remove(userId: string, friendUserId: string) {
    const result = await this.prisma.friendRequest.deleteMany({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: userId, addresseeId: friendUserId },
          { requesterId: friendUserId, addresseeId: userId },
        ],
      },
    });
    if (result.count === 0) {
      throw new NotFoundException('not friends with that player');
    }
    return { success: true };
  }
}
