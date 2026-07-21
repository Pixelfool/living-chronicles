import { IsString } from 'class-validator';

export class SellItemDto {
  @IsString()
  itemInstanceId: string;
}
