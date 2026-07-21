import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GuildRole } from '@prisma/client';
import { isUniqueConstraintViolation } from '../prisma/prisma.errors';
import { PrismaService } from '../prisma/prisma.service';
import { AssignableRole } from './dto/set-member-role.dto';

export interface GuildCreatedEvent {
  guildId: string;
  founderId: string;
}

export interface GuildInviteSentEvent {
  guildId: string;
  invitedUserId: string;
  invitedById: string;
}

export interface GuildMemberJoinedEvent {
  guildId: string;
  userId: string;
}

export interface GuildMemberLeftEvent {
  guildId: string;
  userId: string;
  reason: 'left' | 'kicked';
}

export interface GuildDisbandedEvent {
  guildId: string;
}

export interface GuildLeadershipTransferredEvent {
  guildId: string;
  previousLeaderId: string;
  newLeaderId: string;
}

@Injectable()
export class GuildsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async membershipFor(userId: string) {
    return this.prisma.guildMember.findUnique({ where: { userId } });
  }

  private async requireMembership(userId: string) {
    const membership = await this.membershipFor(userId);
    if (!membership) {
      throw new NotFoundException('you are not in a guild');
    }
    return membership;
  }

  async createGuild(userId: string, name: string, tag: string) {
    const existing = await this.membershipFor(userId);
    if (existing) {
      throw new ConflictException('you are already in a guild');
    }

    try {
      const guild = await this.prisma.$transaction(async (tx) => {
        const created = await tx.guild.create({ data: { name, tag } });

        // createMany + skipDuplicates (same idiom as respondInvite below)
        // turns a concurrent double-submit race on the userId-unique
        // GuildMember row into an explicit, correctly-labeled conflict
        // here, rather than letting it fall through to the catch below
        // and get misreported as a guild name/tag collision.
        const { count } = await tx.guildMember.createMany({
          data: [{ guildId: created.id, userId, role: GuildRole.LEADER }],
          skipDuplicates: true,
        });
        if (count === 0) {
          throw new ConflictException('you are already in a guild');
        }

        return created;
      });

      this.eventEmitter.emit('GuildCreated', {
        guildId: guild.id,
        founderId: userId,
      } satisfies GuildCreatedEvent);

      return guild;
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException('that guild name or tag is already taken');
      }
      throw error;
    }
  }

  async myGuild(userId: string) {
    const membership = await this.requireMembership(userId);
    const guild = await this.prisma.guild.findUniqueOrThrow({
      where: { id: membership.guildId },
      include: {
        members: {
          include: { user: { select: { username: true } } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    return {
      id: guild.id,
      name: guild.name,
      tag: guild.tag,
      createdAt: guild.createdAt,
      members: guild.members.map((m) => ({
        userId: m.userId,
        username: m.user.username,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
    };
  }

  async listIncomingInvites(userId: string) {
    const invites = await this.prisma.guildInvite.findMany({
      where: { invitedUserId: userId, status: 'PENDING' },
      include: {
        guild: { select: { name: true, tag: true } },
        invitedBy: { select: { username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return invites.map((i) => ({
      inviteId: i.id,
      guildId: i.guildId,
      guildName: i.guild.name,
      guildTag: i.guild.tag,
      invitedByUsername: i.invitedBy.username,
      createdAt: i.createdAt,
    }));
  }

  async invite(actingUserId: string, targetUsername: string) {
    const acting = await this.requireMembership(actingUserId);
    if (acting.role === GuildRole.MEMBER) {
      throw new ForbiddenException('only officers and the leader can invite');
    }

    const target = await this.prisma.user.findUnique({
      where: { username: targetUsername },
    });
    if (!target) {
      throw new NotFoundException('no such player');
    }
    if (target.id === actingUserId) {
      throw new BadRequestException('cannot invite yourself');
    }

    const targetMembership = await this.membershipFor(target.id);
    if (targetMembership) {
      throw new ConflictException('that player is already in a guild');
    }

    const existingInvite = await this.prisma.guildInvite.findUnique({
      where: {
        guildId_invitedUserId: {
          guildId: acting.guildId,
          invitedUserId: target.id,
        },
      },
    });
    if (existingInvite?.status === 'PENDING') {
      throw new ConflictException('that player already has a pending invite');
    }

    const invite = await this.prisma.guildInvite.upsert({
      where: {
        guildId_invitedUserId: {
          guildId: acting.guildId,
          invitedUserId: target.id,
        },
      },
      create: {
        guildId: acting.guildId,
        invitedUserId: target.id,
        invitedById: actingUserId,
        status: 'PENDING',
      },
      update: {
        invitedById: actingUserId,
        status: 'PENDING',
      },
    });

    this.eventEmitter.emit('GuildInviteSent', {
      guildId: acting.guildId,
      invitedUserId: target.id,
      invitedById: actingUserId,
    } satisfies GuildInviteSentEvent);

    return invite;
  }

  async respondInvite(userId: string, inviteId: string, accept: boolean) {
    const invite = await this.prisma.guildInvite.findUnique({
      where: { id: inviteId },
    });
    if (!invite || invite.invitedUserId !== userId) {
      throw new NotFoundException('no such invite');
    }
    if (invite.status !== 'PENDING') {
      throw new ConflictException('this invite has already been resolved');
    }

    if (!accept) {
      return this.prisma.guildInvite.update({
        where: { id: inviteId },
        data: { status: 'DECLINED' },
      });
    }

    const existingMembership = await this.membershipFor(userId);
    if (existingMembership) {
      throw new ConflictException('you are already in a guild');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.guildInvite.updateMany({
        where: { id: inviteId, status: 'PENDING' },
        data: { status: 'ACCEPTED' },
      });
      if (count === 0) {
        throw new ConflictException('this invite has already been resolved');
      }

      const { count: memberCount } = await tx.guildMember.createMany({
        data: [{ guildId: invite.guildId, userId, role: GuildRole.MEMBER }],
        skipDuplicates: true,
      });
      if (memberCount === 0) {
        throw new ConflictException('you are already in a guild');
      }

      return tx.guildInvite.findUniqueOrThrow({ where: { id: inviteId } });
    });

    this.eventEmitter.emit('GuildMemberJoined', {
      guildId: invite.guildId,
      userId,
    } satisfies GuildMemberJoinedEvent);

    return updated;
  }

  async leave(userId: string) {
    const membership = await this.requireMembership(userId);

    if (membership.role === GuildRole.LEADER) {
      const otherMembers = await this.prisma.guildMember.count({
        where: { guildId: membership.guildId, userId: { not: userId } },
      });
      if (otherMembers > 0) {
        throw new ConflictException(
          'transfer leadership or disband the guild before leaving',
        );
      }
      await this.disbandInternal(membership.guildId);
      return { success: true, guildDisbanded: true };
    }

    await this.prisma.guildMember.delete({ where: { userId } });
    this.eventEmitter.emit('GuildMemberLeft', {
      guildId: membership.guildId,
      userId,
      reason: 'left',
    } satisfies GuildMemberLeftEvent);

    return { success: true, guildDisbanded: false };
  }

  async kick(actingUserId: string, targetUserId: string) {
    const acting = await this.requireMembership(actingUserId);
    if (acting.role === GuildRole.MEMBER) {
      throw new ForbiddenException('only officers and the leader can kick');
    }
    if (targetUserId === actingUserId) {
      throw new BadRequestException('use leave instead of kicking yourself');
    }

    const target = await this.membershipFor(targetUserId);
    if (!target || target.guildId !== acting.guildId) {
      throw new NotFoundException('that player is not in your guild');
    }
    if (target.role === GuildRole.LEADER) {
      throw new ForbiddenException('cannot kick the guild leader');
    }
    if (target.role === GuildRole.OFFICER && acting.role !== GuildRole.LEADER) {
      throw new ForbiddenException('only the leader can kick an officer');
    }

    await this.prisma.guildMember.delete({ where: { userId: targetUserId } });
    this.eventEmitter.emit('GuildMemberLeft', {
      guildId: acting.guildId,
      userId: targetUserId,
      reason: 'kicked',
    } satisfies GuildMemberLeftEvent);

    return { success: true };
  }

  async setRole(
    leaderUserId: string,
    targetUserId: string,
    role: AssignableRole,
  ) {
    const leader = await this.requireMembership(leaderUserId);
    if (leader.role !== GuildRole.LEADER) {
      throw new ForbiddenException('only the leader can change member roles');
    }
    if (targetUserId === leaderUserId) {
      throw new BadRequestException(
        'use the leadership transfer action to change your own role',
      );
    }

    const target = await this.membershipFor(targetUserId);
    if (!target || target.guildId !== leader.guildId) {
      throw new NotFoundException('that player is not in your guild');
    }

    return this.prisma.guildMember.update({
      where: { userId: targetUserId },
      data: { role: role },
    });
  }

  async transferLeadership(leaderUserId: string, targetUsername: string) {
    const leader = await this.requireMembership(leaderUserId);
    if (leader.role !== GuildRole.LEADER) {
      throw new ForbiddenException('only the leader can transfer leadership');
    }

    const target = await this.prisma.user.findUnique({
      where: { username: targetUsername },
    });
    if (!target) {
      throw new NotFoundException('no such player');
    }
    const targetMembership = await this.membershipFor(target.id);
    if (!targetMembership || targetMembership.guildId !== leader.guildId) {
      throw new NotFoundException('that player is not in your guild');
    }
    if (target.id === leaderUserId) {
      throw new BadRequestException('you are already the leader');
    }

    await this.prisma.$transaction([
      this.prisma.guildMember.update({
        where: { userId: leaderUserId },
        data: { role: GuildRole.OFFICER },
      }),
      this.prisma.guildMember.update({
        where: { userId: target.id },
        data: { role: GuildRole.LEADER },
      }),
    ]);

    this.eventEmitter.emit('GuildLeadershipTransferred', {
      guildId: leader.guildId,
      previousLeaderId: leaderUserId,
      newLeaderId: target.id,
    } satisfies GuildLeadershipTransferredEvent);

    return { success: true };
  }

  async disband(leaderUserId: string) {
    const leader = await this.requireMembership(leaderUserId);
    if (leader.role !== GuildRole.LEADER) {
      throw new ForbiddenException('only the leader can disband the guild');
    }
    await this.disbandInternal(leader.guildId);
    return { success: true };
  }

  private async disbandInternal(guildId: string) {
    await this.prisma.$transaction([
      this.prisma.guildMember.deleteMany({ where: { guildId } }),
      this.prisma.guildInvite.deleteMany({ where: { guildId } }),
      this.prisma.guild.delete({ where: { id: guildId } }),
    ]);

    this.eventEmitter.emit('GuildDisbanded', {
      guildId,
    } satisfies GuildDisbandedEvent);
  }
}
