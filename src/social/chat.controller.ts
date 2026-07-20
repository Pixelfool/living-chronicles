import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { ChatService } from './chat.service';

@UseGuards(SessionAuthGuard)
@Controller('social/chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('history')
  history(@Req() req: Request) {
    return this.chat.recentHistory(req.session.userId as string);
  }
}
