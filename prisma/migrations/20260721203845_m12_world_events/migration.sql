-- CreateEnum
CREATE TYPE "WorldEventPhase" AS ENUM ('EMERGING', 'ACTIVE', 'RESOLVED');

-- CreateTable
CREATE TABLE "world_event_instances" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "phase" "WorldEventPhase" NOT NULL DEFAULT 'EMERGING',
    "fightScore" INTEGER NOT NULL DEFAULT 0,
    "supportScore" INTEGER NOT NULL DEFAULT 0,
    "activeAt" TIMESTAMP(3) NOT NULL,
    "resolvesAt" TIMESTAMP(3) NOT NULL,
    "resolvedOutcome" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "world_event_instances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "world_event_instances_cityId_phase_idx" ON "world_event_instances"("cityId", "phase");
