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
import { I18nService, resolveLocaleFromHeader } from '../i18n/i18n.service';
import { ChatService } from './chat.service';
import { MutesService } from './mutes.service';
import { PrivateMessageSentEvent } from './private-messages.service';

type SessionRequest = IncomingMessage & { session?: { userId?: string } };
type AuthedSocket = Socket & { request: SessionRequest };

interface ConnectionState {
  userId: string;
  username: string;
  lang: string;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isSameOrigin(
  originHeader: string | string[] | undefined,
  hostHeader: string | string[] | undefined,
): boolean {
  // Browsers always send Origin on a WS handshake, so requiring a match
  // when it's present blocks cross-site WebSocket hijacking (browsers
  // don't apply same-origin policy to raw WebSocket connections the way
  // they do to fetch/XHR - SameSite=Lax on the session cookie already
  // covers this in practice, this is a second layer, same spirit as
  // CSRF's belt-and-suspenders double-submit cookie on the REST side).
  // Non-browser clients (health checks, tests, a future native client)
  // often don't set Origin at all, so a missing header is allowed rather
  // than rejected - that doesn't weaken the actual browser-hijack defense.
  const origin = headerValue(originHeader);
  const host = headerValue(hostHeader);
  if (!origin) {
    return true;
  }
  if (!host) {
    return false;
  }
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// A few lines of in-gateway rate limiting (architecture.md §7: "chat rate
// limiting") - cheap now, not a framework, just enough to stop a single
// client from flooding the room. Keyed by userId rather than per-socket
// state so it isn't reset by simply disconnecting and reconnecting - a WS
// upgrade never passes through the global HTTP ThrottlerGuard, so a
// per-connection counter would otherwise be trivially bypassable.
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
  private readonly lastMessageAtByUser = new Map<string, number>();

  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly chat: ChatService,
    private readonly mutes: MutesService,
    private readonly i18n: I18nService,
  ) {}

  async handleConnection(client: AuthedSocket): Promise<void> {
    if (
      !isSameOrigin(
        client.handshake.headers.origin,
        client.handshake.headers.host,
      )
    ) {
      client.disconnect(true);
      return;
    }

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
      lang: resolveLocaleFromHeader(
        client.handshake.headers['accept-language'],
      ),
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
      client.emit(
        'chat:error',
        this.i18n.t('chat.errors.messageLength', {
          lang: state.lang,
          args: { max: MAX_MESSAGE_LENGTH },
        }),
      );
      return;
    }

    const now = Date.now();
    const lastMessageAt = this.lastMessageAtByUser.get(state.userId) ?? 0;
    if (now - lastMessageAt < MIN_MESSAGE_INTERVAL_MS) {
      const remainingMs = MIN_MESSAGE_INTERVAL_MS - (now - lastMessageAt);
      client.emit(
        'chat:error',
        this.i18n.t('chat.errors.rateLimited', {
          lang: state.lang,
          args: { seconds: Math.ceil(remainingMs / 1000) },
        }),
      );
      return;
    }
    this.lastMessageAtByUser.set(state.userId, now);

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
