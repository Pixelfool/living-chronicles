import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Server } from 'http';
import { AddressInfo } from 'net';
import Redis from 'ioredis';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { buildSessionMiddleware, configureApp } from '../src/bootstrap';
import { SessionIoAdapter } from '../src/social/session-io.adapter';
import { PrismaService } from '../src/prisma/prisma.service';
import { uniqueSuffix } from './test-utils';

jest.setTimeout(20000);

interface ChatMessageView {
  id: string;
  senderId: string;
  username: string;
  body: string;
}

function extractCookie(
  setCookieHeader: string[] | undefined,
  name: string,
): string | undefined {
  if (!setCookieHeader) {
    return undefined;
  }
  for (const raw of setCookieHeader) {
    const pair = raw.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq !== -1 && pair.slice(0, eq) === name) {
      return pair.slice(eq + 1);
    }
  }
  return undefined;
}

describe('Chat gateway (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redisClient: Redis;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    redisClient = configureApp(app);
    app.useWebSocketAdapter(
      new SessionIoAdapter(app, buildSessionMiddleware(redisClient)),
    );
    await app.init();
    await app.listen(0);
    const httpServer = app.getHttpServer() as Server;
    const { port } = httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { contains: 'e2e-chatws' } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    await prisma.chatMessage.deleteMany({
      where: { senderId: { in: userIds } },
    });
    await prisma.mute.deleteMany({
      where: {
        OR: [{ muterId: { in: userIds } }, { mutedId: { in: userIds } }],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
    redisClient.disconnect();
  });

  async function registerAndGetSessionCookie(
    prefix: string,
  ): Promise<{ userId: string; username: string; sidCookie: string }> {
    const csrfRes = await request(baseUrl).get('/health');
    const csrfCookie = extractCookie(
      csrfRes.headers['set-cookie'] as unknown as string[],
      'lc.csrf',
    );
    if (!csrfCookie) {
      throw new Error('expected a CSRF cookie');
    }

    const suffix = uniqueSuffix();
    const email = `${prefix}-${suffix}@example.com`;
    const username = `${prefix.replace(/[^a-zA-Z0-9]/g, '')}${suffix}`.slice(
      0,
      24,
    );

    const res = await request(baseUrl)
      .post('/auth/register')
      .set('Cookie', `lc.csrf=${csrfCookie}`)
      .set('x-csrf-token', csrfCookie)
      .send({ email, username, password: 'correct horse battery staple' })
      .expect(201);

    const sidCookie = extractCookie(
      res.headers['set-cookie'] as unknown as string[],
      'lc.sid',
    );
    if (!sidCookie) {
      throw new Error('expected a session cookie');
    }

    const body = res.body as { id: string };
    return { userId: body.id, username, sidCookie };
  }

  // Resolves once the server has actually finished `handleConnection` and
  // registered this socket - not just once the client-side transport is up.
  // `handleConnection` is async (it awaits a DB lookup before adding the
  // socket to its in-memory connections map), so the client's 'connect'
  // event can fire before the server considers the socket connected. Racing
  // ahead and emitting 'chat:send' right after 'connect' can broadcast
  // before a just-connected recipient is registered, silently dropping the
  // message. `chat:history` is emitted as the last step of
  // handleConnection, so waiting for it closes that window.
  function connectSocket(sidCookie: string, origin?: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(`${baseUrl}/chat`, {
        extraHeaders: {
          Cookie: `lc.sid=${sidCookie}`,
          ...(origin ? { Origin: origin } : {}),
        },
        transports: ['websocket'],
        forceNew: true,
      });
      socket.on('chat:history', () => resolve(socket));
      socket.on('connect_error', reject);
    });
  }

  it('rejects a connection with no session cookie', async () => {
    await new Promise<void>((resolve, reject) => {
      const socket = io(`${baseUrl}/chat`, {
        transports: ['websocket'],
        forceNew: true,
      });
      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error('expected disconnect, got neither event in time'));
      }, 3000);
      socket.on('disconnect', () => {
        clearTimeout(timer);
        socket.disconnect();
        resolve();
      });
      socket.on('connect_error', () => {
        clearTimeout(timer);
        socket.disconnect();
        resolve();
      });
    });
  });

  it('accepts a matching Origin and rejects a mismatched one, for the same session', async () => {
    // One registration covers both halves of the check (register throttle
    // budget - see the comment on the Guilds e2e spec for why this matters).
    const a = await registerAndGetSessionCookie('e2e-chatws-origin');

    const okSocket = await connectSocket(a.sidCookie, baseUrl);
    okSocket.disconnect();

    await new Promise<void>((resolve, reject) => {
      const socket = io(`${baseUrl}/chat`, {
        extraHeaders: {
          Cookie: `lc.sid=${a.sidCookie}`,
          Origin: 'http://evil.example',
        },
        transports: ['websocket'],
        forceNew: true,
      });
      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error('expected disconnect, got neither event in time'));
      }, 3000);
      socket.on('disconnect', () => {
        clearTimeout(timer);
        socket.disconnect();
        resolve();
      });
      socket.on('connect_error', () => {
        clearTimeout(timer);
        socket.disconnect();
        resolve();
      });
    });
  });

  it('broadcasts a message to another connected, unmuted client', async () => {
    const a = await registerAndGetSessionCookie('e2e-chatws-a');
    const b = await registerAndGetSessionCookie('e2e-chatws-b');

    const socketA = await connectSocket(a.sidCookie);
    const socketB = await connectSocket(b.sidCookie);

    const received = new Promise<ChatMessageView>((resolve) => {
      socketB.once('chat:message', (msg: ChatMessageView) => resolve(msg));
    });

    socketA.emit('chat:send', { body: 'hello from A' });

    const msg = await received;
    expect(msg.senderId).toBe(a.userId);
    expect(msg.username).toBe(a.username);
    expect(msg.body).toBe('hello from A');

    socketA.disconnect();
    socketB.disconnect();
  });

  it('does not deliver a message to a client who has muted the sender', async () => {
    const a = await registerAndGetSessionCookie('e2e-chatws-mute-a');
    const b = await registerAndGetSessionCookie('e2e-chatws-mute-b');

    await prisma.mute.create({
      data: { muterId: b.userId, mutedId: a.userId },
    });

    const socketA = await connectSocket(a.sidCookie);
    const socketB = await connectSocket(b.sidCookie);

    let receivedByB = false;
    socketB.on('chat:message', () => {
      receivedByB = true;
    });

    socketA.emit('chat:send', { body: 'you cannot see this' });

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(receivedByB).toBe(false);

    socketA.disconnect();
    socketB.disconnect();
  });
});
