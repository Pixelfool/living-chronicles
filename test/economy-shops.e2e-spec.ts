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

describe('Economy - shops (e2e)', () => {
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
    await prisma.itemInstance.deleteMany({
      where: { character: { user: { email: { contains: 'e2e-econ-shop' } } } },
    });
    await prisma.auditLogEntry.deleteMany({
      where: { actor: { email: { contains: 'e2e-econ-shop' } } },
    });
    await prisma.character.deleteMany({
      where: { user: { email: { contains: 'e2e-econ-shop' } } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'e2e-econ-shop' } },
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
    await registerUser(agent, 'e2e-econ-shop');

    const res = await agent
      .post('/characters')
      .set('x-csrf-token', csrfToken)
      .send({ name: `Merchant${uniqueSuffix()}`, archetype: 'SCHOLAR' })
      .expect(201);

    const character = res.body as { id: string };
    return { agent, csrfToken, characterId: character.id };
  }

  it('rejects shop routes without a session', async () => {
    await request(server).get('/economy/shops/haven').expect(401);
  });

  it('lists a shop, buys and sells, and enforces gold/location/stock rules', async () => {
    const { agent, csrfToken } = await adventurerAgent();

    const listing = await agent.get('/economy/shops/haven').expect(200);
    const listingBody = listing.body as { itemId: string; price: number }[];
    expect(listingBody.some((i) => i.itemId === 'rusty-sword')).toBe(true);

    // Starting gold is 50 (schema default) - buy a 15-gold sword.
    const buyRes = await agent
      .post('/economy/shops/haven/buy')
      .set('x-csrf-token', csrfToken)
      .send({ itemId: 'rusty-sword' })
      .expect(201);
    const buyBody = buyRes.body as {
      character: { gold: number };
      itemInstance: { id: string; itemId: string };
    };
    expect(buyBody.character.gold).toBe(35);
    expect(buyBody.itemInstance.itemId).toBe('rusty-sword');

    const inventory = await agent.get('/inventory').expect(200);
    const inventoryBody = inventory.body as { id: string; itemId: string }[];
    expect(inventoryBody.some((i) => i.itemId === 'rusty-sword')).toBe(true);

    // Ashford also sells rusty-sword, but this character is in haven.
    await agent
      .post('/economy/shops/ashford/buy')
      .set('x-csrf-token', csrfToken)
      .send({ itemId: 'rusty-sword' })
      .expect(409);

    // Haven's shop doesn't stock wolf-pelt-cloak at all.
    await agent
      .post('/economy/shops/haven/buy')
      .set('x-csrf-token', csrfToken)
      .send({ itemId: 'wolf-pelt-cloak' })
      .expect(404);

    // Sell the sword back for half price (floor(15 * 0.5) = 7).
    const sellRes = await agent
      .post('/economy/sell')
      .set('x-csrf-token', csrfToken)
      .send({ itemInstanceId: buyBody.itemInstance.id })
      .expect(201);
    expect((sellRes.body as { goldReceived: number }).goldReceived).toBe(7);

    const inventoryAfterSell = await agent.get('/inventory').expect(200);
    expect(
      (inventoryAfterSell.body as { id: string }[]).some(
        (i) => i.id === buyBody.itemInstance.id,
      ),
    ).toBe(false);

    // Gold is now 35 + 7 = 42. Buy leather-vest (20) twice to drain below
    // the price of a rusty-sword (15).
    await agent
      .post('/economy/shops/haven/buy')
      .set('x-csrf-token', csrfToken)
      .send({ itemId: 'leather-vest' })
      .expect(201);
    await agent
      .post('/economy/shops/haven/buy')
      .set('x-csrf-token', csrfToken)
      .send({ itemId: 'leather-vest' })
      .expect(201);
    // 42 - 20 - 20 = 2, not enough for another rusty-sword (15).
    await agent
      .post('/economy/shops/haven/buy')
      .set('x-csrf-token', csrfToken)
      .send({ itemId: 'rusty-sword' })
      .expect(409);
  });

  it('rejects selling an item that belongs to someone else', async () => {
    const owner = await adventurerAgent();
    const intruder = await adventurerAgent();

    const item = await prisma.itemInstance.create({
      data: { characterId: owner.characterId, itemId: 'leather-vest' },
    });

    await intruder.agent
      .post('/economy/sell')
      .set('x-csrf-token', intruder.csrfToken)
      .send({ itemInstanceId: item.id })
      .expect(404);
  });
});
