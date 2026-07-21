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
import { CreateTradeOfferDto } from './dto/create-trade-offer.dto';
import { TradesService } from './trades.service';

@UseGuards(SessionAuthGuard)
@Controller('economy/trades')
export class TradesController {
  constructor(private readonly trades: TradesService) {}

  @Get()
  list(@Req() req: Request) {
    return this.trades.list(req.session.userId as string);
  }

  @Post()
  create(@Body() dto: CreateTradeOfferDto, @Req() req: Request) {
    return this.trades.create(
      req.session.userId as string,
      dto.toUsername,
      dto.offeredItemInstanceIds,
      dto.offeredGold,
      dto.requestedGold,
    );
  }

  @HttpCode(200)
  @Post(':tradeId/accept')
  accept(@Param('tradeId') tradeId: string, @Req() req: Request) {
    return this.trades.accept(req.session.userId as string, tradeId);
  }

  @HttpCode(200)
  @Post(':tradeId/decline')
  decline(@Param('tradeId') tradeId: string, @Req() req: Request) {
    return this.trades.decline(req.session.userId as string, tradeId);
  }

  @HttpCode(200)
  @Post(':tradeId/cancel')
  cancel(@Param('tradeId') tradeId: string, @Req() req: Request) {
    return this.trades.cancel(req.session.userId as string, tradeId);
  }
}
