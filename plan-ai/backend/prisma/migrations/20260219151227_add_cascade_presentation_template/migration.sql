-- DropForeignKey
ALTER TABLE "Presentation" DROP CONSTRAINT "Presentation_templateId_fkey";

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SlideTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
