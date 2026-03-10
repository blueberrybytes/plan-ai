/*
  Warnings:

  - A unique constraint covering the columns `[transcriptId]` on the table `ChatThread` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ChatThread" ADD COLUMN     "transcriptId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ChatThread_transcriptId_key" ON "ChatThread"("transcriptId");

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;
