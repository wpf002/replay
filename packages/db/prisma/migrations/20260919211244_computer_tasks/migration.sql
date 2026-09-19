-- CreateEnum
CREATE TYPE "ComputerTaskStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_APPROVAL', 'WAITING_USER', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateTable
CREATE TABLE "ComputerTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "goal" TEXT NOT NULL,
    "startUrl" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'browse',
    "status" "ComputerTaskStatus" NOT NULL DEFAULT 'QUEUED',
    "waitingKind" TEXT,
    "waitingFor" TEXT,
    "actionId" TEXT,
    "url" TEXT,
    "title" TEXT,
    "summary" TEXT,
    "error" TEXT,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "ComputerTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComputerStep" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComputerStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComputerTask_userId_createdAt_idx" ON "ComputerTask"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ComputerTask_userId_status_idx" ON "ComputerTask"("userId", "status");

-- CreateIndex
CREATE INDEX "ComputerStep_taskId_createdAt_idx" ON "ComputerStep"("taskId", "createdAt");

-- AddForeignKey
ALTER TABLE "ComputerTask" ADD CONSTRAINT "ComputerTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComputerStep" ADD CONSTRAINT "ComputerStep_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ComputerTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
