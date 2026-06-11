-- AlterTable
ALTER TABLE "DocDocument" ADD COLUMN     "projectId" TEXT;

-- CreateIndex
CREATE INDEX "DocDocument_projectId_idx" ON "DocDocument"("projectId");

-- AddForeignKey
ALTER TABLE "DocDocument" ADD CONSTRAINT "DocDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
