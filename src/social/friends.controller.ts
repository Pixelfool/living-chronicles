import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { resolveLocaleFromHeader } from '../i18n/i18n.service';
import { FriendRequestDto } from './dto/friend-request.dto';
import { FriendsService } from './friends.service';

@UseGuards(SessionAuthGuard)
@Controller('social/friends')
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get()
  list(@Req() req: Request) {
    return this.friends.list(req.session.userId as string);
  }

  @Post('requests')
  sendRequest(@Body() dto: FriendRequestDto, @Req() req: Request) {
    return this.friends.sendRequest(
      req.session.userId as string,
      dto.username,
      resolveLocaleFromHeader(req.headers['accept-language']),
    );
  }

  @HttpCode(200)
  @Post('requests/:requestId/accept')
  accept(@Param('requestId') requestId: string, @Req() req: Request) {
    return this.friends.respond(
      req.session.userId as string,
      requestId,
      true,
      resolveLocaleFromHeader(req.headers['accept-language']),
    );
  }

  @HttpCode(200)
  @Post('requests/:requestId/decline')
  decline(@Param('requestId') requestId: string, @Req() req: Request) {
    return this.friends.respond(
      req.session.userId as string,
      requestId,
      false,
      resolveLocaleFromHeader(req.headers['accept-language']),
    );
  }

  @Delete(':friendUserId')
  remove(@Param('friendUserId') friendUserId: string, @Req() req: Request) {
    return this.friends.remove(req.session.userId as string, friendUserId);
  }
}
