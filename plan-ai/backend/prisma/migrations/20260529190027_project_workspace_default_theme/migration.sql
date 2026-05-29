-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "defaultThemeId" TEXT;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "themeId" TEXT;

-- CreateIndex
CREATE INDEX "Workspace_defaultThemeId_idx" ON "Workspace"("defaultThemeId");

-- CreateIndex
CREATE INDEX "projects_themeId_idx" ON "projects"("themeId");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_defaultThemeId_fkey" FOREIGN KEY ("defaultThemeId") REFERENCES "BrandTheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "BrandTheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;
