-- AlterTable
ALTER TABLE "ChatThread" ALTER COLUMN "contextIds" SET DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Diagram" ALTER COLUMN "contextIds" SET DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "DocDocument" ALTER COLUMN "contextIds" SET DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Presentation" ALTER COLUMN "contextIds" SET DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Transcript" ALTER COLUMN "contextIds" SET DEFAULT ARRAY[]::TEXT[];

-- Rows written before the default hold NULL here. The restricted project
-- filter compares these lists, and a comparison with NULL hides the row.
UPDATE "ChatThread" SET "contextIds" = ARRAY[]::TEXT[] WHERE "contextIds" IS NULL;
UPDATE "Diagram" SET "contextIds" = ARRAY[]::TEXT[] WHERE "contextIds" IS NULL;
UPDATE "DocDocument" SET "contextIds" = ARRAY[]::TEXT[] WHERE "contextIds" IS NULL;
UPDATE "Presentation" SET "contextIds" = ARRAY[]::TEXT[] WHERE "contextIds" IS NULL;
UPDATE "Transcript" SET "contextIds" = ARRAY[]::TEXT[] WHERE "contextIds" IS NULL;
