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

describe('Social (e2e)', () => {
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
      where: { email: { contains: 'e2e-social' } },
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
    await prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { requesterId: { in: userIds } },
          { addresseeId: { in: userIds } },
        ],
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

  it('rejects social routes without a session', async () => {
    await request(server).get('/social/friends').expect(401);
    await request(server).get('/social/mutes').expect(401);
    await request(server).get('/social/chat/history').expect(401);
  });

  it('sends, accepts, lists, and removes a friend request', async () => {
    const a = await player('e2e-social-a');
    const b = await player('e2e-social-b');

    await a.agent
      .post('/social/friends/requests')
      .set('x-csrf-token', a.csrfToken)
      .send({ username: b.user.username })
      .expect(201);

    const bList = await b.agent.get('/social/friends').expect(200);
    const bBody = bList.body as {
      incoming: { requestId: string; username: string }[];
    };
    expect(bBody.incoming.some((r) => r.username === a.user.username)).toBe(
      true,
    );

    const outgoing = await a.agent.get('/social/friends').expect(200);
    const outgoingBody = outgoing.body as { outgoing: { username: string }[] };
    expect(
      outgoingBody.outgoing.some((r) => r.username === b.user.username),
    ).toBe(true);

    const requestId = (
      bBody.incoming.find((r) => r.username === a.user.username) as {
        requestId: string;
      }
    ).requestId;

    await b.agent
      .post(`/social/friends/requests/${requestId}/accept`)
      .set('x-csrf-token', b.csrfToken)
      .expect(200);

    const aFriends = await a.agent.get('/social/friends').expect(200);
    const aFriendsBody = aFriends.body as { friends: { username: string }[] };
    expect(
      aFriendsBody.friends.some((f) => f.username === b.user.username),
    ).toBe(true);

    await a.agent
      .post('/social/friends/requests')
      .set('x-csrf-token', a.csrfToken)
      .send({ username: b.user.username })
      .expect(409);

    await a.agent
      .delete(`/social/friends/${b.user.userId}`)
      .set('x-csrf-token', a.csrfToken)
      .expect(200);

    const aFriendsAfter = await a.agent.get('/social/friends').expect(200);
    const aFriendsAfterBody = aFriendsAfter.body as {
      friends: { username: string }[];
    };
    expect(
      aFriendsAfterBody.friends.some((f) => f.username === b.user.username),
    ).toBe(false);
  });

  it('rejects a friend request to yourself and to a nonexistent player', async () => {
    const a = await player('e2e-social-self');

    await a.agent
      .post('/social/friends/requests')
      .set('x-csrf-token', a.csrfToken)
      .send({ username: a.user.username })
      .expect(400);

    await a.agent
      .post('/social/friends/requests')
      .set('x-csrf-token', a.csrfToken)
      .send({ username: 'nobody-with-this-name' })
      .expect(404);
  });

  it('mutes and unmutes a player', async () => {
    const a = await player('e2e-social-mute-a');
    const b = await player('e2e-social-mute-b');

    await a.agent
      .post('/social/mutes')
      .set('x-csrf-token', a.csrfToken)
      .send({ username: b.user.username })
      .expect(201);

    const mutes = await a.agent.get('/social/mutes').expect(200);
    const mutesBody = mutes.body as { username: string }[];
    expect(mutesBody.some((m) => m.username === b.user.username)).toBe(true);

    await a.agent
      .delete(`/social/mutes/${b.user.userId}`)
      .set('x-csrf-token', a.csrfToken)
      .expect(200);

    const mutesAfter = await a.agent.get('/social/mutes').expect(200);
    expect((mutesAfter.body as unknown[]).length).toBe(0);
  });
});
