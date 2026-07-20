import { IsIn } from 'class-validator';
import { MONSTER_IDS } from '../monsters';

export class FightDto {
  @IsIn(MONSTER_IDS)
  monsterId: string;
}
