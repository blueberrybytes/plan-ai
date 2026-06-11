/*
  Warnings:

  - You are about to drop the column `projectId` on the `Diagram` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Diagram" DROP CONSTRAINT "Diagram_projectId_fkey";

-- DropIndex
DROP INDEX "Diagram_projectId_idx";

-- AlterTable
ALTER TABLE "Diagram" DROP COLUMN "projectId";
