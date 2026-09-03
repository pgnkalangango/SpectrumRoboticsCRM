import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientAccounts, type AccountRow } from "@/components/hq/clients/client-accounts";
import { PendingSignups, type PendingRow } from "@/components/hq/clients/pending-signups";

export const metadata = { title: "Client accounts" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ tab?: string; company?: string; invite?: string }> }) {
  const user = await requireStaff("LEADERSHIP");
  if (!can(user, "clients.manage")) redirect("/hq?denied=1");
  const sp = await searchParams;
  const [companies, invitedClients] = await Promise.all([
    prisma.company.findMany({
      where: { OR: [{ portalEnabled: true }, { users: { some: { kind: "CLIENT" } } }, ...(sp.company ? [{ id: sp.company }] : [])] },
      orderBy: { name: "asc" },
      select: { id: true, name: true, clientCode: true, domain: true, portalEnabled: true, status: true, source: true, users: { where: { kind: "CLIENT" }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true, status: true, lastSeenAt: true, createdAt: true, emailVerified: true, passwordHash: true } } },
    }),
    prisma.user.findMany({ where: { kind: "CLIENT", status: "INVITED" }, select: { id: true, name: true, email: true, phone: true, createdAt: true, emailVerified: true, company: { select: { id: true, name: true, source: true, portalEnabled: true } } } }),
  ]);
  const invitations = invitedClients.length ? await prisma.invitation.findMany({ where: { email: { in: invitedClients.map((u) => u.email) } }, select: { email: true } }) : [];
  const invitedEmails = new Set(invitations.map((i) => i.email));
  // A self sign up has no invitation row. Invited users are waiting on their own link and live under Accounts.
  const pending: PendingRow[] = invitedClients
    .filter((u) => !invitedEmails.has(u.email))
    .map((u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, createdAt: u.createdAt.toISOString(), emailVerified: !!u.emailVerified, company: u.company ? { id: u.company.id, name: u.company.name, autoCreated: u.company.source === "portal_signup", portalEnabled: u.company.portalEnabled } : null }));
  const pendingIds = new Set(pending.map((p) => p.id));
  const accounts: AccountRow[] = companies.map((c) => ({
    id: c.id,
    name: c.name,
    clientCode: c.clientCode,
    domain: c.domain,
    portalEnabled: c.portalEnabled,
    status: c.status,
    users: c.users.filter((u) => !pendingIds.has(u.id)).map((u) => ({ id: u.id, name: u.name, email: u.email, status: u.status, lastSeenAt: u.lastSeenAt?.toISOString() ?? null, createdAt: u.createdAt.toISOString(), emailVerified: !!u.emailVerified })),
  }));
  const preselect = sp.company ? companies.find((c) => c.id === sp.company) : undefined;

  return (
    <div>
      <PageHeader title="Client accounts" subtitle="Who can sign in to the client portal. Turn portal access on per company, invite people, and approve sign ups that came in on their own." />
      <Tabs defaultValue={sp.tab === "pending" ? "pending" : "accounts"}>
        <TabsList>
          <TabsTrigger value="accounts">
            Accounts <span className="rounded bg-surface-2 px-1 text-[10px]">{accounts.length}</span>
          </TabsTrigger>
          <TabsTrigger value="pending">
            Pending sign ups {pending.length ? <span className="rounded bg-warn px-1 text-[10px] font-bold text-white">{pending.length}</span> : <span className="rounded bg-surface-2 px-1 text-[10px]">0</span>}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="accounts">
          <ClientAccounts accounts={accounts} highlightId={sp.company ?? null} preselect={preselect ? { id: preselect.id, label: preselect.name } : null} />
        </TabsContent>
        <TabsContent value="pending">
          <PendingSignups rows={pending} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
