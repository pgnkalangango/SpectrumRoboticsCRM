import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { TIER_LABELS } from "@/lib/permissions";
import { InviteForm } from "./invite-form";

export const metadata = { title: "Accept invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await prisma.invitation.findUnique({ where: { token }, include: { invitedBy: { select: { name: true } } } });
  const valid = inv && !inv.acceptedAt && inv.expiresAt > new Date();
  if (!valid) {
    return (
      <div className="text-center">
        <h1 className="font-display text-2xl font-bold">This invitation is no longer valid</h1>
        <p className="mt-2 text-sm text-muted">It may have expired or already been used. Ask the person who invited you to send a new one.</p>
        <Button asChild variant="secondary" className="mt-6">
          <Link href="/login">Go to sign in</Link>
        </Button>
      </div>
    );
  }
  const company = inv.companyId ? await prisma.company.findUnique({ where: { id: inv.companyId }, select: { name: true } }) : null;
  return (
    <div>
      <div className="mb-6">
        <div className="eyebrow mb-2">{inv.kind === "CLIENT" ? "Client portal" : "Spectrum HQ"}</div>
        <h1 className="font-display text-[26px] font-bold text-ink">You are invited</h1>
        <p className="mt-1 text-sm text-muted">
          {inv.invitedBy.name} invited <span className="font-medium text-ink">{inv.email}</span>
          {inv.kind === "CLIENT" ? ` to the ${company?.name ?? "client"} portal.` : ` to join Spectrum HQ as ${TIER_LABELS[inv.tier].toLowerCase()}.`} Choose a password to finish.
        </p>
      </div>
      <InviteForm token={token} defaultName={inv.name ?? ""} />
    </div>
  );
}
