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
  uniqueSuffix,
} from './test-utils';

describe('Auth (e2e)', () => {
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
    await prisma.user.deleteMany({
      where: { email: { contains: 'e2e-auth' } },
    });
    await app.close();
    redisClient.disconnect();
  });

  it('registers, sets a session cookie, and returns the user via /auth/me', async () => {
    const agent = createAgent(server);
    const { email, username } = await registerUser(agent, 'e2e-auth');

    const meRes = await agent.get('/auth/me').expect(200);
    const meBody = meRes.body as { email: string; username: string };
    expect(meBody.email).toBe(email);
    expect(meBody.username).toBe(username);
  });

  it('rejects /auth/me without a session', async () => {
    await request(server).get('/auth/me').expect(401);
  });

  it('rejects login with the wrong password', async () => {
    const agent = createAgent(server);
    const { username } = await registerUser(agent, 'e2e-auth-wrong');

    // A fresh, unauthenticated agent - login (like register) carries no
    // ambient session yet, so no CSRF token is required here either.
    const anonAgent = createAgent(server);
    await anonAgent
      .post('/auth/login')
      .send({ username, password: 'not the right password' })
      .expect(401);
  });

  it('rejects registering with a duplicate email or username', async () => {
    const suffix = uniqueSuffix();
    const email = `e2e-auth-dup-${suffix}@example.com`;
    const username = `e2edup${suffix}`;

    const agent = createAgent(server);
    await agent
      .post('/auth/register')
      .send({ email, username, password: 'correct horse battery staple' })
      .expect(201);

    const secondAgent = createAgent(server);
    await secondAgent
      .post('/auth/register')
      .send({
        email,
        username: `e2edup2${suffix}`,
        password: 'correct horse battery staple',
      })
      .expect(409);
  });

  it('rejects logout without a CSRF token, then succeeds with one', async () => {
    // One registration shared by both assertions - register is
    // rate-limited (§3), and this file already spends most of that
    // budget on the tests above.
    const agent = createAgent(server);
    const csrfToken = await primeCsrfToken(agent);
    await registerUser(agent, 'e2e-auth-logout');

    await agent.post('/auth/logout').expect(403);
    // A rejected CSRF check must not have torn down the session.
    await agent.get('/auth/me').expect(200);

    await agent.post('/auth/logout').set('x-csrf-token', csrfToken).expect(200);
    await agent.get('/auth/me').expect(401);
  });
});
