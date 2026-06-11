-- CreateEnum
CREATE TYPE "UserPersona" AS ENUM ('PROJECT_MANAGER', 'SOFTWARE_ENGINEER', 'DESIGNER', 'PRODUCT_MANAGER', 'EXECUTIVE', 'OTHER');

-- AlterTable
ALTER TABLE "WorkspaceInvitation" ADD COLUMN     "personas" "UserPersona"[] DEFAULT ARRAY[]::"UserPersona"[];

-- AlterTable
ALTER TABLE "WorkspaceMember" ADD COLUMN     "personas" "UserPersona"[] DEFAULT ARRAY[]::"UserPersona"[];
