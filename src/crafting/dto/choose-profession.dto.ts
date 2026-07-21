import { IsString } from 'class-validator';

export class ChooseProfessionDto {
  @IsString()
  professionId: string;
}
