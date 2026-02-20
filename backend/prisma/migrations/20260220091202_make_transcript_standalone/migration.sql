/*
  Warnings:
  - Added the required column `userId` to the `Transcript` table with a custom backfill approach for existing records.
*/
-- AlterTable: Add nullable userId
ALTER TABLE "Transcript" ADD COLUMN "userId" TEXT;

-- Backfill userId from the associated projects
UPDATE "Transcript"
SET "userId" = "projects"."userId"
FROM "projects"
WHERE "Transcript"."projectId" = "projects"."id";

-- AlterTable: Enforce constraints and foreign keys
ALTER TABLE "Transcript" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Transcript" ALTER COLUMN "projectId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
