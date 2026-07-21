-- AlterTable
ALTER TABLE "characters" ADD COLUMN     "duelistOathSwornAt" TIMESTAMP(3),
ADD COLUMN     "duelistOathRenounceRequestedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "duels" (
    "id" TEXT NOT NULL,
    "attackerCharacterId" TEXT NOT NULL,
    "defenderCharacterId" TEXT NOT NULL,
    "winnerCharacterId" TEXT,
    "attackerHpAfter" INTEGER NOT NULL,
    "defenderHpAfter" INTEGER NOT NULL,
    "goldTransferred" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "duels_attackerCharacterId_createdAt_idx" ON "duels"("attackerCharacterId", "createdAt");

-- CreateIndex
CREATE INDEX "duels_defenderCharacterId_createdAt_idx" ON "duels"("defenderCharacterId", "createdAt");

-- AddForeignKey
ALTER TABLE "duels" ADD CONSTRAINT "duels_attackerCharacterId_fkey" FOREIGN KEY ("attackerCharacterId") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duels" ADD CONSTRAINT "duels_defenderCharacterId_fkey" FOREIGN KEY ("defenderCharacterId") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
