import { Module } from '@nestjs/common';
import { CharacterModule } from '../character/character.module';
import { CraftingController } from './crafting.controller';
import { CraftingService } from './crafting.service';

@Module({
  imports: [CharacterModule],
  controllers: [CraftingController],
  providers: [CraftingService],
})
export class CraftingModule {}
