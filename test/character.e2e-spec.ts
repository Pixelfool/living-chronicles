import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';
import { createAgent, primeCsrfToken, registerUser } from './test-utils';

describe('Character (e2e)', () => {
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
    await prisma.character.deleteMany({
      where: { user: { email: { contains: 'e2e-char' } } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'e2e-char' } },
    });
    await app.close();
    redisClient.disconnect();
  });

  async function registeredAgentWithCsrf() {
    const agent = createAgent(server);
    const csrfToken = await primeCsrfToken(agent);
    await registerUser(agent, 'e2e-char');
    return { agent, csrfToken };
  }

  it('rejects character creation without a session', async () => {
    await request(server)
      .post('/characters')
      .send({ name: 'Nobody', archetype: 'DUELIST' })
      .expect(401);
  });

  it('rejects character creation with a valid session but no CSRF token', async () => {
    const { agent } = await registeredAgentWithCsrf();
    await agent
      .post('/characters')
      .send({ name: 'NoCsrf', archetype: 'DUELIST' })
      .expect(403);
  });

  it('creates and then views a character for the logged-in account', async () => {
    const { agent, csrfToken } = await registeredAgentWithCsrf();
    const name = `Hero${Date.now()}`;

    const createRes = await agent
      .post('/characters')
      .set('x-csrf-token', csrfToken)
      .send({ name, archetype: 'DUELIST' })
      .expect(201);

    const createBody = createRes.body as {
      name: string;
      body: number;
      level: number;
    };
    expect(createBody.name).toBe(name);
    expect(createBody.body).toBe(5);
    expect(createBody.level).toBe(1);

    const viewRes = await agent.get('/characters/me').expect(200);
    const viewBody = viewRes.body as { name: string };
    expect(viewBody.name).toBe(name);
  });

  it('rejects a second character on the same account', async () => {
    const { agent, csrfToken } = await registeredAgentWithCsrf();

    await agent
      .post('/characters')
      .set('x-csrf-token', csrfToken)
      .send({ name: `First${Date.now()}`, archetype: 'SCHOLAR' })
      .expect(201);

    await agent
      .post('/characters')
      .set('x-csrf-token', csrfToken)
      .send({ name: `Second${Date.now()}`, archetype: 'SCHOLAR' })
      .expect(409);
  });

  it('returns 404 viewing a character before one exists', async () => {
    const { agent } = await registeredAgentWithCsrf();
    await agent.get('/characters/me').expect(404);
  });
});
