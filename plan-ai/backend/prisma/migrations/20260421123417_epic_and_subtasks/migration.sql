-- AlterEnum
ALTER TYPE "TaskType" ADD VALUE 'EPIC';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "storyPoints" DOUBLE PRECISION;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
