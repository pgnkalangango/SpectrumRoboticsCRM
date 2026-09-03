import Link from "next/link";
import { Plug, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { getSetting } from "@/lib/settings";
import { TIER_LABELS, ROLE_LABELS } from "@/lib/permissions";
import { fmtDate, label, relTime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/empty-state";
import { Avatar } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, KeyValue } from "@/components/hq/record";
import { ProfileForm } from "@/components/hq/me/profile-form";
import { PreferencesForm, type Prefs } from "@/components/hq/me/preferences-form";
import { PasswordForm } from "@/components/hq/me/password-form";
import { ReplayTourButton } from "@/components/hq/me/replay-tour-button";

export const metadata = { title: "My profile" };

export default async function MePage() {
  const session = await requireStaff();
  const [user, company] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.id }, include: { department: { select: { name: true, color: true } }, manager: { select: { name: true } }, connections: { orderBy: { createdAt: "asc" } } } }),
    getSetting("company"),
  ]);
  if (!user) return null;
  const prefsRaw = (user.preferences as Partial<Prefs> | null) ?? {};
  const prefs: Prefs = { emailDigest: prefsRaw.emailDigest ?? "daily", notifyOnApprovals: prefsRaw.notifyOnApprovals ?? true, notifyOnTickets: prefsRaw.notifyOnTickets ?? true };
  const providerLabel: Record<string, string> = { MICROSOFT: "Microsoft 365", GOOGLE: "Google Workspace", QUICKBOOKS: "QuickBooks", LINKEDIN: "LinkedIn", META: "Meta", CANVA: "Canva", STRIPE: "Stripe", SLACK: "Slack" };

  return (
    <div>
      <PageHeader title="My profile" subtitle="How you appear to the team and to customers, how the assistant writes as you, and what you get notified about." />
      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <div className="flex flex-col gap-4">
          <Panel>
            <div className="flex flex-col items-center text-center">
              <Avatar name={user.name} src={user.image} color={user.avatarColor} size={72} />
              <div className="mt-3 font-display text-lg font-bold text-ink">{user.name}</div>
              <div className="text-sm text-muted">{user.title ?? ROLE_LABELS[user.roleLabel] ?? label(user.roleLabel)}</div>
              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                <StatusBadge value={user.tier} labelOverride={TIER_LABELS[user.tier]} />
                {user.department ? (
                  <Badge>
                    <span className="size-1.5 rounded-full" style={{ background: user.department.color }} /> {user.department.name}
                  </Badge>
                ) : null}
              </div>
            </div>
            <div className="mt-4 border-t border-line pt-4">
              <KeyValue items={[{ label: "Email", value: user.email }, { label: "Manager", value: user.manager?.name }, { label: "Territory", value: user.territory }, { label: "Approval limit", value: `${user.approvalLimitPct}% discount` }, { label: "Joined", value: fmtDate(user.createdAt, { year: "numeric" }) }]} />
              <p className="mt-3 text-[11px] text-muted">Access level, role and permissions are managed by owners from Team.</p>
            </div>
          </Panel>

          <Panel title="Connected accounts">
            {user.connections.length === 0 ? (
              <p className="text-sm text-muted">No mailbox or calendar connected yet. Connect one so the timeline, inbox and assistant can see your email.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {user.connections.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
                    <Plug className="size-4 text-muted" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-ink">{providerLabel[c.provider] ?? label(c.provider)}</span>
                        <StatusBadge value={c.status} />
                      </div>
                      <div className="truncate text-xs text-muted">
                        {c.accountEmail ?? c.accountName ?? label(c.kind)}
                        {c.lastSyncAt ? ` · synced ${relTime(c.lastSyncAt)}` : " · not synced yet"}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Button asChild size="sm" variant="secondary" className="mt-3 w-full">
              <Link href="/hq/inbox">
                <ExternalLink /> {user.connections.length ? "Manage in Inbox" : "Connect in Inbox"}
              </Link>
            </Button>
          </Panel>

          <Panel title="Walkthrough">
            <p className="mb-3 text-sm text-muted">Take the two minute tour of the main screens again.</p>
            <ReplayTourButton />
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <ProfileForm
            initial={{ name: user.name, email: user.email, image: user.image, title: user.title, phone: user.phone, bookingLink: user.bookingLink, territory: user.territory, timezone: user.timezone, avatarColor: user.avatarColor, signatureHtml: user.signatureHtml, voiceProfile: user.voiceProfile }}
            company={{ name: company.name, address: company.address, phone: company.phone, website: company.website, tagline: company.tagline }}
          />
          <PreferencesForm initial={prefs} />
          <PasswordForm hasPassword={!!user.passwordHash} />
        </div>
      </div>
    </div>
  );
}
