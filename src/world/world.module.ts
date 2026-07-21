import { Module } from '@nestjs/common';
import { CharacterModule } from '../character/character.module';
import { EconomyModule } from '../economy/economy.module';
import { InventoryModule } from '../inventory/inventory.module';
import { DungeonsController } from './dungeons.controller';
import { DungeonsService } from './dungeons.service';
import { WorldController } from './world.controller';
import { WorldEventsController } from './world-events.controller';
import { WorldEventsService } from './world-events.service';
import { WorldEventsTickTask } from './world-events-tick.task';
import { WorldService } from './world.service';

@Module({
  imports: [InventoryModule, CharacterModule, EconomyModule],
  controllers: [WorldController, DungeonsController, WorldEventsController],
  providers: [
    WorldService,
    DungeonsService,
    WorldEventsService,
    WorldEventsTickTask,
  ],
})
export class WorldModule {}
