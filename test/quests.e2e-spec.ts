import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
 * Quest objective progress is event-driven (M9 design discussion), and
 * combat/travel outcomes are randomized - rather than grinding through
 * real, flaky fights to advance objectives, these tests emit the same
 * domain events combat/world/inventory already emit in production
 * (BattleFinished, ItemAcquired, PlayerEnteredLocation) directly onto the
 * app's event bus. This tests the Quests module's own logic, not
 * combat/travel RNG - those have their own test coverage.
 */
describe('Quests (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let events: EventEmitter2;
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
    events = moduleRef.get(EventEmitter2);
    server = app.getHttpServer() as Parameters<typeof request>[0];
  });

  afterAll(async () => {
    await prisma.questProgress.deleteMany({
      where: { character: { user: { email: { contains: 'e2e-quest' } } } },
    });
    await prisma.itemInstance.deleteMany({
      where: { character: { user: { email: { contains: 'e2e-quest' } } } },
    });
    await prisma.character.deleteMany({
      where: { user: { email: { contains: 'e2e-quest' } } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'e2e-quest' } },
    });
    await app.close();
    redisClient.disconnect();
  });

  /**
   * The @OnEvent handlers that advance quest progress are async (they do
   * real DB writes), so emit() returning doesn't mean the write has
   * landed yet. Poll actual persisted progress instead of guessing a
   * fixed delay.
   */
  async function waitForObjectiveProgress(
    characterId: string,
    questId: string,
    predicate: (progress: number[]) => boolean,
  ): Promise<void> {
    const deadline = Date.now() + 2000;
    for (;;) {
      const row = await prisma.questProgress.findUnique({
        where: { characterId_questId: { characterId, questId } },
      });
      if (row && predicate(row.objectiveProgress)) {
        return;
      }
      if (Date.now() > deadline) {
        throw new Error(
          `timed out waiting for quest "${questId}" progress to advance`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  async function adventurerAgent(): Promise<{
    agent: TestAgent;
    csrfToken: string;
    characterId: string;
  }> {
    const agent = createAgent(server);
    const csrfToken = await primeCsrfToken(agent);
    await registerUser(agent, 'e2e-quest');

    const res = await agent
      .post('/characters')
      .set('x-csrf-token', csrfToken)
      .send({ name: `Wanderer${uniqueSuffix()}`, archetype: 'DUELIST' })
      .expect(201);

    const character = res.body as { id: string };
    return { agent, csrfToken, characterId: character.id };
  }

  it('rejects quest routes without a session', async () => {
    await request(server).get('/quests/available').expect(401);
  });

  it('lists the first quest of a chain as available, but not its sequel', async () => {
    const { agent } = await adventurerAgent();

    const res = await agent.get('/quests/available').expect(200);
    const ids = (res.body as { id: string }[]).map((q) => q.id);
    expect(ids).toContain('rat-problem');
    expect(ids).not.toContain('the-ashford-road');
    expect(ids).not.toContain('highwaymen');
  });

  it('rejects accepting a quest whose giver is in another city', async () => {
    const { agent, csrfToken } = await adventurerAgent();

    await agent
      .post('/quests/highwaymen/accept')
      .set('x-csrf-token', csrfToken)
      .expect(400);
  });

  it('walks a full quest chain: accept, progress via events, and turn in for rewards', async () => {
    const { agent, csrfToken, characterId } = await adventurerAgent();

    await agent
      .post('/quests/rat-problem/accept')
      .set('x-csrf-token', csrfToken)
      .expect(201);

    await agent
      .post('/quests/rat-problem/accept')
      .set('x-csrf-token', csrfToken)
      .expect(409);

    let mine = (await agent.get('/quests/mine').expect(200)).body as {
      questId: string;
      objectives: { progress: number; target: number }[];
      readyToTurnIn: boolean;
    }[];
    const ratQuest = mine.find((q) => q.questId === 'rat-problem');
    expect(ratQuest?.objectives).toEqual([
      { description: expect.any(String) as string, progress: 0, target: 3 },
    ]);

    events.emit('BattleFinished', {
      userId: 'irrelevant',
      characterId,
      monsterId: 'rat',
      victory: false,
      xpGained: 0,
    });
    events.emit('BattleFinished', {
      userId: 'irrelevant',
      characterId,
      monsterId: 'bandit',
      victory: true,
      xpGained: 35,
    });
    for (let i = 0; i < 3; i += 1) {
      events.emit('BattleFinished', {
        userId: 'irrelevant',
        characterId,
        monsterId: 'rat',
        victory: true,
        xpGained: 15,
      });
    }
    await waitForObjectiveProgress(
      characterId,
      'rat-problem',
      (progress) => (progress[0] ?? 0) >= 3,
    );

    mine = (await agent.get('/quests/mine').expect(200)).body as typeof mine;
    const afterKills = mine.find((q) => q.questId === 'rat-problem');
    expect(afterKills?.objectives[0].progress).toBe(3);
    expect(afterKills?.readyToTurnIn).toBe(true);

    const before = (await agent.get('/characters/me').expect(200)).body as {
      xp: number;
      gold: number;
    };

    await agent
      .post('/quests/rat-problem/complete')
      .set('x-csrf-token', csrfToken)
      .expect(201);

    await agent
      .post('/quests/rat-problem/complete')
      .set('x-csrf-token', csrfToken)
      .expect(404);

    const after = (await agent.get('/characters/me').expect(200)).body as {
      xp: number;
      gold: number;
    };
    expect(after.xp).toBe(before.xp + 20);
    expect(after.gold).toBe(before.gold + 10);

    // Sequel becomes available once the prerequisite is completed.
    const available = (await agent.get('/quests/available').expect(200))
      .body as { id: string }[];
    expect(available.map((q) => q.id)).toContain('the-ashford-road');

    await agent
      .post('/quests/the-ashford-road/accept')
      .set('x-csrf-token', csrfToken)
      .expect(201);

    events.emit('PlayerEnteredLocation', {
      userId: 'irrelevant',
      characterId,
      cityId: 'ashford',
    });
    await waitForObjectiveProgress(
      characterId,
      'the-ashford-road',
      (progress) => (progress[0] ?? 0) >= 1,
    );

    // The giver stayed in Haven, so the character (never actually moved
    // by this test) is still exactly where they need to be to turn it in.
    await agent
      .post('/quests/the-ashford-road/complete')
      .set('x-csrf-token', csrfToken)
      .expect(201);

    // Highwaymen's giver is in Ashford - move the character there directly
    // (bypassing world.travel's own RNG/action-point mechanics, which are
    // covered by that module's own tests) to reach the next link.
    await prisma.character.update({
      where: { id: characterId },
      data: { currentCityId: 'ashford' },
    });

    await agent
      .post('/quests/highwaymen/accept')
      .set('x-csrf-token', csrfToken)
      .expect(201);

    for (let i = 0; i < 2; i += 1) {
      events.emit('BattleFinished', {
        userId: 'irrelevant',
        characterId,
        monsterId: 'bandit',
        victory: true,
        xpGained: 35,
      });
    }
    for (let i = 0; i < 3; i += 1) {
      events.emit('ItemAcquired', {
        userId: 'irrelevant',
        characterId,
        itemInstanceId: `fixture-${i}`,
        itemId: 'scrap-metal',
      });
    }
    await waitForObjectiveProgress(
      characterId,
      'highwaymen',
      (progress) => (progress[0] ?? 0) >= 2 && (progress[1] ?? 0) >= 3,
    );

    await agent
      .post('/quests/highwaymen/complete')
      .set('x-csrf-token', csrfToken)
      .expect(201);

    const inventory = (await agent.get('/inventory').expect(200)).body as {
      itemId: string;
    }[];
    expect(inventory.some((i) => i.itemId === 'rusty-sword')).toBe(true);
  });

  /**
   * Rewards are granted inside the same transaction that flips
   * QuestProgress to COMPLETED (M9 review discussion) specifically so two
   * concurrent turn-ins can never both succeed and double-grant rewards.
   * The sequential double-complete case above only exercises the outer
   * pre-check (404, "you have not accepted this quest"); it never reaches
   * the transaction's own atomic guard. This test fires two genuinely
   * concurrent requests to prove that guard actually holds under a real
   * race, not just under a race that's already lost by the time the
   * second request is validated.
   */
  it('grants a quest reward exactly once under concurrent turn-in requests', async () => {
    const { agent, csrfToken, characterId } = await adventurerAgent();

    await agent
      .post('/quests/rat-problem/accept')
      .set('x-csrf-token', csrfToken)
      .expect(201);

    for (let i = 0; i < 3; i += 1) {
      events.emit('BattleFinished', {
        userId: 'irrelevant',
        characterId,
        monsterId: 'rat',
        victory: true,
        xpGained: 15,
      });
    }
    await waitForObjectiveProgress(
      characterId,
      'rat-problem',
      (progress) => (progress[0] ?? 0) >= 3,
    );

    const before = (await agent.get('/characters/me').expect(200)).body as {
      xp: number;
      gold: number;
    };

    const [first, second] = await Promise.all([
      agent.post('/quests/rat-problem/complete').set('x-csrf-token', csrfToken),
      agent.post('/quests/rat-problem/complete').set('x-csrf-token', csrfToken),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);

    const after = (await agent.get('/characters/me').expect(200)).body as {
      xp: number;
      gold: number;
    };
    expect(after.xp).toBe(before.xp + 20);
    expect(after.gold).toBe(before.gold + 10);
  });
});
