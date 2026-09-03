import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/session";
import { portalScope } from "@/lib/portal";
import { fmtDate, relTime } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/badge";
import { Fact, FactGrid, PortalHeader, PortalPanel } from "@/components/portal/ui";
import { PasswordForm, ProfileForm } from "@/components/portal/profile-forms";

export const metadata = { title: "My profile" };

export default async function PortalProfilePage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const session = await requireClient();
  const sp = await searchParams;
  const scope = await portalScope(session, sp.company);
  const [me, company] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.id }, select: { id: true, name: true, email: true, phone: true, timezone: true, image: true, passwordHash: true, createdAt: true } }),
    scope.companyId ? prisma.company.findUnique({ where: { id: scope.companyId }, select: { name: true, addressStreet: true, addressCity: true, addressState: true, addressZip: true, phone: true, website: true, clientCode: true, owner: { select: { name: true, email: true, phone: true } }, users: { where: { kind: "CLIENT", id: { not: session.id } }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true, status: true, lastSeenAt: true } } } }) : null,
  ]);
  if (!me) return null;

  return (
    <div>
      <PortalHeader title="My profile" intro="Keep your contact details current so the team can reach you about service visits." />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-5">
          <PortalPanel title="Your details">
            <div className="mb-5 flex items-center gap-4">
              <Avatar name={me.name} src={me.image} size={56} />
              <div>
                <div className="font-display text-[17px] font-semibold text-ink">{me.name}</div>
                <div className="text-[14px] text-muted">{me.email} · member since {fmtDate(me.createdAt)}</div>
              </div>
            </div>
            <ProfileForm initial={{ name: me.name, phone: me.phone ?? "", timezone: me.timezone }} />
          </PortalPanel>
          <PortalPanel title="Password">
            <PasswordForm hasPassword={!!me.passwordHash} />
          </PortalPanel>
        </div>
        <div className="flex flex-col gap-5">
          {company ? (
            <PortalPanel title="Your company">
              <FactGrid cols={2}>
                <Fact label="Name" value={company.name} className="sm:col-span-2" />
                <Fact label="Address" value={[company.addressStreet, [company.addressCity, company.addressState].filter(Boolean).join(", "), company.addressZip].filter(Boolean).join(", ")} className="sm:col-span-2" />
                <Fact label="Phone" value={company.phone} />
                <Fact label="Client code" value={company.clientCode} />
              </FactGrid>
              <p className="mt-4 text-[13px] text-muted">Need to change company details? Ask your Spectrum contact{company.owner ? `, ${company.owner.name}` : ""}.</p>
            </PortalPanel>
          ) : null}
          {company ? (
            <PortalPanel title="Others at your company" padded={false}>
              {company.users.length === 0 ? (
                <p className="p-5 text-[14px] text-muted">You are the only portal user for {company.name}. Ask your Spectrum contact to invite a colleague.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {company.users.map((u) => (
                    <li key={u.id} className="flex items-center gap-3 px-5 py-3">
                      <Avatar name={u.name} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-medium text-ink">{u.name}</div>
                        <div className="truncate text-[13px] text-muted">{u.email}{u.lastSeenAt ? ` · seen ${relTime(u.lastSeenAt)}` : ""}</div>
                      </div>
                      <StatusBadge value={u.status} />
                    </li>
                  ))}
                </ul>
              )}
            </PortalPanel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
