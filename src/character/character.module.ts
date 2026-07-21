import { Module } from '@nestjs/common';
import { CharacterController } from './character.controller';
import { CharacterService } from './character.service';
import { RegenTask } from './regen.task';

@Module({
  controllers: [CharacterController],
  providers: [CharacterService, RegenTask],
  exports: [CharacterService],
})
export class CharacterModule {}
