import { prisma } from "@/lib/prisma";
import type { Connection } from "@/generated/prisma/client";
import { GraphProvider } from "@/lib/mail/graph";
import { GmailProvider } from "@/lib/mail/gmail";
import type { MailProvider } from "@/lib/mail/types";

export async function getMailConnection(userId: string): Promise<Connection | null> {
  return prisma.connection.findFirst({ where: { userId, kind: "mail_calendar", status: { in: ["ACTIVE", "EXPIRED"] } }, orderBy: { updatedAt: "desc" } });
}

export function providerFor(conn: Connection): MailProvider {
  return conn.provider === "MICROSOFT" ? new GraphProvider(conn) : new GmailProvider(conn);
}

// The person's own mailbox, or null when nothing is connected. Never used across users.
export async function getMailProvider(userId: string): Promise<{ conn: Connection; provider: MailProvider } | null> {
  const conn = await getMailConnection(userId);
  if (!conn) return null;
  return { conn, provider: providerFor(conn) };
}
