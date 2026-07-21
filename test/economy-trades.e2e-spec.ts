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
  RegisteredUser,
  TestAgent,
  uniqueSuffix,
} from './test-utils';

interface TradeOfferView {
  id: string;
  fromUserId: string;
  toUserId: string;
  offeredItems: { itemInstanceId: string; itemId: string }[];
  offeredGold: number;
  requestedGold: number;
  status: string;
}

describe('Economy - trades (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redisClient: Redis;
  let server: Parameters<typeof request>[0];

  let a: { agent: TestAgent; csrfToken: string; user: RegisteredUser };
  let b: { agent: TestAgent; csrfToken: string; user: RegisteredUser };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    redisClient = configureApp(app);
    await app.init();
    prisma = moduleRef.get(PrismaService);
    server = app.getHttpServer() as Parameters<typeof request>[0];

    a = await player('e2e-econ-trade-a');
    b = await player('e2e-econ-trade-b');
  });

  afterAll(async () => {
    const userIds = [a.user.userId, b.user.userId];
    await prisma.auditLogEntry.deleteMany({
      where: { actorId: { in: userIds } },
    });
    await prisma.tradeOffer.deleteMany({
      where: {
        OR: [{ fromUserId: { in: userIds } }, { toUserId: { in: userIds } }],
      },
    });
    await prisma.itemInstance.deleteMany({
      where: { character: { userId: { in: userIds } } },
    });
    await prisma.character.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
    redisClient.disconnect();
  });

  async function player(prefix: string): Promise<{
    agent: TestAgent;
    csrfToken: string;
    user: RegisteredUser;
  }> {
    const agent = createAgent(server);
    const csrfToken = await primeCsrfToken(agent);
    const user = await registerUser(agent, prefix);
    await agent
      .post('/characters')
      .set('x-csrf-token', csrfToken)
      .send({ name: `Trader${uniqueSuffix()}`, archetype: 'DIPLOMAT' })
      .expect(201);
    return { agent, csrfToken, user };
  }

  it('rejects trade routes without a session', async () => {
    await request(server).get('/economy/trades').expect(401);
  });

  it('rejects an offer to yourself and an offer of an unowned item', async () => {
    await a.agent
      .post('/economy/trades')
      .set('x-csrf-token', a.csrfToken)
      .send({
        toUsername: a.user.username,
        offeredItemInstanceIds: [],
        offeredGold: 0,
        requestedGold: 0,
      })
      .expect(400);

    await a.agent
      .post('/economy/trades')
      .set('x-csrf-token', a.csrfToken)
      .send({
        toUsername: b.user.username,
        offeredItemInstanceIds: ['00000000-0000-0000-0000-000000000000'],
        offeredGold: 0,
        requestedGold: 0,
      })
      .expect(400);
  });

  it('completes an item-for-gold trade, moving the item and the gold', async () => {
    // a buys a sword (50 -> 35 gold) to have something concrete to trade.
    const buyRes = await a.agent
      .post('/economy/shops/haven/buy')
      .set('x-csrf-token', a.csrfToken)
      .send({ itemId: 'rusty-sword' })
      .expect(201);
    const swordInstanceId = (buyRes.body as { itemInstance: { id: string } })
      .itemInstance.id;

    const createRes = await a.agent
      .post('/economy/trades')
      .set('x-csrf-token', a.csrfToken)
      .send({
        toUsername: b.user.username,
        offeredItemInstanceIds: [swordInstanceId],
        offeredGold: 0,
        requestedGold: 20,
      })
      .expect(201);
    const tradeId = (createRes.body as { id: string }).id;

    const bIncoming = await b.agent.get('/economy/trades').expect(200);
    const bIncomingBody = bIncoming.body as { incoming: TradeOfferView[] };
    const incomingOffer = bIncomingBody.incoming.find((o) => o.id === tradeId);
    expect(
      incomingOffer?.offeredItems.some((i) => i.itemId === 'rusty-sword'),
    ).toBe(true);

    // Only the recipient can accept - the proposer trying to accept their
    // own outgoing offer should 404, same as it would for anyone else who
    // isn't the addressee.
    await a.agent
      .post(`/economy/trades/${tradeId}/accept`)
      .set('x-csrf-token', a.csrfToken)
      .expect(404);

    await b.agent
      .post(`/economy/trades/${tradeId}/accept`)
      .set('x-csrf-token', b.csrfToken)
      .expect(200);

    const aInventory = await a.agent.get('/inventory').expect(200);
    expect(
      (aInventory.body as { id: string }[]).some(
        (i) => i.id === swordInstanceId,
      ),
    ).toBe(false);
    const bInventory = await b.agent.get('/inventory').expect(200);
    expect(
      (bInventory.body as { id: string }[]).some(
        (i) => i.id === swordInstanceId,
      ),
    ).toBe(true);

    // a: 35 + 20 = 55. b: 50 - 20 = 30.
    const aCharacter = await a.agent.get('/characters/me').expect(200);
    expect((aCharacter.body as { gold: number }).gold).toBe(55);
    const bCharacter = await b.agent.get('/characters/me').expect(200);
    expect((bCharacter.body as { gold: number }).gold).toBe(30);
  });

  it('lets the recipient decline and the proposer cancel', async () => {
    const declineRes = await a.agent
      .post('/economy/trades')
      .set('x-csrf-token', a.csrfToken)
      .send({
        toUsername: b.user.username,
        offeredItemInstanceIds: [],
        offeredGold: 1,
        requestedGold: 0,
      })
      .expect(201);
    const declineId = (declineRes.body as { id: string }).id;

    // The proposer can't cancel via decline, and the target can't cancel
    // via the proposer-only cancel endpoint.
    await b.agent
      .post(`/economy/trades/${declineId}/cancel`)
      .set('x-csrf-token', b.csrfToken)
      .expect(404);

    await b.agent
      .post(`/economy/trades/${declineId}/decline`)
      .set('x-csrf-token', b.csrfToken)
      .expect(200);

    const bIncomingAfterDecline = await b.agent
      .get('/economy/trades')
      .expect(200);
    expect(
      (
        bIncomingAfterDecline.body as { incoming: TradeOfferView[] }
      ).incoming.some((o) => o.id === declineId),
    ).toBe(false);

    const cancelRes = await a.agent
      .post('/economy/trades')
      .set('x-csrf-token', a.csrfToken)
      .send({
        toUsername: b.user.username,
        offeredItemInstanceIds: [],
        offeredGold: 1,
        requestedGold: 0,
      })
      .expect(201);
    const cancelId = (cancelRes.body as { id: string }).id;

    await a.agent
      .post(`/economy/trades/${cancelId}/cancel`)
      .set('x-csrf-token', a.csrfToken)
      .expect(200);

    const aOutgoingAfterCancel = await a.agent
      .get('/economy/trades')
      .expect(200);
    expect(
      (
        aOutgoingAfterCancel.body as { outgoing: TradeOfferView[] }
      ).outgoing.some((o) => o.id === cancelId),
    ).toBe(false);
  });

  it('rejects accepting a trade the recipient can no longer afford', async () => {
    // b has 30 gold left from the earlier trade - ask for far more than that.
    const offerRes = await a.agent
      .post('/economy/trades')
      .set('x-csrf-token', a.csrfToken)
      .send({
        toUsername: b.user.username,
        offeredItemInstanceIds: [],
        offeredGold: 0,
        requestedGold: 1_000_000,
      })
      .expect(201);
    const tradeId = (offerRes.body as { id: string }).id;

    await b.agent
      .post(`/economy/trades/${tradeId}/accept`)
      .set('x-csrf-token', b.csrfToken)
      .expect(409);
  });
});
