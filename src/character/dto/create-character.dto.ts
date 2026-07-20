import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ARCHETYPE_KEYS, ArchetypeKey } from '../archetypes';

export class CreateCharacterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  @Matches(/^[a-zA-Z][a-zA-Z0-9]*$/, {
    message:
      'name must start with a letter and contain only letters and numbers',
  })
  name: string;

  @IsIn(ARCHETYPE_KEYS)
  archetype: ArchetypeKey;
}
