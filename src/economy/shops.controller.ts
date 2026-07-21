import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { BuyItemDto } from './dto/buy-item.dto';
import { SellItemDto } from './dto/sell-item.dto';
import { ShopsService } from './shops.service';

@UseGuards(SessionAuthGuard)
@Controller('economy')
export class ShopsController {
  constructor(private readonly shops: ShopsService) {}

  @Get('shops/:cityId')
  listShop(@Param('cityId') cityId: string) {
    return this.shops.listShop(cityId);
  }

  @Post('shops/:cityId/buy')
  buy(
    @Param('cityId') cityId: string,
    @Body() dto: BuyItemDto,
    @Req() req: Request,
  ) {
    return this.shops.buy(req.session.userId as string, cityId, dto.itemId);
  }

  @Post('sell')
  sell(@Body() dto: SellItemDto, @Req() req: Request) {
    return this.shops.sell(req.session.userId as string, dto.itemInstanceId);
  }
}
