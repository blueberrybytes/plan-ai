-- CreateEnum
CREATE TYPE "WorkspaceKind" AS ENUM ('TEAM', 'PERSONAL');

-- CreateEnum
CREATE TYPE "TrackerKind" AS ENUM ('NUMBER', 'CHECK', 'CALORIES');

-- CreateEnum
CREATE TYPE "TrackerAggregation" AS ENUM ('SUM', 'LAST', 'AVERAGE');

-- CreateEnum
CREATE TYPE "TrackerGoalDirection" AS ENUM ('AT_LEAST', 'AT_MOST');

-- CreateEnum
CREATE TYPE "TrackerEntryStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TrackerEntrySource" AS ENUM ('MANUAL', 'NOTE', 'IMPORT');

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "kind" "WorkspaceKind" NOT NULL DEFAULT 'TEAM';

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "trackersExtractedVersion" INTEGER;

-- CreateTable
CREATE TABLE "PersonalProfile" (
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3),
    "consentVersion" VARCHAR(32),
    "hideCalories" BOOLEAN NOT NULL DEFAULT false,
    "autoExtract" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Tracker" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "kind" "TrackerKind" NOT NULL,
    "unit" VARCHAR(16),
    "aggregation" "TrackerAggregation" NOT NULL DEFAULT 'SUM',
    "goalValue" DOUBLE PRECISION,
    "goalDirection" "TrackerGoalDirection",
    "goalPeriod" "NotePeriod",
    "instructions" VARCHAR(300),
    "position" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tracker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackerEntry" (
    "id" TEXT NOT NULL,
    "trackerId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "label" VARCHAR(200),
    "details" JSONB,
    "status" "TrackerEntryStatus" NOT NULL DEFAULT 'CONFIRMED',
    "source" "TrackerEntrySource" NOT NULL DEFAULT 'MANUAL',
    "noteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonalProfile_workspaceId_key" ON "PersonalProfile"("workspaceId");

-- CreateIndex
CREATE INDEX "Tracker_workspaceId_userId_idx" ON "Tracker"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "TrackerEntry_trackerId_date_idx" ON "TrackerEntry"("trackerId", "date");

-- CreateIndex
CREATE INDEX "TrackerEntry_workspaceId_userId_status_date_idx" ON "TrackerEntry"("workspaceId", "userId", "status", "date");

-- CreateIndex
CREATE INDEX "TrackerEntry_noteId_idx" ON "TrackerEntry"("noteId");

-- AddForeignKey
ALTER TABLE "PersonalProfile" ADD CONSTRAINT "PersonalProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalProfile" ADD CONSTRAINT "PersonalProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tracker" ADD CONSTRAINT "Tracker_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tracker" ADD CONSTRAINT "Tracker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackerEntry" ADD CONSTRAINT "TrackerEntry_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "Tracker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackerEntry" ADD CONSTRAINT "TrackerEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackerEntry" ADD CONSTRAINT "TrackerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackerEntry" ADD CONSTRAINT "TrackerEntry_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;

