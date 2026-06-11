-- CreateTable
CREATE TABLE "DesktopAuthCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesktopAuthCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DesktopAuthCode_code_key" ON "DesktopAuthCode"("code");

-- CreateIndex
CREATE INDEX "DesktopAuthCode_code_idx" ON "DesktopAuthCode"("code");

-- CreateIndex
CREATE INDEX "DesktopAuthCode_userId_idx" ON "DesktopAuthCode"("userId");

-- AddForeignKey
ALTER TABLE "DesktopAuthCode" ADD CONSTRAINT "DesktopAuthCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
