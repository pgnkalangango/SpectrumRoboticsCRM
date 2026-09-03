import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/permissions";

// Client scoping. Every portal query goes through here so a client can only ever see their own company.
export async function portalScope(user: SessionUser, override?: string | null): Promise<{ companyId: string | null; contactId: string | null; email: string }> {
  if (user.kind === "STAFF") {
    // Staff may preview a client's portal with ?company=<id>.
    return { companyId: override ?? null, contactId: null, email: user.email };
  }
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { companyId: true, contactId: true, email: true, status: true } });
  if (!u || u.status !== "ACTIVE") return { companyId: null, contactId: null, email: user.email };
  return { companyId: u.companyId, contactId: u.contactId, email: u.email };
}
