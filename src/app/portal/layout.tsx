import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/session";
import { Providers } from "@/components/providers";
import { PortalShell } from "@/components/portal/shell";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requireClient();
  const user = await prisma.user.findUnique({ where: { id: session.id }, select: { name: true, email: true, image: true, companyId: true } });
  const company = user?.companyId ? await prisma.company.findUnique({ where: { id: user.companyId }, select: { name: true, owner: { select: { name: true, email: true, phone: true } } } }) : null;
  return (
    <Providers>
      <PortalShell user={{ name: user?.name ?? session.name, email: user?.email ?? session.email, image: user?.image }} company={company ? { name: company.name, accountManager: company.owner } : null} staffView={session.kind === "STAFF"}>
        {children}
      </PortalShell>
    </Providers>
  );
}
