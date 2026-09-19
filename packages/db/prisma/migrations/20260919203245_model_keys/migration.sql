-- AlterTable
ALTER TABLE "Usage" ADD COLUMN     "byok" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ModelKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "ModelId" NOT NULL,
    "keyEnc" TEXT NOT NULL,
    "hint" TEXT NOT NULL,
    "invalidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModelKey_userId_provider_key" ON "ModelKey"("userId", "provider");

-- AddForeignKey
ALTER TABLE "ModelKey" ADD CONSTRAINT "ModelKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
