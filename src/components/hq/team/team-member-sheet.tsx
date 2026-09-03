"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { Check, Copy, KeyRound, Mail, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { FormSheet, FormRow, useUrlSheet } from "@/components/hq/form-sheet";
import { EntityPicker, type PickerValue } from "@/components/hq/entity-picker";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ROLE_LABELS, TIER_LABELS } from "@/lib/permissions";
import { fmtDateTime, relTime } from "@/lib/utils";
import type { Tier } from "@/generated/prisma/enums";
import { PERMISSION_KEYS, PermissionsChecklist, effective, toStoredPermissions } from "@/components/hq/team/permissions-checklist";
import { inviteTeamMember, updateTeamMember, setTeamMemberStatus, resendInvitation, sendPasswordReset } from "@/server/actions/team";

export type TeamDepartment = { id: string; name: string };
export type TeamMemberInitial = {
  id: string;
  name: string;
  email: string;
  tier: Tier;
  status: "INVITED" | "ACTIVE" | "INACTIVE";
  roleLabel: string;
  departmentId: string | null;
  title: string | null;
  manager: PickerValue;
  territory: string | null;
  bookingLink: string | null;
  phone: string | null;
  approvalLimitPct: number;
  permissions: string[];
  lastSeenAt: string | null;
  createdAt: string;
  invitedAt: string | null;
};

type FormValues = {
  name: string;
  email: string;
  tier: "OWNER" | "LEADERSHIP" | "EMPLOYEE";
  roleLabel: string;
  departmentId: string;
  title: string;
  manager: PickerValue;
  territory: string;
  bookingLink: string;
  phone: string;
  approvalLimitPct: number;
  perms: Record<string, boolean>;
};

function permsFor(tier: Tier, permissions: string[]): Record<string, boolean> {
  return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, effective(k, tier, permissions)]));
}

