import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { AttackDto } from './dto/attack.dto';
import { DuelService } from './duel.service';

@UseGuards(SessionAuthGuard)
@Controller('combat/duels')
export class DuelController {
  constructor(private readonly duels: DuelService) {}

  @Get('status')
  getStatus(@Req() req: Request) {
    return this.duels.getStatus(req.session.userId as string);
  }

  @Post('oath/swear')
  swearOath(@Req() req: Request) {
    return this.duels.swearOath(req.session.userId as string);
  }

  @Post('oath/renounce')
  requestRenounce(@Req() req: Request) {
    return this.duels.requestRenounce(req.session.userId as string);
  }

  @Get('targets')
  listTargets(@Req() req: Request) {
    return this.duels.listTargets(req.session.userId as string);
  }

  @Post('attack')
  attack(@Body() dto: AttackDto, @Req() req: Request) {
    return this.duels.attack(
      req.session.userId as string,
      dto.defenderCharacterId,
    );
  }

  @Get('history')
  myHistory(@Req() req: Request) {
    return this.duels.myHistory(req.session.userId as string);
  }
}
