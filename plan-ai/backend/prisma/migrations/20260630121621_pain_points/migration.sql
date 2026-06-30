-- CreateEnum
CREATE TYPE "PainPointSeverity" AS ENUM ('BLOCKER', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "PainPointStatus" AS ENUM ('RAISED', 'BEING_ADDRESSED', 'RESOLVED_IN_MEETING');

-- CreateTable
CREATE TABLE "PainPoint" (
    "id" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "affected" TEXT,
    "severity" "PainPointSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "PainPointStatus" NOT NULL DEFAULT 'RAISED',
    "evidence" TEXT,
    "suggestedResolution" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "resolutionTaskId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PainPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PainPoint_resolutionTaskId_key" ON "PainPoint"("resolutionTaskId");

-- CreateIndex
CREATE INDEX "PainPoint_transcriptId_idx" ON "PainPoint"("transcriptId");

-- CreateIndex
CREATE INDEX "PainPoint_workspaceId_idx" ON "PainPoint"("workspaceId");

-- CreateIndex
CREATE INDEX "PainPoint_severity_idx" ON "PainPoint"("severity");

-- CreateIndex
CREATE INDEX "PainPoint_status_idx" ON "PainPoint"("status");

-- AddForeignKey
ALTER TABLE "PainPoint" ADD CONSTRAINT "PainPoint_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PainPoint" ADD CONSTRAINT "PainPoint_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PainPoint" ADD CONSTRAINT "PainPoint_resolutionTaskId_fkey" FOREIGN KEY ("resolutionTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
