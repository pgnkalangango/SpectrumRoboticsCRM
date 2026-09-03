"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { Plus, Trash2, BookOpen } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { FormSheet, FormRow, useUrlSheet } from "@/components/hq/form-sheet";
import { EntityPicker, type PickerValue } from "@/components/hq/entity-picker";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { TASK_TYPES } from "@/lib/options";
import { saveTask, deleteTask, type TaskInput } from "@/server/actions/tasks";

export type TaskFormValues = Omit<TaskInput, "checklist"> & { id?: string; assignee?: PickerValue; contact?: PickerValue; company?: PickerValue; deal?: PickerValue; sop?: PickerValue; checklist?: { text: string; done: boolean }[]; sopSlug?: string | null };

export function TaskSheet({ open, onClose, initial, defaults }: { open: boolean; onClose: () => void; initial?: Partial<TaskFormValues>; defaults?: Partial<TaskFormValues> }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const base: Partial<TaskFormValues> = { priority: "MEDIUM", status: "TODO", taskType: "general", assignee: null, contact: null, company: null, deal: null, sop: null, checklist: [], ...defaults };
  const form = useForm<TaskFormValues>({ defaultValues: { ...base, ...initial } });
  React.useEffect(() => {
    if (open) form.reset({ ...base, ...initial });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);
  const checklist = form.watch("checklist") ?? [];
  const [newItem, setNewItem] = React.useState("");

  const onSubmit = form.handleSubmit((v) => {
    start(async () => {
      const r = await saveTask({ ...v, id: initial?.id, assigneeId: v.assignee?.id ?? null, contactId: v.contact?.id ?? null, companyId: v.company?.id ?? null, dealId: v.deal?.id ?? null, sopId: v.sop?.id ?? null, checklist: v.checklist ?? [] });
      if (r.ok) {
        toast.success(initial?.id ? "Task saved" : "Task created");
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  });
  const onDelete = initial?.id
    ? () => {
        if (!confirm("Delete this task?")) return;
        start(async () => {
          const r = await deleteTask(initial.id!);
          if (r.ok) {
            toast.success("Task deleted");
            onClose();
            router.refresh();
          } else toast.error(r.error);
        });
      }
    : undefined;

  return (
    <FormSheet open={open} onOpenChange={(o) => !o && onClose()} title={initial?.id ? "Edit task" : "New task"} formId="task-form" pending={pending} onDelete={onDelete} submitLabel={initial?.id ? "Save" : "Create task"}>
      <form id="task-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="What needs to happen?" required error={form.formState.errors.title?.message}>
          <Input {...form.register("title", { required: "Give the task a title." })} placeholder="Call Joe about the install date" autoFocus />
        </Field>
        <FormRow cols={3}>
          <Field label="Type">
            <NativeSelect {...form.register("taskType")}>
              {TASK_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Priority">
            <NativeSelect {...form.register("priority")}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </NativeSelect>
          </Field>
          <Field label="Due">
            <Input type="datetime-local" {...form.register("dueAt")} />
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Assigned to">
            <Controller control={form.control} name="assignee" render={({ field }) => <EntityPicker type="user" value={field.value ?? null} onChange={field.onChange} placeholder="Me" />} />
          </Field>
          <Field label="Status">
            <NativeSelect {...form.register("status")}>
              <option value="TODO">To do</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="REVIEW">In review</option>
              <option value="DONE">Done</option>
              <option value="CANCELLED">Cancelled</option>
            </NativeSelect>
          </Field>
        </FormRow>
        <Field label="Details">
          <Textarea {...form.register("description")} rows={3} placeholder="Anything the person doing this needs to know." />
        </Field>
        <div className="rounded-lg border border-line p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Related to</div>
          <FormRow cols={3}>
            <Controller control={form.control} name="contact" render={({ field }) => <EntityPicker type="contact" value={field.value ?? null} onChange={field.onChange} placeholder="Contact" />} />
            <Controller control={form.control} name="company" render={({ field }) => <EntityPicker type="company" value={field.value ?? null} onChange={field.onChange} placeholder="Company" />} />
            <Controller control={form.control} name="deal" render={({ field }) => <EntityPicker type="deal" value={field.value ?? null} onChange={field.onChange} placeholder="Deal" />} />
          </FormRow>
        </div>
        <Field label="SOP to follow" hint="Attach the procedure so whoever does this has the steps at hand.">
          <div className="flex items-center gap-2">
            <Controller control={form.control} name="sop" render={({ field }) => <EntityPicker type="sop" value={field.value ?? null} onChange={field.onChange} placeholder="Pick an SOP" className="flex-1" />} />
            {initial?.sopSlug ? (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/hq/sops/${initial.sopSlug}`} target="_blank">
                  <BookOpen /> Open
                </Link>
              </Button>
            ) : null}
          </div>
        </Field>
        <div className="rounded-lg border border-line p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Checklist</div>
          <ul className="flex flex-col gap-1.5">
            {checklist.map((c, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <Checkbox checked={c.done} onCheckedChange={(v) => form.setValue("checklist", checklist.map((x, j) => (j === i ? { ...x, done: !!v } : x)))} />
                <span className={c.done ? "flex-1 text-muted line-through" : "flex-1"}>{c.text}</span>
                <button type="button" className="text-muted hover:text-bad" onClick={() => form.setValue("checklist", checklist.filter((_, j) => j !== i))} aria-label="Remove">
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <Input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="Add a step"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (newItem.trim()) {
                    form.setValue("checklist", [...checklist, { text: newItem.trim(), done: false }]);
                    setNewItem("");
                  }
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={() => {
                if (newItem.trim()) {
                  form.setValue("checklist", [...checklist, { text: newItem.trim(), done: false }]);
                  setNewItem("");
                }
              }}
              aria-label="Add step"
            >
              <Plus />
            </Button>
          </div>
        </div>
      </form>
    </FormSheet>
  );
}

// ?new=1 opens a blank task (with optional contactId/companyId/dealId prefill); ?open=<id> opens an existing one.
export function TaskSheetFromUrl({ tasks, prefill }: { tasks: Record<string, Partial<TaskFormValues>>; prefill?: Partial<TaskFormValues> }) {
  const create = useUrlSheet("new");
  const openSheet = useUrlSheet("open");
  const sp = useSearchParams();
  const defaults: Partial<TaskFormValues> = { ...prefill };
  const contactId = sp.get("contactId");
  const companyId = sp.get("companyId");
  const dealId = sp.get("dealId");
  if (contactId) defaults.contact = { id: contactId, label: sp.get("contactName") ?? "Selected contact" };
  if (companyId) defaults.company = { id: companyId, label: sp.get("companyName") ?? "Selected company" };
  if (dealId) defaults.deal = { id: dealId, label: sp.get("dealName") ?? "Selected deal" };
  if (openSheet.open && openSheet.value && tasks[openSheet.value]) return <TaskSheet open onClose={openSheet.close} initial={tasks[openSheet.value]} />;
  return <TaskSheet open={create.open} onClose={create.close} defaults={defaults} />;
}
