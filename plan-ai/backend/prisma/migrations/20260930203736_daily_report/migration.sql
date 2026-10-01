-- CreateEnum
CREATE TYPE "TaskUpdateKind" AS ENUM ('COMPLETED', 'PROGRESS', 'BLOCKED', 'NEW', 'DONE');

-- CreateEnum
CREATE TYPE "TaskUpdateStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "tasksExtractedVersion" INTEGER;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "dailyReportEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dailyReportReminderTime" VARCHAR(5);

-- AlterTable
ALTER TABLE "WorkspaceMember" ADD COLUMN     "dailyReportConsentAt" TIMESTAMP(3),
ADD COLUMN     "dailyReportConsentVersion" INTEGER;

-- CreateTable
CREATE TABLE "TaskUpdateProposal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "noteId" TEXT,
    "taskId" TEXT,
    "projectId" TEXT,
    "kind" "TaskUpdateKind" NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "detail" VARCHAR(500),
    "status" "TaskUpdateStatus" NOT NULL DEFAULT 'PROPOSED',
    "day" DATE NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskUpdateProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskUpdateProposal_workspaceId_userId_status_day_idx" ON "TaskUpdateProposal"("workspaceId", "userId", "status", "day");

-- CreateIndex
CREATE INDEX "TaskUpdateProposal_noteId_idx" ON "TaskUpdateProposal"("noteId");

-- CreateIndex
CREATE INDEX "TaskUpdateProposal_taskId_idx" ON "TaskUpdateProposal"("taskId");

-- CreateIndex
CREATE INDEX "TaskUpdateProposal_projectId_idx" ON "TaskUpdateProposal"("projectId");

-- AddForeignKey
ALTER TABLE "TaskUpdateProposal" ADD CONSTRAINT "TaskUpdateProposal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskUpdateProposal" ADD CONSTRAINT "TaskUpdateProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskUpdateProposal" ADD CONSTRAINT "TaskUpdateProposal_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskUpdateProposal" ADD CONSTRAINT "TaskUpdateProposal_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskUpdateProposal" ADD CONSTRAINT "TaskUpdateProposal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
