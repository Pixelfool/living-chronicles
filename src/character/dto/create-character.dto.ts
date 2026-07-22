import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ARCHETYPE_KEYS, ArchetypeKey } from '../archetypes';

export class CreateCharacterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  // Unicode-aware (\p{L}/\p{N}, not a-zA-Z0-9): the ASCII-only version of
  // this rejected any accented or non-Latin name (Müller, Éowyn, Øyvind)
  // for no actual reason - found by playing the reference client, not a
  // deliberate restriction anyone had decided on.
  @Matches(/^\p{L}[\p{L}\p{N}]*$/u, {
    message:
      'name must start with a letter and contain only letters and numbers',
  })
  name: string;

  @IsIn(ARCHETYPE_KEYS)
  archetype: ArchetypeKey;
}
