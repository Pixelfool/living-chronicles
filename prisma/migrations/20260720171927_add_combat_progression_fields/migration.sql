/*
  Warnings:

  - Added the required column `hp` to the `characters` table without a default value. This is not possible if the table is not empty.
  - Added the required column `maxHp` to the `characters` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "characters" ADD COLUMN     "actionPoints" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "hp" INTEGER NOT NULL,
ADD COLUMN     "maxActionPoints" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "maxHp" INTEGER NOT NULL,
ADD COLUMN     "xp" INTEGER NOT NULL DEFAULT 0;
