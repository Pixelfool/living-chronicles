import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { CraftingService } from './crafting.service';
import { ChooseProfessionDto } from './dto/choose-profession.dto';
import { StartCraftDto } from './dto/start-craft.dto';

@UseGuards(SessionAuthGuard)
@Controller('crafting')
export class CraftingController {
  constructor(private readonly crafting: CraftingService) {}

  @Get('professions')
  listProfessions() {
    return this.crafting.listProfessions();
  }

  @Post('profession')
  chooseProfession(@Body() dto: ChooseProfessionDto, @Req() req: Request) {
    return this.crafting.chooseProfession(
      req.session.userId as string,
      dto.professionId,
    );
  }

  @Get('recipes')
  listRecipes(@Req() req: Request) {
    return this.crafting.listRecipes(req.session.userId as string);
  }

  @Get('status')
  getStatus(@Req() req: Request) {
    return this.crafting.getStatus(req.session.userId as string);
  }

  @Post('start')
  startCraft(@Body() dto: StartCraftDto, @Req() req: Request) {
    return this.crafting.startCraft(req.session.userId as string, dto.recipeId);
  }
}
