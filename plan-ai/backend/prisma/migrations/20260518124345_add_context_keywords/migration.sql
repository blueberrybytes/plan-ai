-- AlterTable
ALTER TABLE "Context" ADD COLUMN     "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[];
