import { Module } from '@nestjs/common';
import { CharacterModule } from '../character/character.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CombatController } from './combat.controller';
import { CombatService } from './combat.service';

@Module({
  imports: [InventoryModule, CharacterModule],
  controllers: [CombatController],
  providers: [CombatService],
})
export class CombatModule {}
