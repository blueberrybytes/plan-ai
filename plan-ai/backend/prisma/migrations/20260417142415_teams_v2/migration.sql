/*
  Warnings:

  - Made the column `workspaceId` on table `AiUsageLog` required. This step will fail if there are existing NULL values in that column.
  - Made the column `workspaceId` on table `BrandTheme` required. This step will fail if there are existing NULL values in that column.
  - Made the column `workspaceId` on table `ChatThread` required. This step will fail if there are existing NULL values in that column.
  - Made the column `workspaceId` on table `Context` required. This step will fail if there are existing NULL values in that column.
  - Made the column `workspaceId` on table `Diagram` required. This step will fail if there are existing NULL values in that column.
  - Made the column `workspaceId` on table `DocDocument` required. This step will fail if there are existing NULL values in that column.
  - Made the column `workspaceId` on table `Presentation` required. This step will fail if there are existing NULL values in that column.
  - Made the column `workspaceId` on table `SlideTemplate` required. This step will fail if there are existing NULL values in that column.
  - Made the column `workspaceId` on table `Transcript` required. This step will fail if there are existing NULL values in that column.
  - Made the column `workspaceId` on table `projects` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "AiUsageLog" ALTER COLUMN "workspaceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "BrandTheme" ALTER COLUMN "workspaceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ChatThread" ALTER COLUMN "workspaceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Context" ALTER COLUMN "workspaceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Diagram" ALTER COLUMN "workspaceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "DocDocument" ALTER COLUMN "workspaceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Presentation" ALTER COLUMN "workspaceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "SlideTemplate" ALTER COLUMN "workspaceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Transcript" ALTER COLUMN "workspaceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "workspaceId" SET NOT NULL;
