import { Module } from '@nestjs/common';
import { CraftingController } from './crafting.controller';
import { CraftingService } from './crafting.service';

@Module({
  controllers: [CraftingController],
  providers: [CraftingService],
})
export class CraftingModule {}