export function TeamMemberSheet({ open, onClose, initial, departments, actor }: { open: boolean; onClose: () => void; initial?: TeamMemberInitial; departments: TeamDepartment[]; actor: { id: string; tier: Tier } }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [link, setLink] = React.useState<{ title: string; url: string; delivered: boolean } | null>(null);
  const isOwner = actor.tier === "OWNER";
  const defaults = React.useCallback(
    (): FormValues => ({
      name: initial?.name ?? "",
      email: initial?.email ?? "",
      tier: (initial?.tier as FormValues["tier"]) ?? "EMPLOYEE",
      roleLabel: initial?.roleLabel ?? "sales_rep",
      departmentId: initial?.departmentId ?? "",
      title: initial?.title ?? "",
      manager: initial?.manager ?? null,
      territory: initial?.territory ?? "",
      bookingLink: initial?.bookingLink ?? "",
      phone: initial?.phone ?? "",
      approvalLimitPct: initial?.approvalLimitPct ?? 0,
      perms: permsFor(initial?.tier ?? "EMPLOYEE", initial?.permissions ?? []),
    }),
    [initial],
  );
  const form = useForm<FormValues>({ defaultValues: defaults() });
  React.useEffect(() => {
    if (open) form.reset(defaults());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);
  const tier = form.watch("tier");
  const prevTier = React.useRef(tier);
  React.useEffect(() => {
    // Changing the tier resets the checklist to that tier's defaults so the stored list stays meaningful.
    if (prevTier.current !== tier) {
      form.setValue("perms", permsFor(tier, initial && initial.tier === tier ? initial.permissions : []));
      prevTier.current = tier;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier]);

  const readOnlyTier = !isOwner && (initial ? initial.tier !== "EMPLOYEE" : false);

  const onSubmit = form.handleSubmit((v) => {
    const payload = {
      name: v.name,
      email: v.email,
      tier: v.tier,
      roleLabel: v.roleLabel,
      departmentId: v.departmentId || null,
      title: v.title || null,
      managerId: v.manager?.id ?? null,
      territory: v.territory || null,
      bookingLink: v.bookingLink || null,
      phone: v.phone || null,
      approvalLimitPct: Number(v.approvalLimitPct) || 0,
      permissions: isOwner ? toStoredPermissions(v.perms, v.tier) : [],
    };
    start(async () => {
      if (initial) {
        const r = await updateTeamMember(initial.id, payload);
        if (r.ok) {
          toast.success("Saved");
          onClose();
          router.refresh();
        } else toast.error(r.error);
      } else {
        const r = await inviteTeamMember(payload);
        if (r.ok && r.data) {
          toast.success(r.data.delivered ? "Invitation sent" : "Invitation created. Copy the link to share it.");
          setLink({ title: "Invitation link", url: r.data.inviteUrl, delivered: r.data.delivered });
          router.refresh();
        } else if (!r.ok) toast.error(r.error);
      }
    });
  });

  const setStatus = (status: "ACTIVE" | "INACTIVE") => {
    if (!initial) return;
    if (status === "INACTIVE" && !confirm(`Deactivate ${initial.name}? They lose access right away and any MCP keys are revoked.`)) return;
    start(async () => {
      const r = await setTeamMemberStatus(initial.id, status);
      if (r.ok) {
        toast.success(status === "INACTIVE" ? "Deactivated" : "Reactivated");
        router.refresh();
        onClose();
      } else toast.error(r.error);
    });
  };
  const resend = () => {
    if (!initial) return;
    start(async () => {
      const r = await resendInvitation(initial.id);
      if (r.ok && r.data) setLink({ title: "New invitation link", url: r.data.inviteUrl, delivered: r.data.delivered });
      else if (!r.ok) toast.error(r.error);
    });
  };
  const reset = () => {
    if (!initial) return;
    start(async () => {
      const r = await sendPasswordReset(initial.id);
      if (r.ok && r.data) setLink({ title: "Password reset link", url: r.data.resetUrl, delivered: r.data.delivered });
      else if (!r.ok) toast.error(r.error);
    });
  };

  return (
    <>
      <FormSheet open={open} onOpenChange={(o) => !o && onClose()} title={initial ? initial.name : "Add a team member"} description={initial ? `${initial.email} · ${TIER_LABELS[initial.tier]}` : "They get an email with a link to choose a password. The link works for 7 days."} formId="team-member-form" pending={pending} submitLabel={initial ? "Save changes" : "Send invitation"} width="max-w-2xl">
        <form id="team-member-form" onSubmit={onSubmit} className="flex flex-col gap-5">
          {initial ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-xs text-muted">
              <StatusBadge value={initial.status} />
              <span>{initial.status === "INVITED" ? `Invited ${initial.invitedAt ? relTime(initial.invitedAt) : relTime(initial.createdAt)}` : initial.lastSeenAt ? `Last seen ${relTime(initial.lastSeenAt)}` : "Has not signed in yet"}</span>
              <span className="ml-auto">Added {fmtDateTime(initial.createdAt)}</span>
            </div>
          ) : null}
          <FormRow>
            <Field label="Full name" required error={form.formState.errors.name?.message}>
              <Input {...form.register("name", { required: "Enter the person's name." })} autoFocus={!initial} placeholder="Jordan Lee" />
            </Field>
            <Field label="Work email" required error={form.formState.errors.email?.message} hint={initial ? "Email cannot change after the invitation." : undefined}>
              <Input type="email" {...form.register("email", { required: "Enter their email." })} disabled={!!initial} placeholder="jordan@spectrumrobotics.ai" />
            </Field>
          </FormRow>
          <FormRow cols={3}>
            <Field label="Access level" hint={readOnlyTier ? "Only owners change this." : isOwner ? "Owners see everything, including costs." : "You can invite employees."}>
              <NativeSelect {...form.register("tier")} disabled={readOnlyTier}>
                {(isOwner ? (["OWNER", "LEADERSHIP", "EMPLOYEE"] as const) : (["EMPLOYEE"] as const)).map((t) => (
                  <option key={t} value={t}>
                    {TIER_LABELS[t]}
                  </option>
                ))}
                {!isOwner && initial && initial.tier !== "EMPLOYEE" ? <option value={initial.tier}>{TIER_LABELS[initial.tier]}</option> : null}
              </NativeSelect>
            </Field>
            <Field label="Role">
              <NativeSelect {...form.register("roleLabel")}>
                {Object.entries(ROLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Department">
              <NativeSelect {...form.register("departmentId")}>
                <option value="">None</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Job title">
              <Input {...form.register("title")} placeholder="Account Executive" />
            </Field>
            <Field label="Manager">
              <Controller control={form.control} name="manager" render={({ field }) => <EntityPicker type="user" value={field.value} onChange={field.onChange} placeholder="Nobody" />} />
            </Field>
          </FormRow>
          <FormRow cols={3}>
            <Field label="Territory" hint="Chicagoland, Illinois, Midwest, Utah, Colorado">
              <Input {...form.register("territory")} placeholder="Chicagoland" />
            </Field>
            <Field label="Phone">
              <Input {...form.register("phone")} placeholder="(630) 555 0100" />
            </Field>
            <Field label="Approval limit %" hint="Discount they may approve alone.">
              <Input type="number" min={0} max={100} {...form.register("approvalLimitPct")} />
            </Field>
          </FormRow>
          <Field label="Booking link" hint="Their scheduling page. Goes in every email signature and outreach draft.">
            <Input {...form.register("bookingLink")} placeholder="https://calendly.com/..." />
          </Field>
          <Field label="Permissions" hint={isOwner ? "Social posting is the 'Publish to social channels' right." : "Only owners change permissions."}>
            <Controller control={form.control} name="perms" render={({ field }) => <PermissionsChecklist tier={tier} value={field.value} onChange={field.onChange} disabled={!isOwner} />} />
          </Field>
          {initial ? (
            <div className="rounded-lg border border-line p-3">
              <div className="mb-2 text-[13px] font-semibold text-ink">Account actions</div>
              <div className="flex flex-wrap gap-2">
                {initial.status === "INVITED" ? (
                  <Button type="button" size="sm" variant="secondary" onClick={resend} disabled={pending}>
                    <Mail /> Resend invitation
                  </Button>
                ) : null}
                {initial.status !== "INACTIVE" ? (
                  <Button type="button" size="sm" variant="secondary" onClick={reset} disabled={pending}>
                    <KeyRound /> Send password reset link
                  </Button>
                ) : null}
                {initial.status === "INACTIVE" ? (
                  <Button type="button" size="sm" variant="secondary" onClick={() => setStatus("ACTIVE")} disabled={pending}>
                    <UserPlus /> Reactivate
                  </Button>
                ) : initial.id !== actor.id ? (
                  <Button type="button" size="sm" variant="ghost" className="text-bad hover:bg-bad-soft" onClick={() => setStatus("INACTIVE")} disabled={pending}>
                    <UserMinus /> Deactivate
                  </Button>
                ) : (
                  <span className="self-center text-xs text-muted">You cannot deactivate yourself.</span>
                )}
              </div>
            </div>
          ) : null}
        </form>
      </FormSheet>
      <LinkDialog link={link} onClose={() => { setLink(null); if (!initial) onClose(); }} />
    </>
  );
}

function LinkDialog({ link, onClose }: { link: { title: string; url: string; delivered: boolean } | null; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy. Select the link and copy it by hand.");
    }
  };
  return (
    <Dialog open={!!link} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{link?.title}</DialogTitle>
          <DialogDescription>{link?.delivered ? "We emailed it too. Share this link if the email does not arrive." : "Email is not set up on this server, so share this link directly."}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="flex items-center gap-2">
            <Input readOnly value={link?.url ?? ""} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
            <Button type="button" variant="secondary" onClick={copy}>
              {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TeamMemberSheetFromUrl({ initial, departments, actor }: { initial?: TeamMemberInitial; departments: TeamDepartment[]; actor: { id: string; tier: Tier } }) {
  const create = useUrlSheet("new");
  const edit = useUrlSheet("edit");
  if (edit.open && initial) return <TeamMemberSheet open onClose={edit.close} initial={initial} departments={departments} actor={actor} />;
  return <TeamMemberSheet open={create.open} onClose={create.close} departments={departments} actor={actor} />;
}
