"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { FormSheet, FormRow, useUrlSheet } from "@/components/hq/form-sheet";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/misc";
import { ACTION_DEFS, ASSIGNEE_OPTIONS, DIGEST_REPORTS, TRIGGER_DEFS, describeCron, describeTrigger, type AutomationAction, type Condition, type Trigger, type TriggerType } from "@/lib/automations/triggers";
import { INDUSTRIES, TASK_TYPES } from "@/lib/options";
import { deleteAutomation, saveAutomation } from "@/server/actions/automations";
import type { AutomationRow } from "@/components/hq/automations/automation-list";

export type Option = { value: string; label: string };

const DEFAULT_ACTION: Record<AutomationAction["type"], AutomationAction> = {
  create_task: { type: "create_task", title: "", taskType: "follow_up", assignee: "deal_owner", dueInDays: 0 },
  notify_tier: { type: "notify_tier", tier: "LEADERSHIP", title: "" },
  notify_assignee: { type: "notify_assignee" },
  notify_department: { type: "notify_department", department: "sales", title: "" },
  create_project: { type: "create_project", projectType: "install" },
  create_deal: { type: "create_deal", dealType: "RENEWAL" },
  digest: { type: "digest", to: "LEADERSHIP", report: "pipeline_weekly" },
  slack: { type: "slack", text: "" },
  email: { type: "email", toRole: "LEADERSHIP", subject: "", body: "" },
};

