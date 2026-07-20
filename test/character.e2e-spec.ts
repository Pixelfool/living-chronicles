import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Character (e2e)', () => {
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
      where: { user: { email: { contains: 'e2e-char' } } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'e2e-char' } },
    });
    await app.close();
    redisClient.disconnect();
  });

  async function registerAndGetCookie(server: Parameters<typeof request>[0]) {
    const email = `e2e-char-${Date.now()}-${Math.random()}@example.com`;
    const username = `e2echar${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const res = await request(server)
      .post('/auth/register')
      .send({ email, username, password: 'correct horse battery staple' })
      .expect(201);
    return res.headers['set-cookie'] as unknown as string[];
  }

  it('rejects character creation without a session', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    await request(server)
      .post('/characters')
      .send({ name: 'Nobody', archetype: 'DUELIST' })
      .expect(401);
  });

  it('creates and then views a character for the logged-in account', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const cookie = await registerAndGetCookie(server);
    const name = `Hero${Date.now()}`;

    const createRes = await request(server)
      .post('/characters')
      .set('Cookie', cookie)
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

    const viewRes = await request(server)
      .get('/characters/me')
      .set('Cookie', cookie)
      .expect(200);
    const viewBody = viewRes.body as { name: string };
    expect(viewBody.name).toBe(name);
  });

  it('rejects a second character on the same account', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const cookie = await registerAndGetCookie(server);

    await request(server)
      .post('/characters')
      .set('Cookie', cookie)
      .send({ name: `First${Date.now()}`, archetype: 'SCHOLAR' })
      .expect(201);

    await request(server)
      .post('/characters')
      .set('Cookie', cookie)
      .send({ name: `Second${Date.now()}`, archetype: 'SCHOLAR' })
      .expect(409);
  });

  it('returns 404 viewing a character before one exists', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const cookie = await registerAndGetCookie(server);
    await request(server)
      .get('/characters/me')
      .set('Cookie', cookie)
      .expect(404);
  });
});
