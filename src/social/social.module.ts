import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';
import { MutesController } from './mutes.controller';
import { MutesService } from './mutes.service';

@Module({
  controllers: [FriendsController, MutesController, ChatController],
  providers: [FriendsService, MutesService, ChatService, ChatGateway],
})
export class SocialModule {}
