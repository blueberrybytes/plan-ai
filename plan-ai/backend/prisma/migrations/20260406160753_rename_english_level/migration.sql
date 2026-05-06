/*
  Warnings:

  - You are about to drop the column `englishLevel` on the `ChatThread` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ChatThread" RENAME COLUMN "englishLevel" TO "complexityLevel";
