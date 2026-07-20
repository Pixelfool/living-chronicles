import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { CharacterService } from './character.service';
import { CreateCharacterDto } from './dto/create-character.dto';

@UseGuards(SessionAuthGuard)
@Controller('characters')
export class CharacterController {
  constructor(private readonly characterService: CharacterService) {}

  @Post()
  create(@Body() dto: CreateCharacterDto, @Req() req: Request) {
    return this.characterService.createForUser(
      req.session.userId as string,
      dto,
    );
  }

  @Get('me')
  getMine(@Req() req: Request) {
    return this.characterService.getForUser(req.session.userId as string);
  }
}
