"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { FormSheet, FormRow, useUrlSheet } from "@/components/hq/form-sheet";
import { EntityPicker, type PickerValue } from "@/components/hq/entity-picker";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { TICKET_CATEGORIES } from "@/lib/options";
import { TICKET_PRIORITIES } from "@/components/hq/service/constants";
import { saveTicket, deleteTicket, type TicketInput } from "@/server/actions/service";

export type TicketFormValues = Omit<TicketInput, "companyId" | "siteId" | "robotUnitId" | "contactId" | "assigneeId"> & { id?: string; company?: PickerValue; site?: PickerValue; robot?: PickerValue; contact?: PickerValue; assignee?: PickerValue };

const SLA_HINT: Record<string, string> = { LOW: "First response within 7 days", NORMAL: "First response within 3 days", HIGH: "First response within 24 hours", CRITICAL: "First response within 4 hours. Owners are notified." };

export function TicketSheet({ open, onClose, initial, defaults }: { open: boolean; onClose: () => void; initial?: Partial<TicketFormValues>; defaults?: Partial<TicketFormValues> }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const base: Partial<TicketFormValues> = { category: "other", priority: "NORMAL", clientVisible: true, company: null, site: null, robot: null, contact: null, assignee: null, ...defaults };
  const form = useForm<TicketFormValues>({ defaultValues: { ...base, ...initial } });
  React.useEffect(() => {
    if (open) form.reset({ ...base, ...initial });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);
  const company = form.watch("company");
  const priority = form.watch("priority");

  const onSubmit = form.handleSubmit((v) => {
    start(async () => {
      const r = await saveTicket({ ...v, id: initial?.id, companyId: v.company?.id ?? null, siteId: v.site?.id ?? null, robotUnitId: v.robot?.id ?? null, contactId: v.contact?.id ?? null, assigneeId: v.assignee?.id ?? null });
      if (r.ok) {
        toast.success(initial?.id ? "Ticket saved" : "Ticket opened");
        onClose();
        if (!initial?.id && r.data) router.push(`/hq/service/tickets/${r.data.id}`);
        else router.refresh();
      } else toast.error(r.error);
    });
  });
  const onDelete = initial?.id
    ? () => {
        if (!confirm("Delete this ticket and its comments? Closing it is usually the better choice.")) return;
        start(async () => {
          const r = await deleteTicket(initial.id!);
          if (r.ok) {
            toast.success("Ticket deleted");
            onClose();
            router.push("/hq/service/tickets");
          } else toast.error(r.error);
        });
      }
    : undefined;

  return (
    <FormSheet open={open} onOpenChange={(o) => !o && onClose()} title={initial?.id ? "Edit ticket" : "New ticket"} description="A support request from a customer or something the team spotted. The SLA clock starts when it is opened." formId="ticket-form" pending={pending} onDelete={onDelete} submitLabel={initial?.id ? "Save ticket" : "Open ticket"}>
      <form id="ticket-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Subject" required error={form.formState.errors.subject?.message}>
          <Input {...form.register("subject", { required: "What is the problem? Give it a subject." })} placeholder="BellaBot stops at the bar entrance" autoFocus />
        </Field>
        <Field label="What is happening?">
          <Textarea {...form.register("description")} rows={4} placeholder="What the customer sees, when it started, what has been tried." />
        </Field>
        <FormRow>
          <Field label="Category">
            <NativeSelect {...form.register("category")}>
              {TICKET_CATEGORIES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Priority" hint={SLA_HINT[priority ?? "NORMAL"]}>
            <NativeSelect {...form.register("priority")}>
              {TICKET_PRIORITIES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </FormRow>
        <div className="rounded-lg border border-line p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Who and where</div>
          <div className="flex flex-col gap-3">
            <Field label="Company">
              <Controller
                control={form.control}
                name="company"
                render={({ field }) => (
                  <EntityPicker
                    type="company"
                    value={field.value ?? null}
                    onChange={(v) => {
                      field.onChange(v);
                      form.setValue("site", null);
                      form.setValue("robot", null);
                      form.setValue("contact", null);
                    }}
                  />
                )}
              />
            </Field>
            <FormRow>
              <Field label="Site">
                <Controller control={form.control} name="site" render={({ field }) => <EntityPicker type="site" value={field.value ?? null} onChange={field.onChange} companyId={company?.id} />} />
              </Field>
              <Field label="Robot">
                <Controller control={form.control} name="robot" render={({ field }) => <EntityPicker type="robot" value={field.value ?? null} onChange={field.onChange} companyId={company?.id} />} />
              </Field>
            </FormRow>
            <FormRow>
              <Field label="Customer contact">
                <Controller control={form.control} name="contact" render={({ field }) => <EntityPicker type="contact" value={field.value ?? null} onChange={field.onChange} companyId={company?.id} />} />
              </Field>
              <Field label="Assigned to">
                <Controller control={form.control} name="assignee" render={({ field }) => <EntityPicker type="user" value={field.value ?? null} onChange={field.onChange} placeholder="Unassigned" />} />
              </Field>
            </FormRow>
          </div>
        </div>
        <Controller
          control={form.control}
          name="clientVisible"
          render={({ field }) => (
            <label className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5 text-sm">
              <span>
                <span className="font-medium">Visible to the client</span>
                <span className="block text-xs text-muted">The customer can follow this ticket in their portal. Internal notes stay hidden either way.</span>
              </span>
              <Switch checked={field.value !== false} onCheckedChange={field.onChange} />
            </label>
          )}
        />
      </form>
    </FormSheet>
  );
}

// ?new=1 opens a blank ticket (companyId, siteId, robotId prefill from the query); ?edit=1 edits the given record.
export function TicketSheetFromUrl({ initial, prefill }: { initial?: Partial<TicketFormValues>; prefill?: Partial<TicketFormValues> }) {
  const create = useUrlSheet("new");
  const edit = useUrlSheet("edit");
  const sp = useSearchParams();
  const defaults: Partial<TicketFormValues> = { ...prefill };
  const companyId = sp.get("companyId");
  const siteId = sp.get("siteId");
  const robotId = sp.get("robotId");
  const contactId = sp.get("contactId");
  if (companyId && !defaults.company) defaults.company = { id: companyId, label: sp.get("companyName") ?? "Selected company" };
  if (siteId && !defaults.site) defaults.site = { id: siteId, label: sp.get("siteName") ?? "Selected site" };
  if (robotId && !defaults.robot) defaults.robot = { id: robotId, label: sp.get("robotName") ?? "Selected robot" };
  if (contactId && !defaults.contact) defaults.contact = { id: contactId, label: sp.get("contactName") ?? "Selected contact" };
  if (edit.open && initial) return <TicketSheet open onClose={edit.close} initial={initial} />;
  return <TicketSheet open={create.open} onClose={create.close} defaults={defaults} />;
}
