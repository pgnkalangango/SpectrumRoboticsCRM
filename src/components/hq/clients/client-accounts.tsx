"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ExternalLink, KeyRound, Mail, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { cn, relTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/empty-state";
import type { PickerValue } from "@/components/hq/entity-picker";
import { ClientInviteDialog } from "@/components/hq/clients/client-invite-dialog";
import { CopyLinkDialog, type ShareLink } from "@/components/hq/clients/copy-link-dialog";
import { setPortalEnabled, setClientUserStatus, resendClientInvitation } from "@/server/actions/clients";

export type ClientUserRow = { id: string; name: string; email: string; status: "INVITED" | "ACTIVE" | "INACTIVE"; lastSeenAt: string | null; createdAt: string; emailVerified: boolean };
export type AccountRow = { id: string; name: string; clientCode: string | null; domain: string | null; portalEnabled: boolean; status: string; users: ClientUserRow[] };

export function ClientAccounts({ accounts, highlightId, preselect }: { accounts: AccountRow[]; highlightId: string | null; preselect: PickerValue }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  // ?invite=1 (from a company page) opens the dialog on first render with that company selected.
  const [inviteFor, setInviteFor] = React.useState<PickerValue | null>(() => (sp.get("invite") === "1" ? preselect : null));
  const [inviteOpen, setInviteOpen] = React.useState(() => sp.get("invite") === "1");
  const [link, setLink] = React.useState<ShareLink | null>(null);
  const [pending, start] = React.useTransition();

  React.useEffect(() => {
    if (highlightId) document.getElementById(`account-${highlightId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightId]);

  const closeInvite = () => {
    setInviteOpen(false);
    if (sp.get("invite")) {
      const next = new URLSearchParams(sp.toString());
      next.delete("invite");
      router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  };
  const openInvite = (c: PickerValue) => {
    setInviteFor(c);
    setInviteOpen(true);
  };
  const togglePortal = (id: string, enabled: boolean) =>
    start(async () => {
      const r = await setPortalEnabled(id, enabled);
      if (r.ok) {
        toast.success(enabled ? "Portal enabled" : "Portal disabled");
        router.refresh();
      } else toast.error(r.error);
    });
  const setStatus = (u: ClientUserRow, status: "ACTIVE" | "INACTIVE") => {
    if (status === "INACTIVE" && !confirm(`Deactivate ${u.name}? They will not be able to sign in to the portal.`)) return;
    start(async () => {
      const r = await setClientUserStatus(u.id, status);
      if (r.ok) {
        toast.success(status === "INACTIVE" ? "Deactivated" : "Reactivated");
        router.refresh();
      } else toast.error(r.error);
    });
  };
  const resend = (u: ClientUserRow) =>
    start(async () => {
      const r = await resendClientInvitation(u.id);
      if (r.ok && r.data) setLink({ title: "New portal invitation link", url: r.data.inviteUrl, delivered: r.data.delivered });
      else if (!r.ok) toast.error(r.error);
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{accounts.length} compan{accounts.length === 1 ? "y" : "ies"} with portal access or portal users.</p>
        <Button onClick={() => openInvite(null)}>
          <UserPlus /> Invite a portal user
        </Button>
      </div>
      {accounts.length === 0 ? (
        <EmptyState icon={KeyRound} title="No client accounts yet" body="Invite a customer contact to the portal. They get an email to set a password, and the company's portal turns on." action={<Button onClick={() => openInvite(null)}><UserPlus /> Invite a portal user</Button>} />
      ) : (
        accounts.map((c) => (
          <section key={c.id} id={`account-${c.id}`} className={cn("rounded-xl border bg-surface shadow-sm transition-colors", highlightId === c.id ? "border-brand ring-2 ring-brand/20" : "border-line")}>
            <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
              <Avatar name={c.name} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/hq/companies/${c.id}`} className="font-display text-[15px] font-semibold text-ink hover:text-brand">
                    {c.name}
                  </Link>
                  {c.clientCode ? <Badge className="font-mono">{c.clientCode}</Badge> : null}
                  <StatusBadge value={c.status} />
                </div>
                <div className="text-xs text-muted">
                  {c.users.filter((u) => u.status === "ACTIVE").length} active user{c.users.filter((u) => u.status === "ACTIVE").length === 1 ? "" : "s"}
                  {c.domain ? ` · ${c.domain}` : ""}
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-ink-2">
                Portal {c.portalEnabled ? "on" : "off"}
                <Switch checked={c.portalEnabled} disabled={pending} onCheckedChange={(v) => togglePortal(c.id, v)} />
              </label>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/portal?company=${c.id}`} target="_blank">
                  <ExternalLink /> Preview portal
                </Link>
              </Button>
              <Button size="sm" variant="secondary" onClick={() => openInvite({ id: c.id, label: c.name })}>
                <UserPlus /> Invite user
              </Button>
            </header>
            {c.users.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted">No portal users yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {c.users.map((u) => (
                  <li key={u.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-2.5", u.status === "INACTIVE" && "opacity-60")}>
                    <Avatar name={u.name} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-ink">{u.name}</span>
                        <StatusBadge value={u.status} />
                        {u.status === "ACTIVE" && !u.emailVerified ? <Badge variant="warn">Email not confirmed</Badge> : null}
                      </div>
                      <div className="truncate text-xs text-muted">
                        {u.email} · {u.status === "INVITED" ? `invited ${relTime(u.createdAt)}` : u.lastSeenAt ? `seen ${relTime(u.lastSeenAt)}` : "never signed in"}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {u.status === "INVITED" ? (
                        <Button size="sm" variant="ghost" onClick={() => resend(u)} disabled={pending}>
                          <Mail /> Resend invite
                        </Button>
                      ) : null}
                      {u.status === "INACTIVE" ? (
                        <Button size="sm" variant="ghost" onClick={() => setStatus(u, "ACTIVE")} disabled={pending}>
                          <UserPlus /> Reactivate
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="text-bad hover:bg-bad-soft" onClick={() => setStatus(u, "INACTIVE")} disabled={pending}>
                          <UserMinus /> Deactivate
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
      <ClientInviteDialog open={inviteOpen} onClose={closeInvite} company={inviteFor} onInvited={setLink} />
      <CopyLinkDialog link={link} onClose={() => setLink(null)} />
    </div>
  );
}
