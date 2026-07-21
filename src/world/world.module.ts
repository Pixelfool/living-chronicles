import { Module } from '@nestjs/common';
import { CharacterModule } from '../character/character.module';
import { InventoryModule } from '../inventory/inventory.module';
import { DungeonsController } from './dungeons.controller';
import { DungeonsService } from './dungeons.service';
import { WorldController } from './world.controller';
import { WorldService } from './world.service';

@Module({
  imports: [InventoryModule, CharacterModule],
  controllers: [WorldController, DungeonsController],
  providers: [WorldService, DungeonsService],
})
export class WorldModule {}
