-- AlterTable
ALTER TABLE "Transcript" ADD COLUMN     "durationSeconds" INTEGER,
ADD COLUMN     "sentiment" VARCHAR(24),
ADD COLUMN     "speakerCount" INTEGER;
