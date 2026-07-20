/*
  Warnings:

  - Added the required column `currentCityId` to the `characters` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "characters" ADD COLUMN     "currentCityId" TEXT NOT NULL;
