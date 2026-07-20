import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { CombatController } from './combat.controller';
import { CombatService } from './combat.service';

@Module({
  imports: [InventoryModule],
  controllers: [CombatController],
  providers: [CombatService],
})
export class CombatModule {}
