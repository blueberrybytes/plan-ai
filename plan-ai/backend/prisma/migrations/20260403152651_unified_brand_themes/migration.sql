/*
  Warnings:

  - You are about to drop the column `theme` on the `Diagram` table. All the data in the column will be lost.
  - You are about to drop the column `backgroundColor` on the `SlideTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `backgroundStyle` on the `SlideTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `bodyFont` on the `SlideTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `cardStyle` on the `SlideTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `headingFont` on the `SlideTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `primaryColor` on the `SlideTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `secondaryColor` on the `SlideTemplate` table. All the data in the column will be lost.
  - You are about to drop the `DocTheme` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "DocDocument" DROP CONSTRAINT "DocDocument_themeId_fkey";

-- DropForeignKey
ALTER TABLE "DocTheme" DROP CONSTRAINT "DocTheme_userId_fkey";

-- AlterTable
ALTER TABLE "Diagram" DROP COLUMN "theme",
ADD COLUMN     "themeId" TEXT;

-- AlterTable
ALTER TABLE "Presentation" ADD COLUMN     "themeId" TEXT;

-- AlterTable
ALTER TABLE "SlideTemplate" DROP COLUMN "backgroundColor",
DROP COLUMN "backgroundStyle",
DROP COLUMN "bodyFont",
DROP COLUMN "cardStyle",
DROP COLUMN "headingFont",
DROP COLUMN "primaryColor",
DROP COLUMN "secondaryColor";

-- DropTable
DROP TABLE "DocTheme";

-- CreateTable
CREATE TABLE "BrandTheme" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "headingFont" VARCHAR(80) NOT NULL DEFAULT 'Inter',
    "bodyFont" VARCHAR(80) NOT NULL DEFAULT 'Inter',
    "primaryColor" VARCHAR(24) NOT NULL DEFAULT '#4361EE',
    "secondaryColor" VARCHAR(24) NOT NULL DEFAULT '#a78bfa',
    "backgroundColor" VARCHAR(24) NOT NULL DEFAULT '#ffffff',
    "textColor" VARCHAR(24) NOT NULL DEFAULT '#0f172a',
    "backgroundStyle" VARCHAR(24) DEFAULT 'solid',
    "cardStyle" VARCHAR(24) DEFAULT 'flat',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandTheme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrandTheme_userId_idx" ON "BrandTheme"("userId");

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "BrandTheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandTheme" ADD CONSTRAINT "BrandTheme_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocDocument" ADD CONSTRAINT "DocDocument_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "BrandTheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagram" ADD CONSTRAINT "Diagram_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "BrandTheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;
