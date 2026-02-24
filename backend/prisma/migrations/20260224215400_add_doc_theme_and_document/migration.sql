-- CreateTable
CREATE TABLE "DocTheme" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "headingFont" VARCHAR(80) NOT NULL DEFAULT 'Inter',
    "bodyFont" VARCHAR(80) NOT NULL DEFAULT 'Inter',
    "primaryColor" VARCHAR(24) NOT NULL DEFAULT '#4361EE',
    "accentColor" VARCHAR(24) NOT NULL DEFAULT '#7c3aed',
    "backgroundColor" VARCHAR(24) NOT NULL DEFAULT '#ffffff',
    "textColor" VARCHAR(24) NOT NULL DEFAULT '#0f172a',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocTheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "themeId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "contextIds" TEXT[],
    "transcriptIds" TEXT[],
    "prompt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocTheme_userId_idx" ON "DocTheme"("userId");

-- CreateIndex
CREATE INDEX "DocDocument_userId_idx" ON "DocDocument"("userId");

-- CreateIndex
CREATE INDEX "DocDocument_isPublic_idx" ON "DocDocument"("isPublic");

-- AddForeignKey
ALTER TABLE "DocTheme" ADD CONSTRAINT "DocTheme_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocDocument" ADD CONSTRAINT "DocDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocDocument" ADD CONSTRAINT "DocDocument_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "DocTheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;
