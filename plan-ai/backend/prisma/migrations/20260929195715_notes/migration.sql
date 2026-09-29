-- CreateEnum
CREATE TYPE "NoteVisibility" AS ENUM ('PRIVATE', 'WORKSPACE');

-- CreateEnum
CREATE TYPE "NotePeriod" AS ENUM ('DAY', 'WEEK');

-- CreateEnum
CREATE TYPE "NoteSource" AS ENUM ('WEB', 'MOBILE', 'RECORDER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(200),
    "body" TEXT NOT NULL DEFAULT '',
    "visibility" "NoteVisibility" NOT NULL DEFAULT 'PRIVATE',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "projectId" TEXT,
    "transcriptId" TEXT,
    "periodType" "NotePeriod",
    "periodStart" DATE,
    "source" "NoteSource" NOT NULL DEFAULT 'WEB',
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Note_workspaceId_userId_updatedAt_idx" ON "Note"("workspaceId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Note_workspaceId_visibility_updatedAt_idx" ON "Note"("workspaceId", "visibility", "updatedAt");

-- CreateIndex
CREATE INDEX "Note_projectId_idx" ON "Note"("projectId");

-- CreateIndex
CREATE INDEX "Note_transcriptId_idx" ON "Note"("transcriptId");

-- CreateIndex
CREATE UNIQUE INDEX "Note_workspaceId_userId_periodType_periodStart_key" ON "Note"("workspaceId", "userId", "periodType", "periodStart");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE SET NULL ON UPDATE CASCADE;

