import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { getMailConnection } from "@/lib/mail/provider";
import { googleConfigured, microsoftConfigured } from "@/lib/mail/oauth";
import { followUpSuggestions } from "@/lib/mail/people";
import { assistantConfigured } from "@/lib/ai/run";
import { PageHeader } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { ConnectMailbox } from "@/components/hq/inbox/connect-mailbox";
import { PeopleView, type Person } from "@/components/hq/inbox/people-view";

export const metadata = { title: "People in your mailbox" };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const conn = await getMailConnection(user.id);
  if (!conn) {
    return (
      <div>
        <PageHeader title="People in your mailbox" subtitle="Connect your mailbox and HQ will find everyone you talk to, fill in their details, and tell you who needs a follow up." />
        <ConnectMailbox canConnect={{ microsoft: microsoftConfigured(), google: googleConfigured() }} error={sp.error} isOwner={user.tier === "OWNER"} />
      </div>
    );
  }
  const [rows, followUps] = await Promise.all([
    prisma.mailContact.findMany({
      where: { userId: user.id, status: { in: ["NEW", "ADDED", "IGNORED"] } },
      orderBy: [{ score: "desc" }, { lastSeenAt: "desc" }],
      take: 1500,
      include: { contact: { select: { id: true, firstName: true, lastName: true, jobTitle: true, phoneMobile: true, companyName: true, company: { select: { id: true, name: true } } } } },
    }),
    followUpSuggestions(user.id),
  ]);
  const people: Person[] = rows.map((p) => ({
    id: p.id,
    email: p.email,
    name: p.contact ? [p.contact.firstName, p.contact.lastName].filter(Boolean).join(" ") : p.name ?? p.email,
    firstName: p.firstName ?? "",
    lastName: p.lastName ?? "",
    company: p.contact?.company?.name ?? p.contact?.companyName ?? p.companyGuess ?? null,
    companyId: p.contact?.company?.id ?? null,
    jobTitle: p.contact?.jobTitle ?? p.jobTitle ?? null,
    phone: p.contact?.phoneMobile ?? p.phone ?? null,
    linkedinUrl: p.linkedinUrl,
    domain: p.domain,
    messagesIn: p.messagesIn,
    messagesOut: p.messagesOut,
    threads: p.threads,
    firstSeenAt: p.firstSeenAt?.toISOString() ?? null,
    lastSeenAt: p.lastSeenAt?.toISOString() ?? null,
    lastInboundAt: p.lastInboundAt?.toISOString() ?? null,
    lastOutboundAt: p.lastOutboundAt?.toISOString() ?? null,
    lastSubject: p.lastSubject,
    lastThreadId: p.lastThreadId,
    score: p.score,
    status: p.status as Person["status"],
    contactId: p.contactId,
    signature: p.signature,
  }));
  const discoveredAt = rows.reduce<Date | null>((m, r) => (!m || r.updatedAt > m ? r.updatedAt : m), null);

  return (
    <div>
      <PageHeader
        title="People in your mailbox"
        subtitle={`${conn.accountEmail}. Everyone you have written to or heard from, with details read from their signatures. Only you can see this list.`}
        actions={<Button variant="outline" asChild><Link href="/hq/inbox">Back to inbox</Link></Button>}
      />
      <PeopleView people={people} followUps={followUps} initialTab={sp.tab ?? "new"} discoveredAt={discoveredAt?.toISOString() ?? null} assistantOn={assistantConfigured()} />
    </div>
  );
}
