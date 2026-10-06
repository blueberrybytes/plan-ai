-- CreateTable
CREATE TABLE "TranscriptTranslation" (
    "id" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "language" VARCHAR(8) NOT NULL,
    "sourceHash" VARCHAR(64) NOT NULL,
    "summary" TEXT,
    "lines" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranscriptTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptTranslation_transcriptId_language_key" ON "TranscriptTranslation"("transcriptId", "language");

-- AddForeignKey
ALTER TABLE "TranscriptTranslation" ADD CONSTRAINT "TranscriptTranslation_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;
