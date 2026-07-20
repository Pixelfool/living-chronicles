import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { CombatService } from './combat.service';
import { FightDto } from './dto/fight.dto';

@UseGuards(SessionAuthGuard)
@Controller('combat')
export class CombatController {
  constructor(private readonly combatService: CombatService) {}

  @Get('monsters')
  listMonsters() {
    return this.combatService.listMonsters();
  }

  @Post('fight')
  fight(@Body() dto: FightDto, @Req() req: Request) {
    return this.combatService.fight(
      req.session.userId as string,
      dto.monsterId,
    );
  }
}
