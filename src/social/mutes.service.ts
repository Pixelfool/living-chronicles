import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MutesService {
  constructor(private readonly prisma: PrismaService) {}

  async mute(userId: string, targetUsername: string) {
    const target = await this.prisma.user.findUnique({
      where: { username: targetUsername },
    });
    if (!target) {
      throw new NotFoundException('no such player');
    }
    if (target.id === userId) {
      throw new BadRequestException('cannot mute yourself');
    }

    await this.prisma.mute.upsert({
      where: { muterId_mutedId: { muterId: userId, mutedId: target.id } },
      create: { muterId: userId, mutedId: target.id },
      update: {},
    });

    return { success: true };
  }

  async unmute(userId: string, targetUserId: string) {
    await this.prisma.mute.deleteMany({
      where: { muterId: userId, mutedId: targetUserId },
    });
    return { success: true };
  }

  async list(userId: string) {
    const mutes = await this.prisma.mute.findMany({
      where: { muterId: userId },
      include: { muted: true },
      orderBy: { createdAt: 'desc' },
    });
    return mutes.map((m) => ({
      userId: m.mutedId,
      username: m.muted.username,
    }));
  }

  /** userIds this viewer has muted - used to filter chat history/broadcast for them. */
  async listMutedByViewer(userId: string): Promise<Set<string>> {
    const mutes = await this.prisma.mute.findMany({
      where: { muterId: userId },
      select: { mutedId: true },
    });
    return new Set(mutes.map((m) => m.mutedId));
  }

  /** userIds who have muted this sender - used to filter who a live broadcast reaches. */
  async listMutersOf(mutedUserId: string): Promise<Set<string>> {
    const mutes = await this.prisma.mute.findMany({
      where: { mutedId: mutedUserId },
      select: { muterId: true },
    });
    return new Set(mutes.map((m) => m.muterId));
  }

  /** Whether `muterId` has muted `mutedId` - used to block DMs to someone who's muted you. */
  async isMuted(muterId: string, mutedId: string): Promise<boolean> {
    const mute = await this.prisma.mute.findUnique({
      where: { muterId_mutedId: { muterId, mutedId } },
    });
    return mute !== null;
  }
}
