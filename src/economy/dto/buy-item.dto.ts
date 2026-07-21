import { IsString } from 'class-validator';

export class BuyItemDto {
  @IsString()
  itemId: string;
}
