-- AlterTable
ALTER TABLE "TelegramLink" ADD COLUMN     "conversation" JSONB,
ADD COLUMN     "messageCount" INTEGER NOT NULL DEFAULT 0;
