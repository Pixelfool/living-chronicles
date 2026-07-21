-- CreateEnum
CREATE TYPE "CraftingJobStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- AlterTable
ALTER TABLE "characters" ADD COLUMN     "profession" TEXT,
ADD COLUMN     "professionLevel" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "professionXp" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "crafting_jobs" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "status" "CraftingJobStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completesAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "crafting_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crafting_jobs_characterId_status_idx" ON "crafting_jobs"("characterId", "status");

-- AddForeignKey
ALTER TABLE "crafting_jobs" ADD CONSTRAINT "crafting_jobs_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
