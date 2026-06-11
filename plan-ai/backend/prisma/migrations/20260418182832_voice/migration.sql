-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hasVoiceProfile" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "voiceProfileUrl" TEXT;
