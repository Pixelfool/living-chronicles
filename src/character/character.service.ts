import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContentService } from '../content/content.service';
import { isUniqueConstraintViolation } from '../prisma/prisma.errors';
import { PrismaService } from '../prisma/prisma.service';
import { ArchetypeKey, ARCHETYPES } from './archetypes';
import { CreateCharacterDto } from './dto/create-character.dto';
import { maxHpForCharacter } from './leveling';

export interface CharacterCreatedEvent {
  userId: string;
  characterId: string;
  name: string;
  archetype: ArchetypeKey;
}

@Injectable()
export class CharacterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly content: ContentService,
  ) {}

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

    let character;
    try {
      character = await this.prisma.character.create({
        data: {
          userId,
          name: dto.name,
          archetype: dto.archetype,
          body: stats.body,
          mind: stats.mind,
          presence: stats.presence,
          hp: maxHp,
          maxHp,
          currentCityId: this.content.getStartingCityId(),
        },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          'this account already has a character, or that name is already taken',
        );
      }
      throw error;
    }

    this.eventEmitter.emit('CharacterCreated', {
      userId,
      characterId: character.id,
      name: character.name,
      archetype: dto.archetype,
    } satisfies CharacterCreatedEvent);

    return character;
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
