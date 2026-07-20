import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { InventoryService } from './inventory.service';

@UseGuards(SessionAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  list(@Req() req: Request) {
    return this.inventoryService.listForCharacter(req.session.userId as string);
  }

  @Post(':itemInstanceId/equip')
  equip(@Param('itemInstanceId') itemInstanceId: string, @Req() req: Request) {
    return this.inventoryService.equip(
      req.session.userId as string,
      itemInstanceId,
    );
  }

  @Post(':itemInstanceId/unequip')
  unequip(
    @Param('itemInstanceId') itemInstanceId: string,
    @Req() req: Request,
  ) {
    return this.inventoryService.unequip(
      req.session.userId as string,
      itemInstanceId,
    );
  }
}
