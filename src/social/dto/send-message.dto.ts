import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @MinLength(2)
  @MaxLength(24)
  username: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;
}
