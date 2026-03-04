-- CreateEnum
CREATE TYPE "DiagramType" AS ENUM ('FLOWCHART', 'SEQUENCE', 'GANTT', 'MINDMAP', 'CLASS', 'ER', 'ARCHITECTURE');

-- CreateEnum
CREATE TYPE "DiagramStatus" AS ENUM ('GENERATING', 'DRAFT', 'FAILED');

-- CreateTable
CREATE TABLE "Diagram" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "mermaidCode" TEXT,
    "type" "DiagramType" NOT NULL,
    "status" "DiagramStatus" NOT NULL DEFAULT 'DRAFT',
    "contextIds" TEXT[],
    "transcriptIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Diagram_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Diagram_userId_idx" ON "Diagram"("userId");

-- CreateIndex
CREATE INDEX "Diagram_projectId_idx" ON "Diagram"("projectId");

-- AddForeignKey
ALTER TABLE "Diagram" ADD CONSTRAINT "Diagram_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagram" ADD CONSTRAINT "Diagram_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
