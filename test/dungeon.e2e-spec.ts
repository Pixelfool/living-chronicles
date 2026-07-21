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
 * /auth/register is throttled to 5/60s per IP (build-plan-v1.md §3 -
 * bot-farmed accounts feeding the economy), and every Jest e2e spec file
 * runs in its own process with its own in-memory throttler state - so the
 * budget here is "however many registrations this one file makes," not a
 * global one. Kept deliberately low by reusing one registered character
 * per scenario instead of one per assertion.
 */
describe('Dungeons (e2e)', () => {
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
    await prisma.dungeonRun.deleteMany({
      where: { character: { user: { email: { contains: 'e2e-dungeon' } } } },
    });
    await prisma.itemInstance.deleteMany({
      where: { character: { user: { email: { contains: 'e2e-dungeon' } } } },
    });
    await prisma.character.deleteMany({
      where: { user: { email: { contains: 'e2e-dungeon' } } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'e2e-dungeon' } },
    });
    await app.close();
    redisClient.disconnect();
  });

  async function adventurerAgent(): Promise<{
    agent: TestAgent;
    csrfToken: string;
    characterId: string;
  }> {
    const agent = createAgent(server);
    const csrfToken = await primeCsrfToken(agent);
    await registerUser(agent, 'e2e-dungeon');

    const res = await agent
      .post('/characters')
      .set('x-csrf-token', csrfToken)
      .send({ name: `Delver${uniqueSuffix()}`, archetype: 'DUELIST' })
      .expect(201);
    const character = res.body as { id: string };

    return { agent, csrfToken, characterId: character.id };
  }

  /**
   * Ready to enter the Old Mill: in Millbrook, well above its level
   * requirement, and at full HP - bypassing world.travel's own RNG/action-
   * point mechanics (covered by that module's tests) to get there directly.
   */
  async function readyAdventurerAgent() {
    const created = await adventurerAgent();
    await prisma.character.update({
      where: { id: created.characterId },
      data: { currentCityId: 'millbrook', level: 10, hp: 200, maxHp: 200 },
    });
    return created;
  }

  it('rejects dungeon routes without a session', async () => {
    await request(server).get('/world/dungeons').expect(401);
    await request(server)
      .get('/world/dungeons/old-mill-depths/threshold')
      .expect(401);
    await request(server)
      .post('/world/dungeons/old-mill-depths/enter')
      .expect(401);
  });

  it('gates a dungeon behind its city and level, both for listing and entering', async () => {
    const { agent, csrfToken } = await adventurerAgent();

    // A fresh character starts in Haven, well under old-mill-depths' level
    // 3 requirement - fails both checks at once.
    const list = (await agent.get('/world/dungeons').expect(200))
      .body as unknown[];
    expect(list).toEqual([]);

    await agent
      .post('/world/dungeons/old-mill-depths/enter')
      .set('x-csrf-token', csrfToken)
      .expect(400);
  });

  it('reads a free, repeatable threshold; enters; blocks a second concurrent expedition; and clears for the completion reward', async () => {
    const { agent, csrfToken, characterId } = await readyAdventurerAgent();

    const list = (await agent.get('/world/dungeons').expect(200)).body as {
      id: string;
    }[];
    expect(list.map((d) => d.id)).toContain('old-mill-depths');

    const beforeThreshold = (await agent.get('/characters/me').expect(200))
      .body as { actionPoints: number };
    const first = (
      await agent.get('/world/dungeons/old-mill-depths/threshold').expect(200)
    ).body as { tier: string; flavor: string };
    const second = (
      await agent.get('/world/dungeons/old-mill-depths/threshold').expect(200)
    ).body as { tier: string; flavor: string };
    expect(['CONFIDENT', 'STEADY', 'UNEASY', 'DESPERATE']).toContain(
      first.tier,
    );
    expect(first.tier).toBe(second.tier);
    const afterThreshold = (await agent.get('/characters/me').expect(200))
      .body as { actionPoints: number };
    expect(afterThreshold.actionPoints).toBe(beforeThreshold.actionPoints);

    const enterRes = await agent
      .post('/world/dungeons/old-mill-depths/enter')
      .set('x-csrf-token', csrfToken)
      .expect(201);
    const entered = enterRes.body as { beatLog: string[]; cleared: boolean };
    expect(entered.cleared).toBe(false);
    expect(entered.beatLog.length).toBeGreaterThan(0);

    const afterEnter = (await agent.get('/characters/me').expect(200)).body as {
      actionPoints: number;
    };
    expect(afterEnter.actionPoints).toBe(beforeThreshold.actionPoints - 3);

    const current = (await agent.get('/world/dungeons/current').expect(200))
      .body as { status: string; currentBeat: number; totalBeats: number };
    expect(current.status).toBe('IN_PROGRESS');
    expect(current.currentBeat).toBe(1);
    expect(current.totalBeats).toBe(4);

    // Already on this expedition - a second enter is a conflict, not a
    // second concurrent run.
    await agent
      .post('/world/dungeons/old-mill-depths/enter')
      .set('x-csrf-token', csrfToken)
      .expect(409);

    const beforeGold = (await agent.get('/characters/me').expect(200)).body as {
      gold: number;
    };

    let cleared = false;
    for (let i = 0; i < 5 && !cleared; i += 1) {
      const res = await agent
        .post('/world/dungeons/current/advance')
        .set('x-csrf-token', csrfToken)
        .expect(201);
      cleared = (res.body as { cleared: boolean }).cleared;
    }
    expect(cleared).toBe(true);

    await agent.get('/world/dungeons/current').expect(404);

    const afterGold = (await agent.get('/characters/me').expect(200)).body as {
      gold: number;
    };
    expect(afterGold.gold).toBe(beforeGold.gold + 40);

    const run = await prisma.dungeonRun.findFirst({
      where: { characterId, dungeonId: 'old-mill-depths' },
    });
    expect(run?.status).toBe('CLEARED');

    // Nothing left to advance once cleared.
    await agent
      .post('/world/dungeons/current/advance')
      .set('x-csrf-token', csrfToken)
      .expect(404);
  });

  it('only lets one of two concurrent enter requests succeed', async () => {
    const { agent, csrfToken } = await readyAdventurerAgent();

    const [first, second] = await Promise.all([
      agent
        .post('/world/dungeons/old-mill-depths/enter')
        .set('x-csrf-token', csrfToken),
      agent
        .post('/world/dungeons/old-mill-depths/enter')
        .set('x-csrf-token', csrfToken),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  it('lets a player retreat mid-expedition, freeing them to enter again, and rejects actions with no active expedition', async () => {
    const { agent, csrfToken } = await readyAdventurerAgent();

    // No expedition yet.
    await agent
      .post('/world/dungeons/current/advance')
      .set('x-csrf-token', csrfToken)
      .expect(404);
    await agent
      .post('/world/dungeons/current/retreat')
      .set('x-csrf-token', csrfToken)
      .expect(404);

    await agent
      .post('/world/dungeons/old-mill-depths/enter')
      .set('x-csrf-token', csrfToken)
      .expect(201);

    const retreatRes = await agent
      .post('/world/dungeons/current/retreat')
      .set('x-csrf-token', csrfToken)
      .expect(201);
    expect((retreatRes.body as { atBeat: number }).atBeat).toBe(1);

    await agent.get('/world/dungeons/current').expect(404);

    // Retreating twice in a row is a conflict, not a crash.
    await agent
      .post('/world/dungeons/current/retreat')
      .set('x-csrf-token', csrfToken)
      .expect(404);

    // A retreated run never permanently locks out future expeditions.
    await agent
      .post('/world/dungeons/old-mill-depths/enter')
      .set('x-csrf-token', csrfToken)
      .expect(201);
  });
});
