import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { contains: 'e2e-auth' } },
    });
    await app.close();
  });

  it('registers, sets a session cookie, and returns the user via /auth/me', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const suffix = uniqueSuffix();
    const email = `e2e-auth-${suffix}@example.com`;
    const username = `e2eauth${suffix}`;
    const password = 'correct horse battery staple';

    const registerRes = await request(server)
      .post('/auth/register')
      .send({ email, username, password })
      .expect(201);

    const registerBody = registerRes.body as {
      username: string;
      email: string;
    };
    expect(registerBody.username).toBe(username);

    const cookie = registerRes.headers['set-cookie'] as unknown as string[];
    expect(cookie).toBeDefined();

    const meRes = await request(server)
      .get('/auth/me')
      .set('Cookie', cookie)
      .expect(200);
    const meBody = meRes.body as { email: string };
    expect(meBody.email).toBe(email);
  });

  it('rejects /auth/me without a session', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    await request(server).get('/auth/me').expect(401);
  });

  it('rejects login with the wrong password', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const suffix = uniqueSuffix();
    const email = `e2e-auth-wrong-${suffix}@example.com`;
    const username = `e2eauthwrong${suffix}`;

    await request(server)
      .post('/auth/register')
      .send({ email, username, password: 'correct horse battery staple' })
      .expect(201);

    await request(server)
      .post('/auth/login')
      .send({ username, password: 'not the right password' })
      .expect(401);
  });

  it('rejects registering with a duplicate email or username', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const suffix = uniqueSuffix();
    const email = `e2e-auth-dup-${suffix}@example.com`;
    const username = `e2edup${suffix}`;

    await request(server)
      .post('/auth/register')
      .send({ email, username, password: 'correct horse battery staple' })
      .expect(201);

    await request(server)
      .post('/auth/register')
      .send({
        email,
        username: `e2edup2${suffix}`,
        password: 'correct horse battery staple',
      })
      .expect(409);
  });
});
