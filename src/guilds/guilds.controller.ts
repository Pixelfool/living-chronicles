import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { CreateGuildDto } from './dto/create-guild.dto';
import { GuildMemberTargetDto } from './dto/guild-member-target.dto';
import { SetMemberRoleDto } from './dto/set-member-role.dto';
import { GuildsService } from './guilds.service';

@UseGuards(SessionAuthGuard)
@Controller('guilds')
export class GuildsController {
  constructor(private readonly guilds: GuildsService) {}

  @Post()
  create(@Body() dto: CreateGuildDto, @Req() req: Request) {
    return this.guilds.createGuild(
      req.session.userId as string,
      dto.name,
      dto.tag,
    );
  }

  @Get('me')
  myGuild(@Req() req: Request) {
    return this.guilds.myGuild(req.session.userId as string);
  }

  @Get('invites')
  incomingInvites(@Req() req: Request) {
    return this.guilds.listIncomingInvites(req.session.userId as string);
  }

  @Post('invites')
  invite(@Body() dto: GuildMemberTargetDto, @Req() req: Request) {
    return this.guilds.invite(req.session.userId as string, dto.username);
  }

  @HttpCode(200)
  @Post('invites/:inviteId/accept')
  acceptInvite(@Param('inviteId') inviteId: string, @Req() req: Request) {
    return this.guilds.respondInvite(
      req.session.userId as string,
      inviteId,
      true,
    );
  }

  @HttpCode(200)
  @Post('invites/:inviteId/decline')
  declineInvite(@Param('inviteId') inviteId: string, @Req() req: Request) {
    return this.guilds.respondInvite(
      req.session.userId as string,
      inviteId,
      false,
    );
  }

  @HttpCode(200)
  @Post('leave')
  leave(@Req() req: Request) {
    return this.guilds.leave(req.session.userId as string);
  }

  @HttpCode(200)
  @Post('members/:userId/kick')
  kick(@Param('userId') userId: string, @Req() req: Request) {
    return this.guilds.kick(req.session.userId as string, userId);
  }

  @HttpCode(200)
  @Post('members/:userId/role')
  setRole(
    @Param('userId') userId: string,
    @Body() dto: SetMemberRoleDto,
    @Req() req: Request,
  ) {
    return this.guilds.setRole(req.session.userId as string, userId, dto.role);
  }

  @HttpCode(200)
  @Post('transfer')
  transfer(@Body() dto: GuildMemberTargetDto, @Req() req: Request) {
    return this.guilds.transferLeadership(
      req.session.userId as string,
      dto.username,
    );
  }

  @HttpCode(200)
  @Post('disband')
  disband(@Req() req: Request) {
    return this.guilds.disband(req.session.userId as string);
  }
}
