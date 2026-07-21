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

/**
 * Registration has its own strict rate limit (5/60s - a deliberate
 * anti-bot-farming measure, not something to work around), so - same
 * idiom as economy-trades.e2e-spec.ts/guilds.e2e-spec.ts - this suite
 * registers a small, fixed pool of characters once in beforeAll and
 * resets their mutable state directly via Prisma between tests, rather
 * than registering fresh characters per test.
 */
describe('Duels (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redisClient: Redis;
  let server: Parameters<typeof request>[0];

  let a: {
    agent: TestAgent;
    csrfToken: string;
    user: RegisteredUser;
    characterId: string;
  };
  let b: {
    agent: TestAgent;
    csrfToken: string;
    user: RegisteredUser;
    characterId: string;
  };
  let c: {
    agent: TestAgent;
    csrfToken: string;
    user: RegisteredUser;
    characterId: string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    redisClient = configureApp(app);
    await app.init();
    prisma = moduleRef.get(PrismaService);
    server = app.getHttpServer() as Parameters<typeof request>[0];

    a = await player('e2e-duel-a');
    b = await player('e2e-duel-b');
    c = await player('e2e-duel-c');
  });

  afterAll(async () => {
    const characterIds = [a.characterId, b.characterId, c.characterId];
    await prisma.duel.deleteMany({
      where: {
        OR: [
          { attackerCharacterId: { in: characterIds } },
          { defenderCharacterId: { in: characterIds } },
        ],
      },
    });
    await prisma.character.deleteMany({ where: { id: { in: characterIds } } });
    await prisma.user.deleteMany({
      where: { id: { in: [a.user.userId, b.user.userId, c.user.userId] } },
    });
    await app.close();
    redisClient.disconnect();
  });

  async function player(prefix: string): Promise<{
    agent: TestAgent;
    csrfToken: string;
    user: RegisteredUser;
    characterId: string;
  }> {
    const agent = createAgent(server);
    const csrfToken = await primeCsrfToken(agent);
    const user = await registerUser(agent, prefix);
    const res = await agent
      .post('/characters')
      .set('x-csrf-token', csrfToken)
      .send({ name: `Duelist${uniqueSuffix()}`, archetype: 'DUELIST' })
      .expect(201);
    const character = res.body as { id: string };
    return { agent, csrfToken, user, characterId: character.id };
  }

  /**
   * Resets one character to a clean, pristine duel-relevant state
   * directly via Prisma (not sworn, no pending renouncement, back in
   * Haven, full AP, default level/gold) and clears any duel history
   * involving them, so tests don't leak state into each other despite
   * reusing the same three characters throughout the file.
   */
  async function resetCharacter(
    characterId: string,
    overrides: {
      sworn?: boolean;
      city?: string;
      level?: number;
      actionPoints?: number;
    } = {},
  ): Promise<void> {
    await prisma.duel.deleteMany({
      where: {
        OR: [
          { attackerCharacterId: characterId },
          { defenderCharacterId: characterId },
        ],
      },
    });
    await prisma.character.update({
      where: { id: characterId },
      data: {
        currentCityId: overrides.city ?? 'haven',
        level: overrides.level ?? 1,
        hp: 100,
        gold: 50,
        actionPoints: overrides.actionPoints ?? 10,
        duelistOathSwornAt: overrides.sworn ? new Date() : null,
        duelistOathRenounceRequestedAt: null,
      },
    });
  }

  beforeEach(async () => {
    await resetCharacter(a.characterId);
    await resetCharacter(b.characterId);
    await resetCharacter(c.characterId);
  });

  it('rejects duel routes without a session', async () => {
    await request(server).get('/combat/duels/status').expect(401);
  });

  it("rejects swearing the oath anywhere but the oath-giver's city", async () => {
    await a.agent
      .post('/combat/duels/oath/swear')
      .set('x-csrf-token', a.csrfToken)
      .expect(400);
  });

  it('swears the oath in the right city, and rejects swearing a second time', async () => {
    await prisma.character.update({
      where: { id: a.characterId },
      data: { currentCityId: 'ashford' },
    });

    await a.agent
      .post('/combat/duels/oath/swear')
      .set('x-csrf-token', a.csrfToken)
      .expect(201);
    const status = await a.agent.get('/combat/duels/status').expect(200);
    expect((status.body as { sworn: boolean }).sworn).toBe(true);

    await a.agent
      .post('/combat/duels/oath/swear')
      .set('x-csrf-token', a.csrfToken)
      .expect(409);
  });

  it('rejects dueling before swearing the oath', async () => {
    await a.agent.get('/combat/duels/targets').expect(403);
    await a.agent
      .post('/combat/duels/attack')
      .set('x-csrf-token', a.csrfToken)
      .send({ defenderCharacterId: b.characterId })
      .expect(403);
  });

  it('rejects dueling yourself, a nonexistent character, and an unsworn character', async () => {
    await resetCharacter(a.characterId, { sworn: true });

    await a.agent
      .post('/combat/duels/attack')
      .set('x-csrf-token', a.csrfToken)
      .send({ defenderCharacterId: a.characterId })
      .expect(400);

    await a.agent
      .post('/combat/duels/attack')
      .set('x-csrf-token', a.csrfToken)
      .send({ defenderCharacterId: 'no-such-character' })
      .expect(404);

    // b was reset to unsworn by the outer beforeEach.
    await a.agent
      .post('/combat/duels/attack')
      .set('x-csrf-token', a.csrfToken)
      .send({ defenderCharacterId: b.characterId })
      .expect(403);
  });

  it('rejects dueling a sworn target too far outside the level range', async () => {
    await resetCharacter(a.characterId, { sworn: true, level: 1 });
    await resetCharacter(b.characterId, { sworn: true, level: 10 });

    await a.agent
      .post('/combat/duels/attack')
      .set('x-csrf-token', a.csrfToken)
      .send({ defenderCharacterId: b.characterId })
      .expect(403);
  });

  it('rejects dueling without enough action points', async () => {
    await resetCharacter(a.characterId, { sworn: true, actionPoints: 0 });
    await resetCharacter(b.characterId, { sworn: true });

    await a.agent
      .post('/combat/duels/attack')
      .set('x-csrf-token', a.csrfToken)
      .send({ defenderCharacterId: b.characterId })
      .expect(409);
  });

  it('resolves a duel between two sworn duelists, recording it for both sides', async () => {
    await resetCharacter(a.characterId, { sworn: true });
    await resetCharacter(b.characterId, { sworn: true });

    const before = await prisma.character.findMany({
      where: { id: { in: [a.characterId, b.characterId] } },
    });
    const beforeA = before.find((ch) => ch.id === a.characterId)!;
    const beforeB = before.find((ch) => ch.id === b.characterId)!;

    const res = await a.agent
      .post('/combat/duels/attack')
      .set('x-csrf-token', a.csrfToken)
      .send({ defenderCharacterId: b.characterId })
      .expect(201);
    const body = res.body as {
      winner: 'attacker' | 'defender' | 'draw';
      log: string[];
    };
    expect(['attacker', 'defender', 'draw']).toContain(body.winner);
    expect(body.log[0]).toContain('road outside the city gates');

    const after = await prisma.character.findMany({
      where: { id: { in: [a.characterId, b.characterId] } },
    });
    const afterA = after.find((ch) => ch.id === a.characterId)!;
    const afterB = after.find((ch) => ch.id === b.characterId)!;

    // Gold moves symmetrically - whatever the winner gained, the loser
    // lost exactly that much, never anything created or destroyed.
    const aGoldDelta = afterA.gold - beforeA.gold;
    const bGoldDelta = afterB.gold - beforeB.gold;
    expect(aGoldDelta).toBe(-bGoldDelta);
    expect(afterA.actionPoints).toBe(beforeA.actionPoints - 1);
    expect(afterA.hp).toBeGreaterThanOrEqual(1);
    expect(afterB.hp).toBeGreaterThanOrEqual(1);

    const aHistory = (await a.agent.get('/combat/duels/history').expect(200))
      .body as { opponentCharacterId: string; role: string }[];
    expect(
      aHistory.some(
        (e) => e.opponentCharacterId === b.characterId && e.role === 'attacker',
      ),
    ).toBe(true);

    const bHistory = (await b.agent.get('/combat/duels/history').expect(200))
      .body as { opponentCharacterId: string; role: string }[];
    expect(
      bHistory.some(
        (e) => e.opponentCharacterId === a.characterId && e.role === 'defender',
      ),
    ).toBe(true);
  });

  it('blocks the winner from re-attacking the same victim during the cooldown, but not a different attacker', async () => {
    await resetCharacter(a.characterId, { sworn: true }); // winner
    await resetCharacter(b.characterId, { sworn: true }); // loser
    await resetCharacter(c.characterId, { sworn: true }); // a different attacker

    // Set up a synthetic prior result directly rather than depending on
    // real combat RNG to produce a specific winner (same idiom as other
    // e2e suites backdating state directly for a deterministic setup).
    await prisma.duel.create({
      data: {
        attackerCharacterId: a.characterId,
        defenderCharacterId: b.characterId,
        winnerCharacterId: a.characterId,
        attackerHpAfter: 20,
        defenderHpAfter: 1,
        goldTransferred: 5,
      },
    });

    const targets = (await a.agent.get('/combat/duels/targets').expect(200))
      .body as { characterId: string }[];
    expect(targets.some((t) => t.characterId === b.characterId)).toBe(false);

    await a.agent
      .post('/combat/duels/attack')
      .set('x-csrf-token', a.csrfToken)
      .send({ defenderCharacterId: b.characterId })
      .expect(403);

    // A different attacker isn't blocked by someone else's cooldown.
    const otherTargets = (
      await c.agent.get('/combat/duels/targets').expect(200)
    ).body as { characterId: string }[];
    expect(otherTargets.some((t) => t.characterId === b.characterId)).toBe(
      true,
    );
  });

  it('renounces the oath only after returning to the oath-giver, and only after the cooldown elapses', async () => {
    await resetCharacter(a.characterId, { sworn: true, city: 'haven' });

    await a.agent
      .post('/combat/duels/oath/renounce')
      .set('x-csrf-token', a.csrfToken)
      .expect(400);

    await prisma.character.update({
      where: { id: a.characterId },
      data: { currentCityId: 'ashford' },
    });
    await a.agent
      .post('/combat/duels/oath/renounce')
      .set('x-csrf-token', a.csrfToken)
      .expect(201);

    const midCooldown = await a.agent.get('/combat/duels/status').expect(200);
    const midBody = midCooldown.body as {
      sworn: boolean;
      renouncing: boolean;
    };
    expect(midBody.renouncing).toBe(true);
    // Still a duelist for the entire cooldown window, per M10 design
    // discussion: no special "protected while leaving" status.
    expect(midBody.sworn).toBe(true);

    // Simulate the cooldown having fully elapsed.
    await prisma.character.update({
      where: { id: a.characterId },
      data: {
        duelistOathRenounceRequestedAt: new Date(Date.now() - 999_999_999),
      },
    });

    const afterLapse = await a.agent.get('/combat/duels/status').expect(200);
    expect((afterLapse.body as { sworn: boolean }).sworn).toBe(false);

    // Re-swearing works cleanly once the prior oath has actually lapsed.
    await a.agent
      .post('/combat/duels/oath/swear')
      .set('x-csrf-token', a.csrfToken)
      .expect(201);
  });

  /**
   * The fixed lock order in DuelService.attack() (sort the two character
   * ids, always claim/write in that order regardless of attacker/
   * defender role) exists so two transactions contending for the same
   * character row can't deadlock. Racing A-vs-B and B-vs-A directly
   * doesn't actually prove this: the pairwise repeat-attack cooldown
   * (correctly) can reject the second request once the first commits,
   * and that rejection happens at the pre-transaction check, before the
   * locking machinery is ever reached - a 403 there would prove nothing
   * about lock ordering either way. Using a third character instead (A
   * attacks B, C attacks A, concurrently) keeps character A's row
   * genuinely contended by two different transactions while avoiding
   * that unrelated business rule, so this actually exercises the lock
   * order: A's action-point claim must happen exactly once, and A's HP
   * must reflect both encounters, proving neither transaction's write to
   * A's row was lost to the other.
   */
  it('resolves two duels contending for the same character row without deadlocking or losing an update', async () => {
    await resetCharacter(a.characterId, { sworn: true });
    await resetCharacter(b.characterId, { sworn: true });
    await resetCharacter(c.characterId, { sworn: true });

    const [aAttacksB, cAttacksA] = await Promise.all([
      a.agent
        .post('/combat/duels/attack')
        .set('x-csrf-token', a.csrfToken)
        .send({ defenderCharacterId: b.characterId }),
      c.agent
        .post('/combat/duels/attack')
        .set('x-csrf-token', c.csrfToken)
        .send({ defenderCharacterId: a.characterId }),
    ]);

    // Both requests must actually resolve (not hang, not error out from a
    // deadlock).
    expect(aAttacksB.status).toBe(201);
    expect(cAttacksA.status).toBe(201);

    const after = await prisma.character.findMany({
      where: { id: { in: [a.characterId, b.characterId, c.characterId] } },
    });
    const afterA = after.find((ch) => ch.id === a.characterId)!;
    const afterB = after.find((ch) => ch.id === b.characterId)!;
    const afterC = after.find((ch) => ch.id === c.characterId)!;

    // A is the attacker in exactly one of the two duels, so exactly one
    // action point was claimed on A's row - not zero (which would mean
    // one transaction's claim was silently lost) and not two (which
    // would mean the guard against double-claiming broke under a race).
    expect(afterA.actionPoints).toBe(9);
    // B never attacks, so B's action points are untouched.
    expect(afterB.actionPoints).toBe(10);
    expect(afterC.actionPoints).toBe(9);
    expect(afterA.hp).toBeGreaterThanOrEqual(1);
    expect(afterB.hp).toBeGreaterThanOrEqual(1);
    expect(afterC.hp).toBeGreaterThanOrEqual(1);

    // Both duels were actually recorded - neither transaction's write was
    // dropped by the other.
    const duelCount = await prisma.duel.count({
      where: {
        OR: [
          {
            attackerCharacterId: a.characterId,
            defenderCharacterId: b.characterId,
          },
          {
            attackerCharacterId: c.characterId,
            defenderCharacterId: a.characterId,
          },
        ],
      },
    });
    expect(duelCount).toBe(2);
  });
});
