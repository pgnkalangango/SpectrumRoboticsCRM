"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { CalendarClock, Copy, ExternalLink, Palette, Send, ShieldCheck, Undo2, XCircle } from "lucide-react";
import { FormSheet, FormRow, useUrlSheet } from "@/components/hq/form-sheet";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { cn, fmtDateTime, relTime } from "@/lib/utils";
import { ClaimsPanel, useClaims } from "@/components/hq/marketing/claims-panel";
import { PROVIDER_META, POST_STATUS_LABEL, ProviderChip, toLocalInput, type AccountOption, type HistoryRow, type PostRow } from "@/components/hq/marketing/shared";
import { approvePost, deletePost, duplicatePost, publishPostNow, rejectPost, savePost, schedulePost, submitPostForApproval, unschedulePost } from "@/server/actions/marketing";

type FormValues = { title: string; body: string; linkUrl: string; mediaText: string; scheduledAt: string; campaignId: string; targetIds: string[]; notes: string };

const HISTORY_LABEL: Record<string, string> = { create: "Drafted", update: "Edited", submit_for_approval: "Submitted for approval", approve: "Approved", approve_and_schedule: "Approved and scheduled", reject: "Sent back for changes", schedule: "Scheduled", reschedule: "Rescheduled", unschedule: "Unscheduled", publish: "Published", publish_failed: "Publishing failed", duplicate: "Duplicated", delete: "Deleted" };

