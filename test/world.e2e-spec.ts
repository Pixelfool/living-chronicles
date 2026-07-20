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

describe('World (e2e)', () => {
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
      where: { user: { email: { contains: 'e2e-world' } } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'e2e-world' } },
    });
    await app.close();
    redisClient.disconnect();
  });

  async function travelerAgent() {
    const agent = createAgent(server);
    const csrfToken = await primeCsrfToken(agent);
    await registerUser(agent, 'e2e-world');

    await agent
      .post('/characters')
      .set('x-csrf-token', csrfToken)
      .send({ name: `Wanderer${uniqueSuffix()}`, archetype: 'DIPLOMAT' })
      .expect(201);

    return { agent, csrfToken };
  }

  it('rejects world routes without a session', async () => {
    await request(server).get('/world/cities').expect(401);
    await request(server)
      .post('/world/travel')
      .send({ toCityId: 'millbrook' })
      .expect(401);
  });

  it('lists cities and routes; a new character starts in Haven', async () => {
    const { agent } = await travelerAgent();

    const citiesRes = await agent.get('/world/cities').expect(200);
    const cities = citiesRes.body as { id: string }[];
    expect(cities.map((c) => c.id).sort()).toEqual([
      'ashford',
      'haven',
      'millbrook',
    ]);

    const routesRes = await agent.get('/world/routes').expect(200);
    const routes = routesRes.body as { id: string; cities: string[] }[];
    expect(routes.length).toBe(3);

    const meRes = await agent.get('/characters/me').expect(200);
    const me = meRes.body as { currentCityId: string };
    expect(me.currentCityId).toBe('haven');
  });

  it('rejects invalid travel requests without changing anything', async () => {
    const { agent, csrfToken } = await travelerAgent();

    // No CSRF token.
    await agent
      .post('/world/travel')
      .send({ toCityId: 'millbrook' })
      .expect(403);

    // Already there.
    await agent
      .post('/world/travel')
      .set('x-csrf-token', csrfToken)
      .send({ toCityId: 'haven' })
      .expect(400);

    // City doesn't exist.
    await agent
      .post('/world/travel')
      .set('x-csrf-token', csrfToken)
      .send({ toCityId: 'nowhere' })
      .expect(404);

    const meRes = await agent.get('/characters/me').expect(200);
    const me = meRes.body as { currentCityId: string; actionPoints: number };
    expect(me.currentCityId).toBe('haven');
    expect(me.actionPoints).toBe(10);
  });

  it('travels between connected cities, spending action points and updating location', async () => {
    const { agent, csrfToken } = await travelerAgent();

    const res = await agent
      .post('/world/travel')
      .set('x-csrf-token', csrfToken)
      .send({ toCityId: 'millbrook' })
      .expect(201);

    const body = res.body as {
      city: { id: string };
      character: { currentCityId: string; actionPoints: number };
      encounter: unknown;
    };
    expect(body.city.id).toBe('millbrook');
    expect(body.character.currentCityId).toBe('millbrook');
    // millbrook-path costs 1 action point
    expect(body.character.actionPoints).toBe(9);
    expect(body.encounter === null || typeof body.encounter === 'object').toBe(
      true,
    );

    const viewRes = await agent.get('/characters/me').expect(200);
    const viewBody = viewRes.body as { currentCityId: string };
    expect(viewBody.currentCityId).toBe('millbrook');
  });

  it('runs out of action points after enough travel', async () => {
    const { agent, csrfToken } = await travelerAgent();

    // haven -> millbrook (1 AP) -> haven (1 AP), 5 times = 10 AP total
    for (let i = 0; i < 5; i++) {
      await agent
        .post('/world/travel')
        .set('x-csrf-token', csrfToken)
        .send({ toCityId: 'millbrook' })
        .expect(201);
      await agent
        .post('/world/travel')
        .set('x-csrf-token', csrfToken)
        .send({ toCityId: 'haven' })
        .expect(201);
    }

    await agent
      .post('/world/travel')
      .set('x-csrf-token', csrfToken)
      .send({ toCityId: 'millbrook' })
      .expect(409);
  });
});
