-- DropForeignKey
ALTER TABLE "Presentation" DROP CONSTRAINT "Presentation_templateId_fkey";

-- AlterTable
ALTER TABLE "Presentation" ALTER COLUMN "templateId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SlideTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
