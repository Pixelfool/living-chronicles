import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateGuildDto {
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z][a-zA-Z0-9 ]*$/, {
    message:
      'name must start with a letter and contain only letters, numbers, and spaces',
  })
  name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(6)
  @Matches(/^[a-zA-Z0-9]+$/, {
    message: 'tag must be 2-6 letters or numbers',
  })
  tag: string;
}
