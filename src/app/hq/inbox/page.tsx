import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { getMailConnection } from "@/lib/mail/provider";
import { googleConfigured, microsoftConfigured } from "@/lib/mail/oauth";
import { mailStats } from "@/lib/mail/sync";
import { PageHeader } from "@/components/ui/empty-state";
import { InboxView, type InboxThread } from "@/components/hq/inbox/inbox-view";
import { ConnectMailbox } from "@/components/hq/inbox/connect-mailbox";
import { fullName } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Inbox" };

export default async function InboxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const conn = await getMailConnection(user.id);
  const canConnect = { microsoft: microsoftConfigured(), google: googleConfigured() };

  if (!conn) {
    return (
      <div>
        <PageHeader title="Inbox" subtitle="Your own email and calendar, connected to the CRM. Only you can see your mailbox." />
        <ConnectMailbox canConnect={canConnect} error={sp.error} isOwner={user.tier === "OWNER"} />
      </div>
    );
  }

  const [rows, stats] = await Promise.all([
    prisma.mailMessage.findMany({ where: { userId: user.id }, orderBy: { receivedAt: "desc" }, take: 400, include: { contact: { select: { id: true, firstName: true, lastName: true, companyName: true, company: { select: { name: true } } } } } }),
    mailStats(user.id, 30),
  ]);
  const threads = new Map<string, InboxThread>();
  for (const r of rows) {
    const key = r.threadId ?? r.externalId;
    const t = threads.get(key);
    const counterpart = r.direction === "INBOUND" ? { email: r.fromEmail ?? "", name: r.fromName } : { email: r.toEmails[0] ?? "", name: null };
    if (!t) {
      threads.set(key, {
        threadId: key,
        subject: r.subject ?? "(no subject)",
        lastAt: r.receivedAt.toISOString(),
        lastDirection: r.direction as "INBOUND" | "OUTBOUND",
        snippet: r.snippet ?? "",
        unread: !r.isRead && r.direction === "INBOUND",
        count: 1,
        counterpart,
        contact: r.contact ? { id: r.contact.id, name: fullName(r.contact), company: r.contact.company?.name ?? r.contact.companyName ?? null } : null,
        lastExternalId: r.externalId,
        hasAttachments: r.hasAttachments,
      });
    } else {
      t.count++;
      if (!r.isRead && r.direction === "INBOUND") t.unread = true;
      if (!t.contact && r.contact) t.contact = { id: r.contact.id, name: fullName(r.contact), company: r.contact.company?.name ?? r.contact.companyName ?? null };
    }
  }

  return (
    <div>
      <PageHeader
        title="Inbox"
        subtitle={`${conn.accountEmail} via ${conn.provider === "MICROSOFT" ? "Microsoft 365" : "Google Workspace"}${conn.lastSyncAt ? ` · synced ${new Date(conn.lastSyncAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : " · not synced yet"}`}
        actions={<Button variant="secondary" asChild><Link href="/hq/inbox/people">People and follow ups</Link></Button>}
      />
      <InboxView
        threads={[...threads.values()]}
        stats={stats}
        connection={{ provider: conn.provider, email: conn.accountEmail ?? "", lastSyncAt: conn.lastSyncAt?.toISOString() ?? null, status: conn.status, lastError: conn.lastError }}
        me={{ id: user.id, name: user.name, email: conn.accountEmail ?? user.email }}
        notice={sp.connected ? `Connected ${sp.connected === "microsoft" ? "Microsoft 365" : "Google Workspace"}. Syncing your last 30 days now.` : sp.error ? `Could not connect: ${sp.error}` : null}
      />
    </div>
  );
}
