import { Module } from '@nestjs/common';
import { CharacterModule } from '../character/character.module';
import { QuestsController } from './quests.controller';
import { QuestsService } from './quests.service';

@Module({
  imports: [CharacterModule],
  controllers: [QuestsController],
  providers: [QuestsService],
})
export class QuestsModule {}
