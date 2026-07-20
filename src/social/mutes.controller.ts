import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { MuteTargetDto } from './dto/mute-target.dto';
import { MutesService } from './mutes.service';

@UseGuards(SessionAuthGuard)
@Controller('social/mutes')
export class MutesController {
  constructor(private readonly mutes: MutesService) {}

  @Get()
  list(@Req() req: Request) {
    return this.mutes.list(req.session.userId as string);
  }

  @Post()
  mute(@Body() dto: MuteTargetDto, @Req() req: Request) {
    return this.mutes.mute(req.session.userId as string, dto.username);
  }

  @Delete(':userId')
  unmute(@Param('userId') userId: string, @Req() req: Request) {
    return this.mutes.unmute(req.session.userId as string, userId);
  }
}
