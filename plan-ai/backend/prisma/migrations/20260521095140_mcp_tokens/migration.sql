-- CreateTable
CREATE TABLE "McpToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpToken_tokenHash_key" ON "McpToken"("tokenHash");

-- CreateIndex
CREATE INDEX "McpToken_userId_idx" ON "McpToken"("userId");

-- CreateIndex
CREATE INDEX "McpToken_workspaceId_idx" ON "McpToken"("workspaceId");

-- CreateIndex
CREATE INDEX "McpToken_tokenHash_idx" ON "McpToken"("tokenHash");

-- AddForeignKey
ALTER TABLE "McpToken" ADD CONSTRAINT "McpToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpToken" ADD CONSTRAINT "McpToken_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
