import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Dev/test convenience only - choosing when and where a new world event
 * instance begins (the "spawn scheduler") is explicitly deferred (M12
 * design discussion / build-plan-v1.md's discipline of shipping the
 * smallest real vertical slice). This inserts exactly one EMERGING
 * instance so the Emerging -> Active -> Resolved lifecycle can be
 * exercised end-to-end without that mechanism existing yet.
 *
 * definitionId/cityId are literal strings, not validated against
 * ContentService, since this script runs outside the Nest DI container -
 * keep them in sync with content/core/world-events.yaml and
 * content/core/cities.yaml by hand.
 */
async function main() {
  const definitionId = 'raiding-warband';
  const cityId = 'ashford';

  const telegraphHours = 72;
  const activeHours = 36;
  const activeAt = new Date(Date.now() + telegraphHours * 60 * 60 * 1000);
  const resolvesAt = new Date(activeAt.getTime() + activeHours * 60 * 60 * 1000);

  const instance = await prisma.worldEventInstance.create({
    data: {
      definitionId,
      cityId,
      phase: 'EMERGING',
      activeAt,
      resolvesAt,
    },
  });

  console.log(
    `Seeded world event instance ${instance.id}: "${definitionId}" threatening "${cityId}", active at ${activeAt.toISOString()}, resolves at ${resolvesAt.toISOString()}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
