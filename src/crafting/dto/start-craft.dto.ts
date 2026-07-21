import { IsString } from 'class-validator';

export class StartCraftDto {
  @IsString()
  recipeId: string;
}
