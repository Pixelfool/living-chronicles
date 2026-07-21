import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { WorldEventsService } from './world-events.service';

@UseGuards(SessionAuthGuard)
@Controller('world/events')
export class WorldEventsController {
  constructor(private readonly worldEvents: WorldEventsService) {}

  @Get(':cityId')
  getForCity(@Param('cityId') cityId: string) {
    return this.worldEvents.getForCity(cityId);
  }

  @Post(':cityId/fight')
  fight(@Param('cityId') cityId: string, @Req() req: Request) {
    return this.worldEvents.fight(req.session.userId as string, cityId);
  }

  @Post(':cityId/support')
  support(@Param('cityId') cityId: string, @Req() req: Request) {
    return this.worldEvents.support(req.session.userId as string, cityId);
  }
}
