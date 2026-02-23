-- CreateTable
CREATE TABLE "SlideTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "primaryColor" VARCHAR(24),
    "secondaryColor" VARCHAR(24),
    "backgroundColor" VARCHAR(24),
    "headingFont" VARCHAR(80),
    "bodyFont" VARCHAR(80),
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlideTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlideTypeConfig" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "slideTypeKey" VARCHAR(64) NOT NULL,
    "displayName" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "parametersSchema" JSONB NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlideTypeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Presentation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slidesJson" JSONB NOT NULL,
    "contextIds" TEXT[],
    "status" VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Presentation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlideTemplate_userId_idx" ON "SlideTemplate"("userId");

-- CreateIndex
CREATE INDEX "SlideTypeConfig_templateId_idx" ON "SlideTypeConfig"("templateId");

-- AddForeignKey
ALTER TABLE "SlideTemplate" ADD CONSTRAINT "SlideTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlideTypeConfig" ADD CONSTRAINT "SlideTypeConfig_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SlideTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presentation" ADD CONSTRAINT "Presentation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SlideTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
