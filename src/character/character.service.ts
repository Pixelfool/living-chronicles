import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ARCHETYPES } from './archetypes';
import { CreateCharacterDto } from './dto/create-character.dto';
import { maxHpForCharacter } from './leveling';

@Injectable()
export class CharacterService {
  constructor(private readonly prisma: PrismaService) {}

  async createForUser(userId: string, dto: CreateCharacterDto) {
    const existing = await this.prisma.character.findUnique({
      where: { userId },
    });
    if (existing) {
      throw new ConflictException('this account already has a character');
    }

    const nameTaken = await this.prisma.character.findUnique({
      where: { name: dto.name },
    });
    if (nameTaken) {
      throw new ConflictException('that name is already taken');
    }

    const stats = ARCHETYPES[dto.archetype];
    const maxHp = maxHpForCharacter(stats.body, 1);
    return this.prisma.character.create({
      data: {
        userId,
        name: dto.name,
        archetype: dto.archetype,
        body: stats.body,
        mind: stats.mind,
        presence: stats.presence,
        hp: maxHp,
        maxHp,
      },
    });
  }

  async getForUser(userId: string) {
    const character = await this.prisma.character.findUnique({
      where: { userId },
    });
    if (!character) {
      throw new NotFoundException('no character on this account yet');
    }
    return character;
  }
}
