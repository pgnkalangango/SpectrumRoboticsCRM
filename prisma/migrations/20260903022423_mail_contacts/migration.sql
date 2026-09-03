-- CreateEnum
CREATE TYPE "MailContactStatus" AS ENUM ('NEW', 'ADDED', 'IGNORED', 'INTERNAL', 'AUTOMATED');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "lastHeardFromAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MailContact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "domain" TEXT,
    "companyGuess" TEXT,
    "jobTitle" TEXT,
    "phone" TEXT,
    "linkedinUrl" TEXT,
    "signature" TEXT,
    "messagesIn" INTEGER NOT NULL DEFAULT 0,
    "messagesOut" INTEGER NOT NULL DEFAULT 0,
    "threads" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "lastSubject" TEXT,
    "lastThreadId" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "status" "MailContactStatus" NOT NULL DEFAULT 'NEW',
    "contactId" TEXT,
    "enrichedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailContact_userId_status_idx" ON "MailContact"("userId", "status");

-- CreateIndex
CREATE INDEX "MailContact_contactId_idx" ON "MailContact"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "MailContact_userId_email_key" ON "MailContact"("userId", "email");

-- AddForeignKey
ALTER TABLE "MailContact" ADD CONSTRAINT "MailContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailContact" ADD CONSTRAINT "MailContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
