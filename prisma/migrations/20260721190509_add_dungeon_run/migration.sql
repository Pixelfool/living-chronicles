-- CreateEnum
CREATE TYPE "DungeonRunStatus" AS ENUM ('IN_PROGRESS', 'CLEARED', 'RETREATED');

-- CreateTable
CREATE TABLE "dungeon_runs" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "dungeonId" TEXT NOT NULL,
    "status" "DungeonRunStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "currentBeat" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "dungeon_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dungeon_runs_characterId_status_idx" ON "dungeon_runs"("characterId", "status");

-- AddForeignKey
ALTER TABLE "dungeon_runs" ADD CONSTRAINT "dungeon_runs_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
