import { Module } from '@nestjs/common';
import { CombatController } from './combat.controller';
import { CombatService } from './combat.service';

@Module({
  controllers: [CombatController],
  providers: [CombatService],
})
export class CombatModule {}
