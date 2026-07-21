import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { QuestsService } from './quests.service';

@UseGuards(SessionAuthGuard)
@Controller('quests')
export class QuestsController {
  constructor(private readonly quests: QuestsService) {}

  @Get('available')
  listAvailable(@Req() req: Request) {
    return this.quests.listAvailable(req.session.userId as string);
  }

  @Get('mine')
  listMine(@Req() req: Request) {
    return this.quests.listMine(req.session.userId as string);
  }

  @Post(':questId/accept')
  accept(@Param('questId') questId: string, @Req() req: Request) {
    return this.quests.accept(req.session.userId as string, questId);
  }

  @Post(':questId/complete')
  complete(@Param('questId') questId: string, @Req() req: Request) {
    return this.quests.complete(req.session.userId as string, questId);
  }
}
