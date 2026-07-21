import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsString,
  Max,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';

const MAX_OFFERED_ITEMS = 20;
const MAX_GOLD_AMOUNT = 1_000_000_000;

export class CreateTradeOfferDto {
  @IsString()
  @MinLength(2)
  @MaxLength(24)
  toUsername: string;

  @IsArray()
  @ArrayMaxSize(MAX_OFFERED_ITEMS)
  @IsString({ each: true })
  offeredItemInstanceIds: string[];

  @IsInt()
  @Min(0)
  @Max(MAX_GOLD_AMOUNT)
  offeredGold: number;

  @IsInt()
  @Min(0)
  @Max(MAX_GOLD_AMOUNT)
  requestedGold: number;
}
