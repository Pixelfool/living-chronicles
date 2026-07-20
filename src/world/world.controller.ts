import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { TravelDto } from './dto/travel.dto';
import { WorldService } from './world.service';

@UseGuards(SessionAuthGuard)
@Controller('world')
export class WorldController {
  constructor(private readonly worldService: WorldService) {}

  @Get('cities')
  listCities() {
    return this.worldService.listCities();
  }

  @Get('routes')
  listRoutes() {
    return this.worldService.listRoutes();
  }

  @Post('travel')
  travel(@Body() dto: TravelDto, @Req() req: Request) {
    return this.worldService.travel(
      req.session.userId as string,
      dto.toCityId,
    );
  }
}
