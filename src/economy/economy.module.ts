import { Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { ShopsController } from './shops.controller';
import { ShopsService } from './shops.service';
import { TradesController } from './trades.controller';
import { TradesService } from './trades.service';

@Module({
  controllers: [ShopsController, TradesController],
  providers: [AuditLogService, ShopsService, TradesService],
})
export class EconomyModule {}
