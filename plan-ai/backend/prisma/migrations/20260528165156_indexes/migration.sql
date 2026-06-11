-- CreateIndex
CREATE INDEX "AiUsageLog_createdAt_idx" ON "AiUsageLog"("createdAt");

-- CreateIndex
CREATE INDEX "AiUsageLog_projectId_idx" ON "AiUsageLog"("projectId");

-- CreateIndex
CREATE INDEX "AiUsageLog_workspaceId_createdAt_idx" ON "AiUsageLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatThread_createdAt_idx" ON "ChatThread"("createdAt");

-- CreateIndex
CREATE INDEX "Task_createdAt_idx" ON "Task"("createdAt");

-- CreateIndex
CREATE INDEX "Transcript_userId_idx" ON "Transcript"("userId");

-- CreateIndex
CREATE INDEX "Transcript_createdAt_idx" ON "Transcript"("createdAt");
