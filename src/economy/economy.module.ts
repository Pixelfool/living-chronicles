import { Module } from '@nestjs/common';
import { CharacterModule } from '../character/character.module';
import { AuditLogService } from './audit-log.service';
import { ShopsController } from './shops.controller';
import { ShopsService } from './shops.service';
import { TradesController } from './trades.controller';
import { TradesService } from './trades.service';

@Module({
  imports: [CharacterModule],
  controllers: [ShopsController, TradesController],
  providers: [AuditLogService, ShopsService, TradesService],
  exports: [AuditLogService],
})
export class EconomyModule {}
