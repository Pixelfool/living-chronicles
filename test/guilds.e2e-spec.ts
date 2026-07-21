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
  uniqueSuffix,
} from './test-utils';

// /auth/register is throttled to 5/60s (architecture.md §7 - anti bot-farm
// registration limiting). This whole file is one Nest app instance, so
// that budget is shared across every test below - keep total registered
// players at or under it by reusing the same small cast across a single
// flowing scenario rather than registering fresh users per test.
describe('Guilds (e2e)', () => {
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
      where: { email: { contains: 'e2e-guild' } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    await prisma.guildMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.guildInvite.deleteMany({
      where: {
        OR: [
          { invitedUserId: { in: userIds } },
          { invitedById: { in: userIds } },
        ],
      },
    });
    await prisma.guild.deleteMany({
      where: { name: { contains: 'E2EGuild' } },
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

  function guildName(): string {
    return `E2EGuild${uniqueSuffix()}`;
  }

  function guildTag(): string {
    // Slice from the tail, not the head: uniqueSuffix() is a timestamp
    // prefix followed by random chars, and two calls in the same
    // millisecond share that prefix - slicing the front would collide.
    return uniqueSuffix().slice(-6);
  }

  async function invite(
    inviter: { agent: TestAgent; csrfToken: string },
    invitee: { agent: TestAgent; user: RegisteredUser },
  ): Promise<void> {
    await inviter.agent
      .post('/guilds/invites')
      .set('x-csrf-token', inviter.csrfToken)
      .send({ username: invitee.user.username })
      .expect(201);
  }

  async function acceptLatestInvite(invitee: {
    agent: TestAgent;
    csrfToken: string;
  }): Promise<void> {
    const invites = await invitee.agent.get('/guilds/invites').expect(200);
    const inviteId = (invites.body as { inviteId: string }[])[0].inviteId;
    await invitee.agent
      .post(`/guilds/invites/${inviteId}/accept`)
      .set('x-csrf-token', invitee.csrfToken)
      .expect(200);
  }

  it('rejects guild routes without a session', async () => {
    await request(server).get('/guilds/me').expect(401);
  });

  it('walks the full guild lifecycle with a small reused cast', async () => {
    const leader = await player('e2e-guild-leader');
    const alice = await player('e2e-guild-alice');
    const bob = await player('e2e-guild-bob');

    // Create, invite, accept.
    await leader.agent
      .post('/guilds')
      .set('x-csrf-token', leader.csrfToken)
      .send({ name: guildName(), tag: guildTag() })
      .expect(201);

    await invite(leader, alice);
    await acceptLatestInvite(alice);

    let guild = await leader.agent.get('/guilds/me').expect(200);
    let members = (
      guild.body as { members: { username: string; role: string }[] }
    ).members;
    expect(members.some((m) => m.username === alice.user.username)).toBe(true);

    // A plain member cannot invite.
    await alice.agent
      .post('/guilds/invites')
      .set('x-csrf-token', alice.csrfToken)
      .send({ username: bob.user.username })
      .expect(403);

    // Promoted to officer, alice can invite.
    await leader.agent
      .post(`/guilds/members/${alice.user.userId}/role`)
      .set('x-csrf-token', leader.csrfToken)
      .send({ role: 'OFFICER' })
      .expect(200);
    await invite(alice, bob);
    await acceptLatestInvite(bob);

    // Leader kicks bob.
    await leader.agent
      .post(`/guilds/members/${bob.user.userId}/kick`)
      .set('x-csrf-token', leader.csrfToken)
      .expect(200);
    guild = await leader.agent.get('/guilds/me').expect(200);
    members = (guild.body as { members: { username: string; role: string }[] })
      .members;
    expect(members.some((m) => m.username === bob.user.username)).toBe(false);

    // Leader cannot leave while alice (officer) is still a member.
    await leader.agent
      .post('/guilds/leave')
      .set('x-csrf-token', leader.csrfToken)
      .expect(409);

    // Transfer leadership to alice instead.
    await leader.agent
      .post('/guilds/transfer')
      .set('x-csrf-token', leader.csrfToken)
      .send({ username: alice.user.username })
      .expect(200);
    guild = await alice.agent.get('/guilds/me').expect(200);
    members = (guild.body as { members: { username: string; role: string }[] })
      .members;
    expect(members.find((m) => m.username === alice.user.username)?.role).toBe(
      'LEADER',
    );
    expect(members.find((m) => m.username === leader.user.username)?.role).toBe(
      'OFFICER',
    );

    // Ex-leader can now leave, since they're no longer the leader.
    await leader.agent
      .post('/guilds/leave')
      .set('x-csrf-token', leader.csrfToken)
      .expect(200);

    // Bob (kicked earlier, so guild-less) forms his own guild - inviting
    // him into alice's guild should now fail because he's already in one.
    await bob.agent
      .post('/guilds')
      .set('x-csrf-token', bob.csrfToken)
      .send({ name: guildName(), tag: guildTag() })
      .expect(201);
    await alice.agent
      .post('/guilds/invites')
      .set('x-csrf-token', alice.csrfToken)
      .send({ username: bob.user.username })
      .expect(409);

    // Solo leader can disband.
    await bob.agent
      .post('/guilds/disband')
      .set('x-csrf-token', bob.csrfToken)
      .expect(200);
    await bob.agent.get('/guilds/me').expect(404);

    await alice.agent
      .post('/guilds/disband')
      .set('x-csrf-token', alice.csrfToken)
      .expect(200);
    await alice.agent.get('/guilds/me').expect(404);
  });
});
