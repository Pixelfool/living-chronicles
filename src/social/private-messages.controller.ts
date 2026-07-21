import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { SendMessageDto } from './dto/send-message.dto';
import { PrivateMessagesService } from './private-messages.service';

@UseGuards(SessionAuthGuard)
@Controller('social/messages')
export class PrivateMessagesController {
  constructor(private readonly messages: PrivateMessagesService) {}

  @Get()
  inbox(@Req() req: Request) {
    return this.messages.inbox(req.session.userId as string);
  }

  @Post()
  send(@Body() dto: SendMessageDto, @Req() req: Request) {
    return this.messages.send(
      req.session.userId as string,
      dto.username,
      dto.body,
    );
  }

  @Get(':otherUserId')
  thread(@Param('otherUserId') otherUserId: string, @Req() req: Request) {
    return this.messages.thread(req.session.userId as string, otherUserId);
  }

  @HttpCode(200)
  @Post(':otherUserId/read')
  markRead(@Param('otherUserId') otherUserId: string, @Req() req: Request) {
    return this.messages.markRead(req.session.userId as string, otherUserId);
  }
}
