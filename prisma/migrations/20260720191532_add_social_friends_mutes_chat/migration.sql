-- CreateEnum
CREATE TYPE "FriendRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "friend_requests" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "addresseeId" TEXT NOT NULL,
    "status" "FriendRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "friend_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mutes" (
    "id" TEXT NOT NULL,
    "muterId" TEXT NOT NULL,
    "mutedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mutes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'global',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "friend_requests_addresseeId_status_idx" ON "friend_requests"("addresseeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "friend_requests_requesterId_addresseeId_key" ON "friend_requests"("requesterId", "addresseeId");

-- CreateIndex
CREATE UNIQUE INDEX "mutes_muterId_mutedId_key" ON "mutes"("muterId", "mutedId");

-- CreateIndex
CREATE INDEX "chat_messages_channel_createdAt_idx" ON "chat_messages"("channel", "createdAt");

-- AddForeignKey
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mutes" ADD CONSTRAINT "mutes_muterId_fkey" FOREIGN KEY ("muterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mutes" ADD CONSTRAINT "mutes_mutedId_fkey" FOREIGN KEY ("mutedId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
