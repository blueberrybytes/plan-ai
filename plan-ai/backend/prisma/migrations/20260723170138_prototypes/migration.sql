-- CreateTable
CREATE TABLE "Prototype" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "variant" VARCHAR(32) NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "transcriptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prototype_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Prototype_workspaceId_idx" ON "Prototype"("workspaceId");

-- CreateIndex
CREATE INDEX "Prototype_userId_idx" ON "Prototype"("userId");

-- CreateIndex
CREATE INDEX "Prototype_isPublic_idx" ON "Prototype"("isPublic");

-- AddForeignKey
ALTER TABLE "Prototype" ADD CONSTRAINT "Prototype_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prototype" ADD CONSTRAINT "Prototype_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
