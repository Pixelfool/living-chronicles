import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { regenerateSession } from './session.util';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const user = await this.authService.register(dto);
    await regenerateSession(req);
    req.session.userId = user.id;
    return user;
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const user = await this.authService.validateCredentials(dto);
    await regenerateSession(req);
    req.session.userId = user.id;
    return user;
  }

  @HttpCode(200)
  @Post('logout')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return new Promise<{ success: true }>((resolve, reject) => {
      req.session.destroy((err) => {
        if (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
          return;
        }
        res.clearCookie('lc.sid');
        resolve({ success: true });
      });
    });
  }

  @UseGuards(SessionAuthGuard)
  @Get('me')
  me(@Req() req: Request) {
    return this.authService.findPublicUserById(req.session.userId as string);
  }
}
