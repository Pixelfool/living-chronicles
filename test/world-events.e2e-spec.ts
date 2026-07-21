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
  TestAgent,
  uniqueSuffix,
} from './test-utils';

/**
 * Covers the M12 World Events lifecycle end-to-end. Instances are
 * inserted directly via Prisma with the phase already set (rather than
 * waiting on WorldEventsTickTask's real cron) so each test can exercise
 * EMERGING/ACTIVE/RESOLVED independently and quickly - the tick task's
 * own phase-transition logic is covered by world-event-resolver.spec.ts
 * plus manual verification, not by waiting a real minute here.
 */
describe('World Events (e2e)', () => {
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

  beforeEach(async () => {
    // Each test owns its own instance for 'ashford' - clearing first
    // keeps getForCity's "most recent" lookup from picking up a stale
    // row left behind by an earlier test in this file.
    await prisma.worldEventInstance.deleteMany({
      where: { cityId: 'ashford' },
    });
  });

  afterAll(async () => {
    await prisma.worldEventInstance.deleteMany({
      where: { cityId: 'ashford' },
    });
    await prisma.itemInstance.deleteMany({
      where: {
        character: { user: { email: { contains: 'e2e-worldevents' } } },
      },
    });
    await prisma.auditLogEntry.deleteMany({
      where: { actor: { email: { contains: 'e2e-worldevents' } } },
    });
    await prisma.character.deleteMany({
      where: { user: { email: { contains: 'e2e-worldevents' } } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'e2e-worldevents' } },
    });
    await app.close();
    redisClient.disconnect();
  });

  async function adventurerInAshford(): Promise<{
    agent: TestAgent;
    csrfToken: string;
    characterId: string;
  }> {
    const agent = createAgent(server);
    const csrfToken = await primeCsrfToken(agent);
    await registerUser(agent, 'e2e-worldevents');

    const res = await agent
      .post('/characters')
      .set('x-csrf-token', csrfToken)
      .send({ name: `Defender${uniqueSuffix()}`, archetype: 'DUELIST' })
      .expect(201);
    const character = res.body as { id: string };

    await prisma.character.update({
      where: { id: character.id },
      data: {
        currentCityId: 'ashford',
        level: 10,
        hp: 200,
        maxHp: 200,
        gold: 500,
      },
    });

    return { agent, csrfToken, characterId: character.id };
  }

  it('rejects world event routes without a session', async () => {
    await request(server).get('/world/events/ashford').expect(401);
    await request(server).post('/world/events/ashford/fight').expect(401);
    await request(server).post('/world/events/ashford/support').expect(401);
  });

  it('shows NONE when no instance exists for a city', async () => {
    const { agent } = await adventurerInAshford();
    const res = await agent.get('/world/events/ashford').expect(200);
    expect((res.body as { phase: string }).phase).toBe('NONE');
  });

  it('shows the telegraph during EMERGING and rejects responses before ACTIVE', async () => {
    const { agent, csrfToken } = await adventurerInAshford();

    await prisma.worldEventInstance.create({
      data: {
        definitionId: 'raiding-warband',
        cityId: 'ashford',
        phase: 'EMERGING',
        activeAt: new Date(Date.now() + 1000 * 60 * 60),
        resolvesAt: new Date(Date.now() + 1000 * 60 * 60 * 2),
      },
    });

    const res = await agent.get('/world/events/ashford').expect(200);
    const body = res.body as { phase: string; telegraph: string };
    expect(body.phase).toBe('EMERGING');
    expect(body.telegraph.length).toBeGreaterThan(0);

    await agent
      .post('/world/events/ashford/fight')
      .set('x-csrf-token', csrfToken)
      .expect(404);
    await agent
      .post('/world/events/ashford/support')
      .set('x-csrf-token', csrfToken)
      .expect(404);
  });

  it('lets a defender fight and a supporter contribute during ACTIVE, without ever exposing raw scores', async () => {
    const { agent, csrfToken } = await adventurerInAshford();

    const instance = await prisma.worldEventInstance.create({
      data: {
        definitionId: 'raiding-warband',
        cityId: 'ashford',
        phase: 'ACTIVE',
        activeAt: new Date(Date.now() - 1000 * 60 * 60),
        resolvesAt: new Date(Date.now() + 1000 * 60 * 60),
      },
    });

    const activeView = (await agent.get('/world/events/ashford').expect(200))
      .body as {
      phase: string;
      mood: string;
      responseTypes: string[];
    };
    expect(activeView.phase).toBe('ACTIVE');
    expect(['STRUGGLING', 'HOLDING']).toContain(activeView.mood);
    expect(activeView.responseTypes.sort()).toEqual(['FIGHT', 'SUPPORT']);
    expect(activeView).not.toHaveProperty('fightScore');
    expect(activeView).not.toHaveProperty('supportScore');

    const beforeAp = (await agent.get('/characters/me').expect(200)).body as {
      actionPoints: number;
    };
    await agent
      .post('/world/events/ashford/fight')
      .set('x-csrf-token', csrfToken)
      .expect(201);
    const afterAp = (await agent.get('/characters/me').expect(200)).body as {
      actionPoints: number;
    };
    expect(afterAp.actionPoints).toBe(beforeAp.actionPoints - 1);

    const beforeGold = (await agent.get('/characters/me').expect(200)).body as {
      gold: number;
    };
    await agent
      .post('/world/events/ashford/support')
      .set('x-csrf-token', csrfToken)
      .expect(201);
    const afterGold = (await agent.get('/characters/me').expect(200)).body as {
      gold: number;
    };
    expect(afterGold.gold).toBe(beforeGold.gold - 25);

    // The instance itself only ever carries anonymous aggregate tallies -
    // no per-character link lives here for either response.
    const updated = await prisma.worldEventInstance.findUniqueOrThrow({
      where: { id: instance.id },
    });
    expect(updated.fightScore).toBe(1);
    expect(updated.supportScore).toBe(1);

    // support() moves real gold, so - like every other gold sink
    // (ShopsService, TradesService) - it writes the same economy audit
    // trail. This is a deliberate exception to "no per-character trace":
    // it records that gold left circulation, not who fought or watched.
    const auditEntries = await prisma.auditLogEntry.findMany({
      where: { action: 'WorldEventSupport' },
    });
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0].detail).toMatchObject({
      cityId: 'ashford',
      instanceId: instance.id,
      gold: 25,
    });
  });

  it('rejects support when the character cannot afford it', async () => {
    const { agent, csrfToken, characterId } = await adventurerInAshford();
    await prisma.character.update({
      where: { id: characterId },
      data: { gold: 5 },
    });

    await prisma.worldEventInstance.create({
      data: {
        definitionId: 'raiding-warband',
        cityId: 'ashford',
        phase: 'ACTIVE',
        activeAt: new Date(Date.now() - 1000 * 60 * 60),
        resolvesAt: new Date(Date.now() + 1000 * 60 * 60),
      },
    });

    await agent
      .post('/world/events/ashford/support')
      .set('x-csrf-token', csrfToken)
      .expect(409);
  });

  it('shows permanent residue text once RESOLVED, and rejects further responses', async () => {
    const { agent, csrfToken } = await adventurerInAshford();

    await prisma.worldEventInstance.create({
      data: {
        definitionId: 'raiding-warband',
        cityId: 'ashford',
        phase: 'RESOLVED',
        activeAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
        resolvesAt: new Date(Date.now() - 1000 * 60 * 60),
        resolvedOutcome: 'DEFENDED',
        resolvedAt: new Date(Date.now() - 1000 * 60 * 60),
      },
    });

    const res = await agent.get('/world/events/ashford').expect(200);
    const body = res.body as { phase: string; residue: string };
    expect(body.phase).toBe('RESOLVED');
    expect(body.residue).toContain('scar');

    await agent
      .post('/world/events/ashford/fight')
      .set('x-csrf-token', csrfToken)
      .expect(404);
  });
});