export function AutomationSheet({ open, onClose, initial, users, departments, stages }: { open: boolean; onClose: () => void; initial?: AutomationRow | null; users: Option[]; departments: Option[]; stages: Option[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [enabled, setEnabled] = React.useState(true);
  const [trigger, setTrigger] = React.useState<Trigger>({ type: "quote.unviewed", afterDays: 3 });
  const [daysText, setDaysText] = React.useState("1, 7, 14");
  const [conditions, setConditions] = React.useState<Condition[]>([]);
  const [actions, setActions] = React.useState<AutomationAction[]>([{ ...DEFAULT_ACTION.create_task }]);

  React.useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setEnabled(initial?.enabled ?? true);
    setTrigger(initial?.trigger ?? { type: "quote.unviewed", afterDays: 3 });
    setDaysText((initial?.trigger.days ?? [1, 7, 14]).join(", "));
    setConditions(initial?.conditions ?? []);
    setActions(initial?.actions.length ? initial.actions : [{ ...DEFAULT_ACTION.create_task }]);
  }, [open, initial]);

  const def = TRIGGER_DEFS.find((d) => d.type === trigger.type)!;
  const setTriggerType = (type: TriggerType) => {
    const defaults: Partial<Trigger> = { "quote.unviewed": { afterDays: 3 }, "quote.viewed_no_response": { afterDays: 5 }, "deal.stale": { afterDays: 14 }, "invoice.overdue": { days: [1, 7, 14] }, "robot.maintenance_due": { beforeDays: 14 }, "robot.raas_ending": { beforeDays: 60 }, "ticket.created": {}, "deal.stage_changed": { to: "won" }, schedule: { cron: "0 13 * * 1" } }[type];
    setTrigger({ type, ...defaults });
  };
  const updateAction = (i: number, patch: Partial<AutomationAction>) => setActions((list) => list.map((a, j) => (j === i ? ({ ...a, ...patch } as AutomationAction) : a)));
  const setActionType = (i: number, type: AutomationAction["type"]) => setActions((list) => list.map((a, j) => (j === i ? { ...DEFAULT_ACTION[type] } : a)));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const t: Trigger = { ...trigger, days: trigger.type === "invoice.overdue" ? daysText.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n >= 0) : undefined };
      const r = await saveAutomation({ id: initial?.id, name, description, enabled, trigger: t as unknown as { type: string }, conditions, actions: actions as unknown as { type: string }[] });
      if (r.ok) {
        toast.success(initial ? "Automation saved" : "Automation created");
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  };
  const onDelete = initial
    ? () => {
        if (!confirm(`Delete "${initial.name}"? Its run history goes with it.`)) return;
        start(async () => {
          const r = await deleteAutomation(initial.id);
          if (r.ok) {
            toast.success("Automation deleted");
            onClose();
            router.refresh();
          } else toast.error(r.error);
        });
      }
    : undefined;

  const assigneeOptions: Option[] = [...ASSIGNEE_OPTIONS, ...users.map((u) => ({ value: `user:${u.value}`, label: u.label }))];

  return (
    <FormSheet open={open} onOpenChange={(o) => !o && onClose()} title={initial ? "Edit automation" : "New automation"} description="When something happens, HQ does the follow up for you." formId="automation-form" pending={pending} onDelete={onDelete} width="max-w-2xl">
      <form id="automation-form" onSubmit={onSubmit} className="flex flex-col gap-5">
        <FormRow>
          <Field label="Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Quote not opened after 3 days" required autoFocus />
          </Field>
          <Field label="Turned on">
            <div className="flex h-9 items-center gap-2 text-sm text-ink-2">
              <Switch checked={enabled} onCheckedChange={setEnabled} /> {enabled ? "Runs automatically" : "Paused"}
            </div>
          </Field>
        </FormRow>
        <Field label="Description" hint="What this does, in plain words. Shows in the list.">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </Field>

        <section className="rounded-xl border border-line p-4">
          <h3 className="eyebrow mb-3">When</h3>
          <Field label="Trigger">
            <NativeSelect value={trigger.type} onChange={(e) => setTriggerType(e.target.value as TriggerType)}>
              {TRIGGER_DEFS.map((d) => (
                <option key={d.type} value={d.type}>
                  {d.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <p className="mt-1.5 text-xs text-muted">{def.description}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {def.fields.map((f) => (
              <Field key={f.key} label={f.label} hint={f.kind === "cron" ? describeCron(trigger.cron ?? "") : f.hint}>
                {f.kind === "number" ? (
                  <Input type="number" min={0} value={(trigger[f.key] as number | undefined) ?? ""} onChange={(e) => setTrigger({ ...trigger, [f.key]: Number(e.target.value) })} />
                ) : f.kind === "days" ? (
                  <Input value={daysText} onChange={(e) => setDaysText(e.target.value)} placeholder="1, 7, 14" />
                ) : f.kind === "select" ? (
                  <NativeSelect value={(trigger[f.key] as string | undefined) ?? ""} onChange={(e) => setTrigger({ ...trigger, [f.key]: e.target.value || undefined })}>
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                ) : f.key === "to" && stages.length ? (
                  <NativeSelect value={trigger.to ?? ""} onChange={(e) => setTrigger({ ...trigger, to: e.target.value })}>
                    <option value="">Pick a stage</option>
                    {stages.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </NativeSelect>
                ) : (
                  <Input value={(trigger[f.key] as string | undefined) ?? ""} onChange={(e) => setTrigger({ ...trigger, [f.key]: e.target.value })} placeholder={f.kind === "cron" ? "0 13 * * 1" : ""} className={f.kind === "cron" ? "font-mono" : undefined} />
                )}
              </Field>
            ))}
          </div>
          <p className="mt-3 rounded-md bg-surface-2 px-2.5 py-1.5 text-xs text-ink-2">{describeTrigger({ ...trigger, days: trigger.type === "invoice.overdue" ? daysText.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n)) : trigger.days })}</p>
        </section>

        <section className="rounded-xl border border-line p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="eyebrow">Only when (optional)</h3>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConditions([...conditions, { field: "owner", value: users[0]?.value ?? "" }])}>
              <Plus /> Add condition
            </Button>
          </div>
          {conditions.length === 0 ? <p className="text-xs text-muted">No conditions. The automation applies to every matching record.</p> : null}
          <div className="flex flex-col gap-2">
            {conditions.map((c, i) => (
              <div key={i} className="grid items-center gap-2 sm:grid-cols-[160px_1fr_auto]">
                <NativeSelect value={c.field} onChange={(e) => setConditions(conditions.map((x, j) => (j === i ? { field: e.target.value as Condition["field"], value: "" } : x)))}>
                  <option value="owner">Owner is</option>
                  <option value="industry">Company industry is</option>
                </NativeSelect>
                <NativeSelect value={c.value} onChange={(e) => setConditions(conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}>
                  <option value="">Choose</option>
                  {(c.field === "owner" ? users : INDUSTRIES).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </NativeSelect>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => setConditions(conditions.filter((_, j) => j !== i))} aria-label="Remove condition">
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-line p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="eyebrow">Then</h3>
            <Button type="button" variant="ghost" size="sm" onClick={() => setActions([...actions, { ...DEFAULT_ACTION.notify_tier }])}>
              <Plus /> Add action
            </Button>
          </div>
          <ol className="flex flex-col gap-3">
            {actions.map((a, i) => (
              <li key={i} className="rounded-lg border border-line bg-surface-2/40 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex size-5 items-center justify-center rounded-full bg-brand-tint text-[11px] font-bold text-brand-deep dark:text-brand-bright">{i + 1}</span>
                  <NativeSelect value={a.type} onChange={(e) => setActionType(i, e.target.value as AutomationAction["type"])} className="flex-1">
                    {ACTION_DEFS.map((d) => (
                      <option key={d.type} value={d.type}>
                        {d.label}
                      </option>
                    ))}
                  </NativeSelect>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => setActions(actions.filter((_, j) => j !== i))} aria-label="Remove action" disabled={actions.length === 1}>
                    <Trash2 />
                  </Button>
                </div>
                <ActionFields action={a} onChange={(patch) => updateAction(i, patch)} assignees={assigneeOptions} departments={departments} />
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[11px] text-muted">Titles and messages can use {"{{entity}}"}, {"{{company}}"} and {"{{link}}"}.</p>
        </section>
      </form>
    </FormSheet>
  );
}

function ActionFields({ action, onChange, assignees, departments }: { action: AutomationAction; onChange: (patch: Partial<AutomationAction>) => void; assignees: Option[]; departments: Option[] }) {
  const set = (patch: Record<string, unknown>) => onChange(patch as Partial<AutomationAction>);
  switch (action.type) {
    case "create_task":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Task title" className="sm:col-span-2">
            <Input value={action.title} onChange={(e) => set({ title: e.target.value })} placeholder="Follow up: quote not opened yet" />
          </Field>
          <Field label="Assign to">
            <NativeSelect value={action.assignee ?? "deal_owner"} onChange={(e) => set({ assignee: e.target.value })}>
              {assignees.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Task type">
            <NativeSelect value={action.taskType ?? "follow_up"} onChange={(e) => set({ taskType: e.target.value })}>
              {TASK_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Due in days" hint="0 means today">
            <Input type="number" min={0} value={action.dueInDays ?? 0} onChange={(e) => set({ dueInDays: Number(e.target.value) })} />
          </Field>
          <Field label="SOP slug" hint="Links the SOP to the task">
            <Input value={action.sop ?? ""} onChange={(e) => set({ sop: e.target.value })} placeholder="admin-new-customer-setup" />
          </Field>
        </div>
      );
    case "notify_tier":
      return (
        <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
          <Field label="Who">
            <NativeSelect value={action.tier} onChange={(e) => set({ tier: e.target.value })}>
              <option value="OWNER">Owners</option>
              <option value="LEADERSHIP">Leadership</option>
            </NativeSelect>
          </Field>
          <Field label="Title">
            <Input value={action.title} onChange={(e) => set({ title: e.target.value })} placeholder="Critical ticket opened" />
          </Field>
        </div>
      );
    case "notify_assignee":
      return (
        <Field label="Title (optional)">
          <Input value={action.title ?? ""} onChange={(e) => set({ title: e.target.value })} placeholder="Defaults to the automation name" />
        </Field>
      );
    case "notify_department":
      return (
        <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
          <Field label="Department">
            <NativeSelect value={action.department} onChange={(e) => set({ department: e.target.value })}>
              {departments.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Title">
            <Input value={action.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
        </div>
      );
    case "create_project":
      return (
        <Field label="Project type">
          <NativeSelect value={action.projectType} onChange={(e) => set({ projectType: e.target.value })}>
            <option value="install">Install</option>
            <option value="pilot">Pilot</option>
            <option value="custom">Custom</option>
            <option value="general">General</option>
          </NativeSelect>
        </Field>
      );
    case "create_deal":
      return (
        <Field label="Deal type">
          <NativeSelect value={action.dealType} onChange={(e) => set({ dealType: e.target.value })}>
            <option value="RENEWAL">Renewal</option>
            <option value="UPSELL">Upsell</option>
            <option value="NEW_BUSINESS">New business</option>
          </NativeSelect>
        </Field>
      );
    case "digest":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Send to" hint="OWNER, LEADERSHIP, a department slug or an email">
            <Input value={action.to} onChange={(e) => set({ to: e.target.value })} />
          </Field>
          <Field label="Report">
            <NativeSelect value={action.report} onChange={(e) => set({ report: e.target.value })}>
              {DIGEST_REPORTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      );
    case "slack":
      return (
        <Field label="Message" hint="Posts to the channel behind SLACK_WEBHOOK_URL">
          <Textarea value={action.text} onChange={(e) => set({ text: e.target.value })} rows={2} placeholder="{{entity}} needs attention: {{link}}" />
        </Field>
      );
    case "email":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Send to" hint="OWNER, LEADERSHIP, a department slug or an email">
            <Input value={action.toRole} onChange={(e) => set({ toRole: e.target.value })} />
          </Field>
          <Field label="Subject">
            <Input value={action.subject} onChange={(e) => set({ subject: e.target.value })} />
          </Field>
          <Field label="Body" className="sm:col-span-2">
            <Textarea value={action.body} onChange={(e) => set({ body: e.target.value })} rows={3} />
          </Field>
        </div>
      );
    default:
      return null;
  }
}

export function AutomationSheetFromUrl({ items, users, departments, stages }: { items: AutomationRow[]; users: Option[]; departments: Option[]; stages: Option[] }) {
  const create = useUrlSheet("new");
  const edit = useUrlSheet("edit");
  const initial = edit.value ? items.find((a) => a.id === edit.value) ?? null : null;
  if (edit.open && initial) return <AutomationSheet open onClose={edit.close} initial={initial} users={users} departments={departments} stages={stages} />;
  return <AutomationSheet open={create.open} onClose={create.close} users={users} departments={departments} stages={stages} />;
}
