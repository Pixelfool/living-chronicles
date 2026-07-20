import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { WorldController } from './world.controller';
import { WorldService } from './world.service';

@Module({
  imports: [InventoryModule],
  controllers: [WorldController],
  providers: [WorldService],
})
export class WorldModule {}
