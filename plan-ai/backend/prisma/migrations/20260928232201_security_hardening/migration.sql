-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "allowedEmailDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "requireMfa" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiredSignInProvider" TEXT;

-- AlterTable
ALTER TABLE "Prototype" ADD COLUMN     "shareToken" TEXT;

-- AlterTable
ALTER TABLE "DesktopAuthCode" ADD COLUMN     "codeChallenge" VARCHAR(64),
ADD COLUMN     "secondFactor" VARCHAR(32),
ADD COLUMN     "signInProvider" VARCHAR(64);

-- AlterTable
ALTER TABLE "Presentation" ADD COLUMN     "shareToken" TEXT;

-- AlterTable
ALTER TABLE "DocDocument" ADD COLUMN     "shareToken" TEXT;

-- AlterTable
ALTER TABLE "Diagram" ADD COLUMN     "shareToken" TEXT;

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Prototype_shareToken_key" ON "Prototype"("shareToken");

-- CreateIndex
CREATE UNIQUE INDEX "Presentation_shareToken_key" ON "Presentation"("shareToken");

-- CreateIndex
CREATE UNIQUE INDEX "DocDocument_shareToken_key" ON "DocDocument"("shareToken");

-- CreateIndex
CREATE UNIQUE INDEX "Diagram_shareToken_key" ON "Diagram"("shareToken");

