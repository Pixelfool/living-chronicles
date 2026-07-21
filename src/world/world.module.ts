import { Module } from '@nestjs/common';
import { CharacterModule } from '../character/character.module';
import { InventoryModule } from '../inventory/inventory.module';
import { WorldController } from './world.controller';
import { WorldService } from './world.service';

@Module({
  imports: [InventoryModule, CharacterModule],
  controllers: [WorldController],
  providers: [WorldService],
})
export class WorldModule {}