export function PostSheet({ open, onClose, initial, history, accounts, campaigns, knownCompanies, canPost, canDraft, requireApproval, currentUserId, defaultDate }: { open: boolean; onClose: () => void; initial?: PostRow | null; history?: HistoryRow[]; accounts: AccountOption[]; campaigns: { id: string; name: string }[]; knownCompanies: string[]; canPost: boolean; canDraft: boolean; requireApproval: boolean; currentUserId: string; defaultDate?: string | null }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [override, setOverride] = React.useState(false);
  const base: FormValues = { title: "", body: "", linkUrl: "", mediaText: "", scheduledAt: defaultDate ? `${defaultDate}T09:00` : "", campaignId: "", targetIds: accounts.length === 1 ? [accounts[0].id] : [], notes: "" };
  const fromInitial = (p: PostRow): FormValues => ({ title: p.title ?? "", body: p.body, linkUrl: p.linkUrl ?? "", mediaText: p.mediaUrls.join(", "), scheduledAt: toLocalInput(p.scheduledAt), campaignId: p.campaignId ?? "", targetIds: p.targets.map((t) => t.accountId), notes: p.notes ?? "" });
  const form = useForm<FormValues>({ defaultValues: initial ? fromInitial(initial) : base });
  React.useEffect(() => {
    if (open) {
      form.reset(initial ? fromInitial(initial) : base);
      setOverride(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  const body = form.watch("body");
  const title = form.watch("title");
  const notes = form.watch("notes");
  const targetIds = form.watch("targetIds") ?? [];
  const scheduledAt = form.watch("scheduledAt");
  const claims = useClaims(body, `${title}\n${notes}`, knownCompanies);

  const status = initial?.status ?? "DRAFT";
  const isMine = !initial || initial.authorId === currentUserId;
  const locked = status === "PUBLISHED" || status === "PUBLISHING";
  const editable = !locked && (canPost || (isMine && ["DRAFT", "FAILED", "PENDING_APPROVAL"].includes(status)));
  const selectedProviders = [...new Set(accounts.filter((a) => targetIds.includes(a.id)).map((a) => a.provider))];
  const bodyLength = body?.length ?? 0;
  const overLimit = selectedProviders.some((p) => bodyLength > (PROVIDER_META[p]?.limit ?? Infinity));

  const persist = async (): Promise<string | null> => {
    const v = form.getValues();
    if (!v.body.trim()) {
      form.setError("body", { message: "Write the post first." });
      return null;
    }
    if (overLimit) {
      toast.error("The post is longer than one of the selected channels allows.");
      return null;
    }
    const r = await savePost({ id: initial?.id, title: v.title || null, body: v.body, linkUrl: v.linkUrl || null, mediaUrls: v.mediaText.split(",").map((s) => s.trim()).filter(Boolean), scheduledAt: v.scheduledAt ? new Date(v.scheduledAt).toISOString() : null, campaignId: v.campaignId || null, targetAccountIds: v.targetIds, notes: v.notes || null });
    if (!r.ok) {
      toast.error(r.error);
      return null;
    }
    return r.data?.id ?? null;
  };

  const finish = (message: string, id?: string | null, keepOpen = false) => {
    toast.success(message);
    if (keepOpen && id) router.replace(`/hq/marketing?open=${id}`, { scroll: false });
    else onClose();
    router.refresh();
  };

  const run = (fn: () => Promise<void>) => start(fn);

  const onSaveDraft = form.handleSubmit(() =>
    run(async () => {
      const id = await persist();
      if (id) finish(initial ? "Post saved" : "Draft saved");
    }),
  );
  const onSubmitForApproval = () =>
    run(async () => {
      const id = await persist();
      if (!id) return;
      const r = await submitPostForApproval(id);
      if (r.ok) finish("Sent for approval. Approvers have been notified.");
      else toast.error(r.error);
    });
  const onSchedule = (label = "Scheduled") =>
    run(async () => {
      const when = form.getValues("scheduledAt");
      if (!when) {
        toast.error("Pick a date and time first.");
        return;
      }
      const id = await persist();
      if (!id) return;
      const r = status === "PENDING_APPROVAL" ? await approvePost(id, { scheduledAt: new Date(when).toISOString(), overrideClaims: override }) : await schedulePost(id, new Date(when).toISOString(), { overrideClaims: override });
      if (r.ok) finish(`${label} for ${fmtDateTime(when)}`);
      else toast.error(r.error);
    });
  const onApproveOnly = () =>
    run(async () => {
      const id = await persist();
      if (!id) return;
      const r = await approvePost(id, { overrideClaims: override });
      if (r.ok) finish("Approved. Schedule it or publish when ready.", id, true);
      else toast.error(r.error);
    });
  const onReject = () => {
    const note = prompt("What needs to change? The author will see this note.");
    if (note === null) return;
    run(async () => {
      const r = await rejectPost(initial!.id, note);
      if (r.ok) finish("Sent back to the author");
      else toast.error(r.error);
    });
  };
  const onPublishNow = () => {
    if (!confirm("Publish this post to the selected channels now?")) return;
    run(async () => {
      const id = locked ? initial!.id : await persist();
      if (!id) return;
      const r = await publishPostNow(id, { overrideClaims: override });
      if (r.ok) finish(`Published to ${r.data?.published ?? 0} channel${r.data?.published === 1 ? "" : "s"}`);
      else toast.error(r.error);
    });
  };
  const onUnschedule = () =>
    run(async () => {
      const r = await unschedulePost(initial!.id);
      if (r.ok) finish("Unscheduled. The post is approved and waiting.", initial!.id, true);
      else toast.error(r.error);
    });
  const onDuplicate = () =>
    run(async () => {
      const r = await duplicatePost(initial!.id);
      if (r.ok) finish("Copy created as a draft", r.data?.id, true);
      else toast.error(r.error);
    });
  const onDelete = initial && !locked && (canPost || isMine)
    ? () => {
        if (!confirm("Delete this post? This cannot be undone.")) return;
        run(async () => {
          const r = await deletePost(initial.id);
          if (r.ok) finish("Post deleted");
          else toast.error(r.error);
        });
      }
    : undefined;

  const sheetTitle = !initial ? "New post" : `${POST_STATUS_LABEL[status] ?? status}${initial.title ? `: ${initial.title}` : ""}`;
  const description = !initial ? "Write once, pick the channels, schedule or send for approval." : `Drafted by ${initial.authorName ?? "someone"} ${relTime(initial.createdAt)}${initial.approvedByName ? ` · approved by ${initial.approvedByName}` : ""}`;

  // Footer: one primary action, the rest secondary.
  const footer = (
    <>
      {initial ? (
        <Button type="button" variant="ghost" size="sm" onClick={onDuplicate} disabled={pending} title="Duplicate as a new draft">
          <Copy /> Duplicate
        </Button>
      ) : null}
      {editable && !canPost && status !== "PENDING_APPROVAL" ? (
        <Button type="button" variant="secondary" onClick={onSubmitForApproval} disabled={pending || targetIds.length === 0}>
          <Send /> Submit for approval
        </Button>
      ) : null}
      {editable && canPost && requireApproval && status === "DRAFT" && !initial ? null : null}
      {canPost && status === "PENDING_APPROVAL" ? (
        <>
          <Button type="button" variant="ghost" onClick={onReject} disabled={pending}>
            <XCircle /> Send back
          </Button>
          <Button type="button" variant="secondary" onClick={onApproveOnly} disabled={pending}>
            <ShieldCheck /> Approve
          </Button>
          <Button type="button" onClick={() => onSchedule("Approved and scheduled")} disabled={pending || !scheduledAt || targetIds.length === 0}>
            <CalendarClock /> Approve and schedule
          </Button>
        </>
      ) : null}
      {canPost && status === "SCHEDULED" ? (
        <Button type="button" variant="ghost" onClick={onUnschedule} disabled={pending}>
          <Undo2 /> Unschedule
        </Button>
      ) : null}
      {canPost && !locked && status !== "PENDING_APPROVAL" ? (
        <Button type="button" variant={status === "SCHEDULED" ? "default" : "secondary"} onClick={() => onSchedule(status === "SCHEDULED" ? "Rescheduled" : "Scheduled")} disabled={pending || !scheduledAt || targetIds.length === 0}>
          <CalendarClock /> {status === "SCHEDULED" ? "Reschedule" : "Schedule"}
        </Button>
      ) : null}
      {canPost && !locked ? (
        <Button type="button" variant={status === "FAILED" || status === "APPROVED" ? "default" : "secondary"} onClick={onPublishNow} disabled={pending || targetIds.length === 0}>
          <Send /> {status === "FAILED" ? "Retry publishing" : "Publish now"}
        </Button>
      ) : null}
    </>
  );

  return (
    <FormSheet open={open} onOpenChange={(o) => !o && onClose()} title={sheetTitle} description={description} formId="post-form" pending={pending} width="max-w-3xl" submitLabel={locked ? "Close" : initial ? "Save changes" : "Save draft"} footer={footer} onDelete={onDelete} deleteLabel="Delete">
      <form
        id="post-form"
        onSubmit={locked ? (e) => { e.preventDefault(); onClose(); } : onSaveDraft}
        className="grid gap-5 lg:grid-cols-[1fr_280px]"
      >
        <div className="flex flex-col gap-4">
          {locked && initial ? <PublishedSummary post={initial} /> : null}
          <fieldset disabled={!editable} className="flex flex-col gap-4 disabled:opacity-80">
            <Field label="Internal title" hint="Only the team sees this. Helps you find the post in the calendar.">
              <Input {...form.register("title")} placeholder="BellaBot at the new Aurora site" autoFocus={!initial} />
            </Field>
            <Field label="Post" required error={form.formState.errors.body?.message}>
              <Textarea {...form.register("body", { required: "Write the post first." })} rows={9} placeholder="Say what happened, what it means for the reader, and one clear next step. Pricing reads from $X. No demo promises, no guarantees." className="min-h-[180px] text-[14px] leading-relaxed" />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                {selectedProviders.length === 0 ? (
                  <span className="text-muted">{bodyLength} characters · pick a channel to see its limit</span>
                ) : (
                  selectedProviders.map((p) => {
                    const limit = PROVIDER_META[p]?.limit ?? 0;
                    const over = bodyLength > limit;
                    return (
                      <span key={p} className={cn("tabular", over ? "font-semibold text-bad" : bodyLength > limit * 0.9 ? "text-warn" : "text-muted")}>
                        {PROVIDER_META[p]?.label}: {bodyLength.toLocaleString()} / {limit.toLocaleString()}
                      </span>
                    );
                  })
                )}
              </div>
            </Field>
            <FormRow>
              <Field label="Link" hint="Opens from the post. LinkedIn shows it as an article card.">
                <Input {...form.register("linkUrl")} placeholder="https://spectrumrobotics.ai/..." />
              </Field>
              <Field label="Media URLs" hint="Comma separated image links. Instagram needs one.">
                <div className="flex gap-1.5">
                  <Input {...form.register("mediaText")} placeholder="https://.../photo.jpg" />
                  <Button asChild type="button" variant="secondary" size="icon" title="Pick from Canva through the MCP gateway">
                    <Link href="/hq/mcp?server=canva">
                      <Palette />
                    </Link>
                  </Button>
                </div>
              </Field>
            </FormRow>
            <p className="-mt-2 text-[11px] text-muted">Canva designs are exported through the MCP gateway. Export the design there, then paste the image link here.</p>
            <FormRow>
              <Field label="Schedule for" hint={requireApproval && !canPost ? "The approver confirms the time." : "Leave empty to keep it as a draft."}>
                <Input type="datetime-local" {...form.register("scheduledAt")} />
              </Field>
              <Field label="Campaign">
                <NativeSelect {...form.register("campaignId")}>
                  <option value="">No campaign</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </FormRow>
            <Field label="Notes for the approver" hint='Write "permission" here once a named customer has agreed to be mentioned.'>
              <Textarea {...form.register("notes")} rows={2} />
            </Field>
          </fieldset>
          {initial ? <HistoryAndTargets post={initial} history={history ?? []} /> : null}
        </div>
        <div className="flex flex-col gap-4">
          <Field label="Channels" required>
            {accounts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line bg-surface-2/60 p-3 text-xs text-muted">
                No social accounts are connected yet. An owner can connect LinkedIn, Facebook and Instagram from{" "}
                <Link href="/hq/integrations" className="font-semibold text-brand hover:underline">
                  Integrations
                </Link>
                . You can still save drafts.
              </div>
            ) : (
              <Controller
                control={form.control}
                name="targetIds"
                render={({ field }) => (
                  <ul className="flex flex-col gap-1.5">
                    {accounts.map((a) => {
                      const checked = (field.value ?? []).includes(a.id);
                      return (
                        <li key={a.id}>
                          <label className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 text-sm transition-colors", checked ? "border-brand/50 bg-brand-mist dark:bg-brand-tint/40" : "border-line hover:bg-surface-2", !editable && "cursor-default")}>
                            <Checkbox checked={checked} disabled={!editable} onCheckedChange={(v) => field.onChange(v === true ? [...(field.value ?? []), a.id] : (field.value ?? []).filter((id) => id !== a.id))} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-ink">{a.name}</span>
                              <span className="block truncate text-[11px] text-muted">
                                {PROVIDER_META[a.provider]?.label ?? a.provider}
                                {a.handle ? ` · @${a.handle}` : ""}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              />
            )}
          </Field>
          <ClaimsPanel result={claims} canOverride={canPost && !locked} override={override} onOverride={setOverride} />
          {!canDraft ? <p className="text-xs text-muted">You can view posts but not draft them. Ask an owner for the social drafting permission.</p> : null}
        </div>
      </form>
    </FormSheet>
  );
}

function PublishedSummary({ post }: { post: PostRow }) {
  return (
    <div className="rounded-xl border border-ok/30 bg-ok-soft/50 p-3 text-sm">
      <div className="font-semibold text-ink">{post.status === "PUBLISHED" ? `Published ${post.publishedAt ? relTime(post.publishedAt) : ""}` : "Publishing now"}</div>
      <p className="mt-0.5 text-xs text-ink-2">Published posts stay on record and cannot be edited here. Duplicate to post again.</p>
    </div>
  );
}

function HistoryAndTargets({ post, history }: { post: PostRow; history: HistoryRow[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <section>
        <h3 className="eyebrow mb-2">Channels and results</h3>
        {post.targets.length === 0 ? (
          <p className="text-xs text-muted">No channels selected.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {post.targets.map((t) => (
              <li key={t.id} className="rounded-lg border border-line px-2.5 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <ProviderChip provider={t.provider} name={t.accountName} />
                  <StatusBadge value={t.status === "published" ? "PUBLISHED" : t.status === "failed" ? "FAILED" : "PENDING"} labelOverride={t.status === "pending" ? "Waiting" : undefined} />
                </div>
                {t.publishedAt ? <div className="mt-1 text-muted">Posted {fmtDateTime(t.publishedAt)}</div> : null}
                {t.externalUrl ? (
                  <a href={t.externalUrl} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 font-semibold text-brand hover:underline">
                    Open on {PROVIDER_META[t.provider]?.label ?? t.provider} <ExternalLink className="size-3" />
                  </a>
                ) : null}
                {t.error ? <div className="mt-1 text-bad">{t.error}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="eyebrow mb-2">Status history</h3>
        <ol className="relative ml-1.5 flex flex-col gap-2 border-l border-line pl-3">
          {history.length === 0 ? <li className="text-xs text-muted">No history yet.</li> : null}
          {history.map((h) => (
            <li key={h.id} className="text-xs">
              <span className="absolute -left-[5px] mt-1.5 size-2 rounded-full bg-line-strong ring-2 ring-surface" />
              <div className="font-semibold text-ink">{HISTORY_LABEL[h.action] ?? h.action.replace(/_/g, " ")}</div>
              <div className="text-muted">
                {h.actor} · {fmtDateTime(h.at)}
              </div>
              {h.note ? <div className="mt-0.5 text-ink-2">{h.note}</div> : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export function PostSheetFromUrl(props: { detail?: PostRow | null; history?: HistoryRow[]; accounts: AccountOption[]; campaigns: { id: string; name: string }[]; knownCompanies: string[]; canPost: boolean; canDraft: boolean; requireApproval: boolean; currentUserId: string }) {
  const create = useUrlSheet("new");
  const openSheet = useUrlSheet("open");
  const sp = useSearchParams();
  const date = sp.get("date");
  if (openSheet.open && props.detail) return <PostSheet open onClose={openSheet.close} initial={props.detail} {...props} />;
  if (openSheet.open && !props.detail) return null;
  return <PostSheet open={create.open && props.canDraft} onClose={create.close} defaultDate={date} {...props} />;
}
