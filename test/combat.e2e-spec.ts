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

describe('Combat (e2e)', () => {
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
      where: { user: { email: { contains: 'e2e-combat' } } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'e2e-combat' } },
    });
    await app.close();
    redisClient.disconnect();
  });

  async function fighterAgent() {
    const agent = createAgent(server);
    const csrfToken = await primeCsrfToken(agent);
    await registerUser(agent, 'e2e-combat');

    await agent
      .post('/characters')
      .set('x-csrf-token', csrfToken)
      .send({
        name: `Fighter${uniqueSuffix()}`,
        archetype: 'DUELIST',
      })
      .expect(201);

    return { agent, csrfToken };
  }

  it('rejects combat routes without a session', async () => {
    await request(server).get('/combat/monsters').expect(401);
    await request(server)
      .post('/combat/fight')
      .send({ monsterId: 'rat' })
      .expect(401);
  });

  it('lists the monster roster', async () => {
    const { agent } = await fighterAgent();

    const res = await agent.get('/combat/monsters').expect(200);
    const body = res.body as { id: string }[];
    expect(body.some((m) => m.id === 'rat')).toBe(true);
  });

  it('rejects fighting without a CSRF token', async () => {
    const { agent } = await fighterAgent();
    await agent.post('/combat/fight').send({ monsterId: 'rat' }).expect(403);
  });

  it('rejects fighting an unknown monster', async () => {
    const { agent, csrfToken } = await fighterAgent();
    await agent
      .post('/combat/fight')
      .set('x-csrf-token', csrfToken)
      .send({ monsterId: 'not-a-real-monster' })
      .expect(400);
  });

  it('fights a monster, consumes an action point, and returns a battle log', async () => {
    const { agent, csrfToken } = await fighterAgent();

    const res = await agent
      .post('/combat/fight')
      .set('x-csrf-token', csrfToken)
      .send({ monsterId: 'rat' })
      .expect(201);

    const body = res.body as {
      victory: boolean;
      log: string[];
      character: { actionPoints: number };
    };
    expect(typeof body.victory).toBe('boolean');
    expect(body.log.length).toBeGreaterThan(0);
    expect(body.character.actionPoints).toBe(9);
  });

  it('runs out of action points after enough fights', async () => {
    const { agent, csrfToken } = await fighterAgent();

    for (let i = 0; i < 10; i++) {
      await agent
        .post('/combat/fight')
        .set('x-csrf-token', csrfToken)
        .send({ monsterId: 'rat' })
        .expect(201);
    }

    await agent
      .post('/combat/fight')
      .set('x-csrf-token', csrfToken)
      .send({ monsterId: 'rat' })
      .expect(409);
  });
});
