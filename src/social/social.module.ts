import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';
import { MutesController } from './mutes.controller';
import { MutesService } from './mutes.service';
import { PrivateMessagesController } from './private-messages.controller';
import { PrivateMessagesService } from './private-messages.service';

@Module({
  controllers: [
    FriendsController,
    MutesController,
    ChatController,
    PrivateMessagesController,
  ],
  providers: [
    FriendsService,
    MutesService,
    ChatService,
    ChatGateway,
    PrivateMessagesService,
  ],
})
export class SocialModule {}
