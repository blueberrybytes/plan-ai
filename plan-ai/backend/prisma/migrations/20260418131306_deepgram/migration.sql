/*
  Warnings:

  - You are about to drop the column `rawUrl` on the `Transcript` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Transcript" DROP COLUMN "rawUrl",
ADD COLUMN     "rawMicUrl" TEXT,
ADD COLUMN     "rawSysUrl" TEXT,
ADD COLUMN     "utterances" JSONB;
