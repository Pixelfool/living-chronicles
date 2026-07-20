import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

describe('Combat (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redisClient: Redis;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    redisClient = configureApp(app);
    await app.init();
    prisma = moduleRef.get(PrismaService);
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

  async function registerCharacterAndGetCookie(
    server: Parameters<typeof request>[0],
  ) {
    const suffix = uniqueSuffix();
    const email = `e2e-combat-${suffix}@example.com`;
    const username = `e2ecombat${suffix}`;
    const registerRes = await request(server)
      .post('/auth/register')
      .send({ email, username, password: 'correct horse battery staple' })
      .expect(201);
    const cookie = registerRes.headers['set-cookie'] as unknown as string[];

    await request(server)
      .post('/characters')
      .set('Cookie', cookie)
      .send({ name: `Fighter${suffix}`, archetype: 'DUELIST' })
      .expect(201);

    return cookie;
  }

  it('rejects combat routes without a session', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    await request(server).get('/combat/monsters').expect(401);
    await request(server)
      .post('/combat/fight')
      .send({ monsterId: 'rat' })
      .expect(401);
  });

  it('lists the monster roster', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const cookie = await registerCharacterAndGetCookie(server);

    const res = await request(server)
      .get('/combat/monsters')
      .set('Cookie', cookie)
      .expect(200);

    const body = res.body as { id: string }[];
    expect(body.some((m) => m.id === 'rat')).toBe(true);
  });

  it('rejects fighting an unknown monster', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const cookie = await registerCharacterAndGetCookie(server);

    await request(server)
      .post('/combat/fight')
      .set('Cookie', cookie)
      .send({ monsterId: 'not-a-real-monster' })
      .expect(400);
  });

  it('fights a monster, consumes an action point, and returns a battle log', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const cookie = await registerCharacterAndGetCookie(server);

    const res = await request(server)
      .post('/combat/fight')
      .set('Cookie', cookie)
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
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const cookie = await registerCharacterAndGetCookie(server);

    for (let i = 0; i < 10; i++) {
      await request(server)
        .post('/combat/fight')
        .set('Cookie', cookie)
        .send({ monsterId: 'rat' })
        .expect(201);
    }

    await request(server)
      .post('/combat/fight')
      .set('Cookie', cookie)
      .send({ monsterId: 'rat' })
      .expect(409);
  });
});
