import { IsString } from 'class-validator';

export class TravelDto {
  @IsString()
  toCityId: string;
}
