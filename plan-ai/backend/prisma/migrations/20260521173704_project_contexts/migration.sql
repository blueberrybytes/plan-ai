/*
  Warnings:

  - A unique constraint covering the columns `[projectId]` on the table `Context` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Context" ADD COLUMN     "projectId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Context_projectId_key" ON "Context"("projectId");

-- CreateIndex
CREATE INDEX "Context_projectId_idx" ON "Context"("projectId");

-- AddForeignKey
ALTER TABLE "Context" ADD CONSTRAINT "Context_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
