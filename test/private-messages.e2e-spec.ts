import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createAgent,
  primeCsrfToken,
  registerUser,
  RegisteredUser,
  TestAgent,
} from './test-utils';

describe('Private messages (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redisClient: Redis;
  let server: Parameters<typeof request>[0];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    redisClient = configureApp(app);
    await app.init();
    prisma = moduleRef.get(PrismaService);
    server = app.getHttpServer() as Parameters<typeof request>[0];
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { contains: 'e2e-pm' } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    await prisma.privateMessage.deleteMany({
      where: {
        OR: [{ senderId: { in: userIds } }, { recipientId: { in: userIds } }],
      },
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

  async function player(prefix: string): Promise<{
    agent: TestAgent;
    csrfToken: string;
    user: RegisteredUser;
  }> {
    const agent = createAgent(server);
    const csrfToken = await primeCsrfToken(agent);
    const user = await registerUser(agent, prefix);
    return { agent, csrfToken, user };
  }

  it('rejects message routes without a session', async () => {
    await request(server).get('/social/messages').expect(401);
  });

  it('sends a message, appears in inbox and thread, and can be marked read', async () => {
    const a = await player('e2e-pm-a');
    const b = await player('e2e-pm-b');

    await a.agent
      .post('/social/messages')
      .set('x-csrf-token', a.csrfToken)
      .send({ username: b.user.username, body: 'hello there' })
      .expect(201);

    const bInbox = await b.agent.get('/social/messages').expect(200);
    const bInboxBody = bInbox.body as {
      userId: string;
      username: string;
      unreadCount: number;
    }[];
    const withA = bInboxBody.find((c) => c.username === a.user.username);
    expect(withA?.unreadCount).toBe(1);

    const thread = await b.agent
      .get(`/social/messages/${a.user.userId}`)
      .expect(200);
    const threadBody = thread.body as { body: string; senderId: string }[];
    expect(threadBody.some((m) => m.body === 'hello there')).toBe(true);

    await b.agent
      .post(`/social/messages/${a.user.userId}/read`)
      .set('x-csrf-token', b.csrfToken)
      .expect(200);

    const bInboxAfter = await b.agent.get('/social/messages').expect(200);
    const bInboxAfterBody = bInboxAfter.body as {
      username: string;
      unreadCount: number;
    }[];
    expect(
      bInboxAfterBody.find((c) => c.username === a.user.username)?.unreadCount,
    ).toBe(0);
  });

  it('rejects messaging yourself and a nonexistent player', async () => {
    const a = await player('e2e-pm-self');

    await a.agent
      .post('/social/messages')
      .set('x-csrf-token', a.csrfToken)
      .send({ username: a.user.username, body: 'hi me' })
      .expect(400);

    await a.agent
      .post('/social/messages')
      .set('x-csrf-token', a.csrfToken)
      .send({ username: 'nobody-with-this-name', body: 'hi?' })
      .expect(404);
  });

  it('blocks a message to someone who has muted the sender', async () => {
    const a = await player('e2e-pm-mute-a');
    const b = await player('e2e-pm-mute-b');

    await b.agent
      .post('/social/mutes')
      .set('x-csrf-token', b.csrfToken)
      .send({ username: a.user.username })
      .expect(201);

    await a.agent
      .post('/social/messages')
      .set('x-csrf-token', a.csrfToken)
      .send({ username: b.user.username, body: 'can you see this' })
      .expect(403);
  });
});
