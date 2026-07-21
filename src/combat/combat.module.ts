import { Module } from '@nestjs/common';
import { CharacterModule } from '../character/character.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CombatController } from './combat.controller';
import { CombatService } from './combat.service';
import { DuelController } from './duel.controller';
import { DuelService } from './duel.service';

@Module({
  imports: [InventoryModule, CharacterModule],
  controllers: [CombatController, DuelController],
  providers: [CombatService, DuelService],
})
export class CombatModule {}
