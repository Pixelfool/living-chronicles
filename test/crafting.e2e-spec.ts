import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { ContentService } from '../src/content/content.service';
import { Recipe } from '../src/content/schemas';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createAgent,
  primeCsrfToken,
  registerUser,
  TestAgent,
  uniqueSuffix,
} from './test-utils';

describe('Crafting (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redisClient: Redis;
  let server: Parameters<typeof request>[0];

  /**
   * No shipped recipe currently sets minProfessionLevel > 1 or
   * requiresDiscovery: true (build-plan-v1.md M8's design discussion:
   * requiresDiscovery is a schema-only placeholder for now), so nothing
   * in content/core/recipes.yaml exercises those rejection paths. Rather
   * than adding an unobtainable fixture recipe to the real shipped
   * content pack, a single spy on ContentService.findRecipe (installed
   * once below, cleared per test) serves synthetic recipes for whatever
   * ids a test registers here, falling through to the real content for
   * every other id.
   */
  const recipeStubs = new Map<string, Recipe>();

  function stubRecipe(id: string, overrides: Partial<Recipe>): void {
    recipeStubs.set(id, {
      id,
      professionId: 'blacksmith',
      name: 'Test Recipe',
      minProfessionLevel: 1,
      requiresDiscovery: false,
      durationSeconds: 60,
      materials: [{ itemId: 'scrap-metal', quantity: 1 }],
      outputItemId: 'iron-dagger',
      outputQuantity: 1,
      professionXpReward: 0,
      blurb: 'test fixture',
      ...overrides,
    } satisfies Recipe);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    redisClient = configureApp(app);
    await app.init();
    prisma = moduleRef.get(PrismaService);
    server = app.getHttpServer() as Parameters<typeof request>[0];

    const content = moduleRef.get(ContentService);
    const realFindRecipe = content.findRecipe.bind(content);
    jest
      .spyOn(content, 'findRecipe')
      .mockImplementation(
        (id: string) => recipeStubs.get(id) ?? realFindRecipe(id),
      );
  });

  afterEach(() => {
    recipeStubs.clear();
  });

  afterAll(async () => {
    await prisma.craftingJob.deleteMany({
      where: { character: { user: { email: { contains: 'e2e-craft' } } } },
    });
    await prisma.itemInstance.deleteMany({
      where: { character: { user: { email: { contains: 'e2e-craft' } } } },
    });
    await prisma.character.deleteMany({
      where: { user: { email: { contains: 'e2e-craft' } } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'e2e-craft' } },
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
    await registerUser(agent, 'e2e-craft');

    const res = await agent
      .post('/characters')
      .set('x-csrf-token', csrfToken)
      .send({ name: `Smith${uniqueSuffix()}`, archetype: 'DUELIST' })
      .expect(201);

    const character = res.body as { id: string };
    return { agent, csrfToken, characterId: character.id };
  }

  it('rejects crafting routes without a session', async () => {
    await request(server).get('/crafting/recipes').expect(401);
  });

  it('requires a profession before crafting, and allows choosing exactly once', async () => {
    const { agent, csrfToken } = await adventurerAgent();

    await agent.get('/crafting/recipes').expect(400);

    await agent
      .post('/crafting/profession')
      .set('x-csrf-token', csrfToken)
      .send({ professionId: 'blacksmith' })
      .expect(201);

    await agent
      .post('/crafting/profession')
      .set('x-csrf-token', csrfToken)
      .send({ professionId: 'alchemist' })
      .expect(409);
  });

  it('lists recipes for the chosen profession, marked available at level 1', async () => {
    const { agent, csrfToken } = await adventurerAgent();
    await agent
      .post('/crafting/profession')
      .set('x-csrf-token', csrfToken)
      .send({ professionId: 'blacksmith' })
      .expect(201);

    const res = await agent.get('/crafting/recipes').expect(200);
    const recipes = res.body as {
      id: string;
      available: boolean;
      materials: { itemId: string; quantity: number }[];
    }[];
    const ironDagger = recipes.find((r) => r.id === 'iron-dagger');
    expect(ironDagger?.available).toBe(true);
    expect(ironDagger?.materials).toEqual([
      { itemId: 'scrap-metal', quantity: 3 },
    ]);
  });

  it('rejects starting a craft without enough materials, below the required profession level, or not yet discovered', async () => {
    const { agent, csrfToken, characterId } = await adventurerAgent();
    await agent
      .post('/crafting/profession')
      .set('x-csrf-token', csrfToken)
      .send({ professionId: 'blacksmith' })
      .expect(201);

    await agent
      .post('/crafting/start')
      .set('x-csrf-token', csrfToken)
      .send({ recipeId: 'iron-dagger' })
      .expect(400);

    await prisma.itemInstance.create({
      data: { characterId, itemId: 'scrap-metal' },
    });

    stubRecipe('test-level-gated', { minProfessionLevel: 5 });
    await agent
      .post('/crafting/start')
      .set('x-csrf-token', csrfToken)
      .send({ recipeId: 'test-level-gated' })
      .expect(403);

    stubRecipe('test-undiscovered', { requiresDiscovery: true });
    await agent
      .post('/crafting/start')
      .set('x-csrf-token', csrfToken)
      .send({ recipeId: 'test-undiscovered' })
      .expect(403);
  });

  it('starts a craft, blocks a second one while in progress, then resolves lazily once due', async () => {
    const { agent, csrfToken, characterId } = await adventurerAgent();
    await agent
      .post('/crafting/profession')
      .set('x-csrf-token', csrfToken)
      .send({ professionId: 'blacksmith' })
      .expect(201);

    await prisma.itemInstance.createMany({
      data: [
        { characterId, itemId: 'scrap-metal' },
        { characterId, itemId: 'scrap-metal' },
        { characterId, itemId: 'scrap-metal' },
      ],
    });

    const startRes = await agent
      .post('/crafting/start')
      .set('x-csrf-token', csrfToken)
      .send({ recipeId: 'iron-dagger' })
      .expect(201);
    expect((startRes.body as { recipeId: string }).recipeId).toBe(
      'iron-dagger',
    );

    const remainingMaterials = await prisma.itemInstance.count({
      where: { characterId, itemId: 'scrap-metal' },
    });
    expect(remainingMaterials).toBe(0);

    const status = await agent.get('/crafting/status').expect(200);
    expect((status.body as { inProgress: boolean }).inProgress).toBe(true);

    await agent
      .post('/crafting/start')
      .set('x-csrf-token', csrfToken)
      .send({ recipeId: 'iron-dagger' })
      .expect(409);

    // Simulate time passing without a background worker - completesAt is
    // just a timestamp, so backdating it is the whole test.
    await prisma.craftingJob.updateMany({
      where: { characterId, status: 'IN_PROGRESS' },
      data: { completesAt: new Date(Date.now() - 1000) },
    });

    const statusAfterDue = await agent.get('/crafting/status').expect(200);
    expect((statusAfterDue.body as { inProgress: boolean }).inProgress).toBe(
      false,
    );

    const inventory = await agent.get('/inventory').expect(200);
    expect(
      (inventory.body as { itemId: string }[]).some(
        (i) => i.itemId === 'iron-dagger',
      ),
    ).toBe(true);

    const character = await agent.get('/characters/me').expect(200);
    expect((character.body as { professionXp: number }).professionXp).toBe(20);
  });
});
