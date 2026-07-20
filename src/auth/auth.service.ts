import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcryptjs';
import { isUniqueConstraintViolation } from '../prisma/prisma.errors';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const PASSWORD_HASH_ROUNDS = 12;

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  createdAt: Date;
}

export interface PlayerRegisteredEvent {
  userId: string;
  email: string;
  username: string;
}

export interface PlayerLoggedInEvent {
  userId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async register(dto: RegisterDto): Promise<PublicUser> {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
    });
    if (existing) {
      throw new ConflictException('email or username already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_HASH_ROUNDS);

    let user;
    try {
      user = await this.prisma.user.create({
        data: { email: dto.email, username: dto.username, passwordHash },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException('email or username already in use');
      }
      throw error;
    }

    this.eventEmitter.emit('PlayerRegistered', {
      userId: user.id,
      email: user.email,
      username: user.username,
    } satisfies PlayerRegisteredEvent);

    return this.toPublicUser(user);
  }

  async validateCredentials(dto: LoginDto): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (!user) {
      throw new UnauthorizedException('invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('invalid credentials');
    }

    this.eventEmitter.emit('PlayerLoggedIn', {
      userId: user.id,
    } satisfies PlayerLoggedInEvent);

    return this.toPublicUser(user);
  }

  async findPublicUserById(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new UnauthorizedException('session user no longer exists');
    }
    return this.toPublicUser(user);
  }

  private toPublicUser(user: {
    id: string;
    email: string;
    username: string;
    createdAt: Date;
  }): PublicUser {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      createdAt: user.createdAt,
    };
  }
}
