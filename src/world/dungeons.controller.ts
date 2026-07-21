import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { DungeonsService } from './dungeons.service';

@UseGuards(SessionAuthGuard)
@Controller('world/dungeons')
export class DungeonsController {
  constructor(private readonly dungeons: DungeonsService) {}

  @Get()
  listAvailable(@Req() req: Request) {
    return this.dungeons.listAvailable(req.session.userId as string);
  }

  @Get('current')
  async getCurrent(@Req() req: Request) {
    const current = await this.dungeons.getCurrent(
      req.session.userId as string,
    );
    if (!current) {
      throw new NotFoundException('you are not on an expedition');
    }
    return current;
  }

  @Get(':id/threshold')
  getThreshold(@Param('id') id: string, @Req() req: Request) {
    return this.dungeons.getThreshold(req.session.userId as string, id);
  }

  @Post(':id/enter')
  enter(@Param('id') id: string, @Req() req: Request) {
    return this.dungeons.enter(req.session.userId as string, id);
  }

  @Post('current/advance')
  advance(@Req() req: Request) {
    return this.dungeons.advance(req.session.userId as string);
  }

  @Post('current/retreat')
  retreat(@Req() req: Request) {
    return this.dungeons.retreat(req.session.userId as string);
  }
}
