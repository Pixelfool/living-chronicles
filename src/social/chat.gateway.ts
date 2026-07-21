import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { IncomingMessage } from 'http';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { MutesService } from './mutes.service';
import { PrivateMessageSentEvent } from './private-messages.service';

type SessionRequest = IncomingMessage & { session?: { userId?: string } };
type AuthedSocket = Socket & { request: SessionRequest };

interface ConnectionState {
  userId: string;
  username: string;
  lastMessageAt: number;
}

// A few lines of in-gateway rate limiting (architecture.md §7: "chat rate
// limiting") - cheap now, not a framework, just enough to stop a single
// client from flooding the room.
const MIN_MESSAGE_INTERVAL_MS = 800;
const MAX_MESSAGE_LENGTH = 280;

/**
 * Global chat over WebSocket (architecture.md §4.11, build-plan-v1.md M5).
 * Authenticated by the same session cookie as the REST API (see
 * session-io.adapter.ts) - no separate WS auth scheme.
 */
@WebSocketGateway({ namespace: '/chat' })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly connections = new Map<string, ConnectionState>();

  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly chat: ChatService,
    private readonly mutes: MutesService,
  ) {}

  async handleConnection(client: AuthedSocket): Promise<void> {
    const userId = client.request.session?.userId;
    if (!userId) {
      client.disconnect(true);
      return;
    }

    const identity = await this.chat.findChatIdentity(userId);
    if (!identity) {
      client.disconnect(true);
      return;
    }

    this.connections.set(client.id, {
      userId,
      username: identity.username,
      lastMessageAt: 0,
    });

    client.emit('chat:history', await this.chat.recentHistory(userId));
  }

  handleDisconnect(client: Socket): void {
    this.connections.delete(client.id);
  }

  // Best-effort live nudge for an already-connected recipient - the
  // authoritative copy always lives in Postgres via PrivateMessagesService,
  // this just saves a poll for whoever's online right now (game-design.md
  // §7: PMs "should stay simple", so no ack/delivery-receipt protocol).
  @OnEvent('PrivateMessageSent')
  handlePrivateMessageSent(payload: PrivateMessageSentEvent): void {
    for (const [socketId, recipient] of this.connections) {
      if (recipient.userId === payload.recipientId) {
        this.server.to(socketId).emit('pm:new', payload);
      }
    }
  }

  @SubscribeMessage('chat:send')
  async handleMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { body?: unknown },
  ): Promise<void> {
    const state = this.connections.get(client.id);
    if (!state) {
      return;
    }

    const body = typeof data?.body === 'string' ? data.body.trim() : '';
    if (!body || body.length > MAX_MESSAGE_LENGTH) {
      client.emit('chat:error', 'message must be 1-280 characters');
      return;
    }

    const now = Date.now();
    if (now - state.lastMessageAt < MIN_MESSAGE_INTERVAL_MS) {
      client.emit('chat:error', 'sending too fast, slow down');
      return;
    }
    state.lastMessageAt = now;

    const message = await this.chat.postMessage(
      state.userId,
      state.username,
      body,
    );

    const muterIds = await this.mutes.listMutersOf(state.userId);
    for (const [socketId, recipient] of this.connections) {
      if (muterIds.has(recipient.userId)) {
        continue;
      }
      this.server.to(socketId).emit('chat:message', message);
    }
  }
}
