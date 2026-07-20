import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
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

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto): Promise<PublicUser> {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
    });
    if (existing) {
      throw new ConflictException('email or username already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_HASH_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email: dto.email, username: dto.username, passwordHash },
    });

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
