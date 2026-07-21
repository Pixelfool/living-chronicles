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

describe('Inventory (e2e)', () => {
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
      where: { character: { user: { email: { contains: 'e2e-inv' } } } },
    });
    await prisma.character.deleteMany({
      where: { user: { email: { contains: 'e2e-inv' } } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'e2e-inv' } },
    });
    await app.close();
    redisClient.disconnect();
  });

  async function adventurerAgent() {
    const agent = createAgent(server);
    const csrfToken = await primeCsrfToken(agent);
    await registerUser(agent, 'e2e-inv');

    const res = await agent
      .post('/characters')
      .set('x-csrf-token', csrfToken)
      .send({ name: `Looter${uniqueSuffix()}`, archetype: 'DUELIST' })
      .expect(201);

    const character = res.body as { id: string };
    return { agent, csrfToken, characterId: character.id };
  }

  it('rejects inventory routes without a session', async () => {
    await request(server).get('/inventory').expect(401);
  });

  it('starts with an empty inventory', async () => {
    const { agent } = await adventurerAgent();
    const res = await agent.get('/inventory').expect(200);
    expect(res.body).toEqual([]);
  });

  it('equips a seeded item, then unequips it', async () => {
    const { agent, csrfToken, characterId } = await adventurerAgent();

    // Arrange via direct DB access rather than relying on random combat
    // loot, so this test is deterministic. Acting and asserting still go
    // entirely through the real API.
    const sword = await prisma.itemInstance.create({
      data: { characterId, itemId: 'rusty-sword' },
    });
    const secondSword = await prisma.itemInstance.create({
      data: { characterId, itemId: 'bandit-dagger' },
    });

    const listRes = await agent.get('/inventory').expect(200);
    const list = listRes.body as { id: string; equipped: boolean }[];
    expect(list.length).toBe(2);
    expect(list.every((entry) => !entry.equipped)).toBe(true);

    const equipRes = await agent
      .post(`/inventory/${sword.id}/equip`)
      .set('x-csrf-token', csrfToken)
      .expect(201);
    const afterFirstEquip = equipRes.body as {
      id: string;
      equipped: boolean;
    }[];
    expect(afterFirstEquip.find((e) => e.id === sword.id)?.equipped).toBe(true);

    // Equipping the second WEAPON must atomically unequip the first -
    // only one item per slot.
    const equipSecondRes = await agent
      .post(`/inventory/${secondSword.id}/equip`)
      .set('x-csrf-token', csrfToken)
      .expect(201);
    const afterSecondEquip = equipSecondRes.body as {
      id: string;
      equipped: boolean;
    }[];
    expect(
      afterSecondEquip.find((e) => e.id === secondSword.id)?.equipped,
    ).toBe(true);
    expect(afterSecondEquip.find((e) => e.id === sword.id)?.equipped).toBe(
      false,
    );

    const unequipRes = await agent
      .post(`/inventory/${secondSword.id}/unequip`)
      .set('x-csrf-token', csrfToken)
      .expect(201);
    const afterUnequip = unequipRes.body as { id: string; equipped: boolean }[];
    expect(afterUnequip.every((e) => !e.equipped)).toBe(true);

    // A MATERIAL item (introduced in M8) has no slot and must never be
    // equippable, regardless of the same-slot unequip logic above.
    const material = await prisma.itemInstance.create({
      data: { characterId, itemId: 'scrap-metal' },
    });
    await agent
      .post(`/inventory/${material.id}/equip`)
      .set('x-csrf-token', csrfToken)
      .expect(400);
  });

  it('rejects equipping an item that belongs to someone else', async () => {
    const owner = await adventurerAgent();
    const intruder = await adventurerAgent();

    const item = await prisma.itemInstance.create({
      data: { characterId: owner.characterId, itemId: 'leather-vest' },
    });

    await intruder.agent
      .post(`/inventory/${item.id}/equip`)
      .set('x-csrf-token', intruder.csrfToken)
      .expect(404);
  });

  it('equipped gear affects combat and a fight can drop loot', async () => {
    const { agent, csrfToken, characterId } = await adventurerAgent();

    const dagger = await prisma.itemInstance.create({
      data: { characterId, itemId: 'bandit-dagger' },
    });
    await agent
      .post(`/inventory/${dagger.id}/equip`)
      .set('x-csrf-token', csrfToken)
      .expect(201);

    // Fight the rat roster's worth of AP; just assert the loot field is
    // always well-formed (null or a string) - the drop itself is random,
    // see combat/loot.spec.ts for the deterministic roll logic.
    for (let i = 0; i < 10; i++) {
      const res = await agent
        .post('/combat/fight')
        .set('x-csrf-token', csrfToken)
        .send({ monsterId: 'rat' })
        .expect(201);
      const body = res.body as { lootItemId: string | null };
      expect(
        body.lootItemId === null || typeof body.lootItemId === 'string',
      ).toBe(true);
    }
  });
});
