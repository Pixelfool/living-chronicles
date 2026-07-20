import { IsString, MaxLength, MinLength } from 'class-validator';

export class MuteTargetDto {
  @IsString()
  @MinLength(2)
  @MaxLength(24)
  username: string;
}
