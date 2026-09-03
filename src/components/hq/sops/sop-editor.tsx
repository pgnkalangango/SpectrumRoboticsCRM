"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { ArrowDown, ArrowUp, Archive, Copy, Eye, Pencil, Plus, Send, Trash2, Columns2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch, Checkbox } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { Breadcrumbs, Panel } from "@/components/hq/record";
import { SopMarkdown } from "@/components/hq/sops/sop-markdown";
import { APPLIES_TO_OPTIONS, SOP_CATEGORIES, type QuizQuestion, type SopStep } from "@/components/hq/sops/constants";
import { saveSop, publishSop, archiveSop, unarchiveSop, duplicateSop, type SopInput } from "@/server/actions/sops";

export type EditorDepartment = { id: string; name: string; color: string };
export type EditorInitial = {
  id: string;
  slug: string;
  title: string;
  code: string | null;
  departmentId: string | null;
  category: string;
  scope: "COMPANY" | "DEPARTMENT";
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  version: number;
  summary: string | null;
  body: string;
  steps: SopStep[];
  keywords: string[];
  tags: string[];
  appliesTo: string[];
  requiresAcknowledgment: boolean;
  enforcedBySystem: string | null;
  reviewDate: string | null;
  quiz: QuizQuestion[];
};

type FormValues = {
  title: string;
  code: string;
  departmentId: string;
  category: string;
  scope: "COMPANY" | "DEPARTMENT";
  summary: string;
  body: string;
  steps: { title: string; detail: string; required: boolean }[];
  keywordsText: string;
  tagsText: string;
  appliesTo: string[];
  requiresAcknowledgment: boolean;
  enforcedBySystem: string;
  reviewDate: string;
  quiz: { question: string; options: string[]; answerIndex: number }[];
  changeNote: string;
};

const TEMPLATE = `## Why we do this
One or two sentences on the outcome this protects.

## Who does it
Role, and when it happens.

## Steps
1. First thing to do
2. Second thing to do

## What good looks like
- Measurable result
- What to check before you call it done
`;

export function SopEditor({ initial, departments }: { initial?: EditorInitial; departments: EditorDepartment[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [mode, setMode] = React.useState<"write" | "preview" | "split">("write");
  const form = useForm<FormValues>({
    defaultValues: {
      title: initial?.title ?? "",
      code: initial?.code ?? "",
      departmentId: initial?.departmentId ?? "",
      category: initial?.category ?? "procedure",
      scope: initial?.scope ?? "DEPARTMENT",
      summary: initial?.summary ?? "",
      body: initial?.body ?? TEMPLATE,
      steps: (initial?.steps ?? []).map((s) => ({ title: s.title, detail: s.detail ?? "", required: s.required !== false })),
      keywordsText: initial?.keywords.join(", ") ?? "",
      tagsText: initial?.tags.join(", ") ?? "",
      appliesTo: initial?.appliesTo ?? [],
      requiresAcknowledgment: initial?.requiresAcknowledgment ?? false,
      enforcedBySystem: initial?.enforcedBySystem ?? "",
      reviewDate: initial?.reviewDate ? initial.reviewDate.slice(0, 10) : "",
      quiz: (initial?.quiz ?? []).map((q) => ({ question: q.question, options: [...q.options], answerIndex: q.answerIndex })),
      changeNote: "",
    },
  });
  const steps = useFieldArray({ control: form.control, name: "steps" });
  const quiz = useFieldArray({ control: form.control, name: "quiz" });
  const body = form.watch("body");
  const scope = form.watch("scope");
  const requiresAck = form.watch("requiresAcknowledgment");
  const watchedSteps = form.watch("steps");
  const published = initial?.status === "PUBLISHED";
  const contentChanged = !!initial && (body !== initial.body || JSON.stringify(watchedSteps.map((s) => ({ title: s.title, detail: s.detail, required: s.required }))) !== JSON.stringify(initial.steps.map((s) => ({ title: s.title, detail: s.detail ?? "", required: s.required !== false }))));

  const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  const submit = form.handleSubmit((v) => {
    if (published && contentChanged && !v.changeNote.trim()) {
      form.setError("changeNote", { message: "Say what changed. Everyone who acknowledged the old version will be asked again." });
      return;
    }
    start(async () => {
      const r = await saveSop({
        id: initial?.id,
        title: v.title,
        code: v.code || null,
        departmentId: v.departmentId || null,
        category: v.category as SopInput["category"],
        scope: v.scope,
        summary: v.summary,
        body: v.body,
        steps: v.steps,
        keywords: split(v.keywordsText),
        tags: split(v.tagsText),
        appliesTo: v.appliesTo,
        requiresAcknowledgment: v.requiresAcknowledgment,
        enforcedBySystem: v.enforcedBySystem || null,
        reviewDate: v.reviewDate || null,
        quiz: v.quiz.map((q) => ({ ...q, answerIndex: Number(q.answerIndex) })),
        changeNote: v.changeNote || null,
      });
      if (r.ok && r.data) {
        toast.success(initial ? (published && contentChanged ? `Saved as version ${r.data.version}` : "Saved") : "Draft created");
        router.push(`/hq/sops/${r.data.slug}`);
        router.refresh();
      } else if (!r.ok) toast.error(r.error);
    });
  });

  const doPublish = () => {
    if (!initial) return;
    if (form.formState.isDirty && !confirm("You have unsaved changes. Publish the last saved version anyway?")) return;
    start(async () => {
      const r = await publishSop(initial.id);
      if (r.ok) {
        toast.success("Published");
        router.push(`/hq/sops/${initial.slug}`);
        router.refresh();
      } else toast.error(r.error);
    });
  };
  const doArchive = () => {
    if (!initial || !confirm("Archive this SOP? It disappears from the library for employees. You can restore it later.")) return;
    start(async () => {
      const r = await archiveSop(initial.id);
      if (r.ok) {
        toast.success("Archived");
        router.push("/hq/sops");
        router.refresh();
      } else toast.error(r.error);
    });
  };
  const doUnarchive = () => {
    if (!initial) return;
    start(async () => {
      const r = await unarchiveSop(initial.id);
      if (r.ok) {
        toast.success("Restored as a draft");
        router.refresh();
      } else toast.error(r.error);
    });
  };
  const doDuplicate = () => {
    if (!initial) return;
    start(async () => {
      const r = await duplicateSop(initial.id);
      if (r.ok && r.data) {
        toast.success("Copy created");
        router.push(`/hq/sops/${r.data.slug}/edit`);
      } else if (!r.ok) toast.error(r.error);
    });
  };

  const groups = ["Task", "Screen", "Stage"] as const;

  return (
    <form onSubmit={submit}>
      <Breadcrumbs items={[{ label: "SOPs", href: "/hq/sops" }, ...(initial ? [{ label: initial.title, href: `/hq/sops/${initial.slug}` }, { label: "Edit" }] : [{ label: "New SOP" }])]} />
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-[22px] font-bold text-ink">{initial ? "Edit SOP" : "New SOP"}</h1>
          {initial ? <StatusBadge value={initial.status} /> : null}
          {initial ? <span className="text-xs text-muted">v{initial.version}</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {initial ? (
            <>
              <Button type="button" variant="secondary" size="sm" onClick={doDuplicate} disabled={pending}>
                <Copy /> Duplicate
              </Button>
              {initial.status === "ARCHIVED" ? (
                <Button type="button" variant="secondary" size="sm" onClick={doUnarchive} disabled={pending}>
                  Restore
                </Button>
              ) : (
                <Button type="button" variant="secondary" size="sm" onClick={doArchive} disabled={pending} className="text-bad">
                  <Archive /> Archive
                </Button>
              )}
              {initial.status !== "PUBLISHED" ? (
                <Button type="button" variant="soft" size="sm" onClick={doPublish} disabled={pending}>
                  <Send /> Publish
                </Button>
              ) : null}
            </>
          ) : null}
          <Button type="submit" size="sm" loading={pending}>
            {initial ? "Save changes" : "Save draft"}
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel>
            <div className="flex flex-col gap-4">
              <Field label="Title" required error={form.formState.errors.title?.message}>
                <Input {...form.register("title", { required: "Give the SOP a title." })} placeholder="Setting up a new customer" className="text-base font-semibold" autoFocus={!initial} />
              </Field>
              <Field label="Summary" hint="One or two sentences. Shown on the library card and read aloud by the assistant.">
                <Textarea rows={2} {...form.register("summary")} placeholder="After the signed agreement and first payment arrive, set the customer up in HQ and QuickBooks and hand off to delivery." />
              </Field>
            </div>
          </Panel>

          <Panel
            title="Body"
            padded={false}
            action={
              <div className="flex rounded-md border border-line bg-surface p-0.5">
                {(
                  [
                    ["write", Pencil, "Write"],
                    ["split", Columns2, "Split"],
                    ["preview", Eye, "Preview"],
                  ] as const
                ).map(([m, Icon, label]) => (
                  <button key={m} type="button" onClick={() => setMode(m)} className={cn("flex items-center gap-1 rounded px-2 py-0.5 text-[11.5px] font-semibold", mode === m ? "bg-brand-tint text-brand-deep dark:text-brand-bright" : "text-muted hover:text-ink")}>
                    <Icon className="size-3.5" /> {label}
                  </button>
                ))}
              </div>
            }
          >
            <div className={cn("grid", mode === "split" && "md:grid-cols-2 md:divide-x md:divide-line")}>
              {mode !== "preview" ? (
                <div className="p-3">
                  <Textarea {...form.register("body")} rows={mode === "split" ? 28 : 22} className="min-h-[420px] resize-y font-mono text-[13px] leading-relaxed" placeholder="Write in Markdown. Headings with #, lists with -, tables with | and numbered steps with 1." spellCheck />
                  <p className="mt-1.5 text-[11px] text-faint">Markdown: # heading, **bold**, - bullet, 1. step, | table |. Keep sentences short and say who does what.</p>
                </div>
              ) : null}
              {mode !== "write" ? (
                <div className="max-h-[720px] overflow-y-auto p-5">
                  <SopMarkdown body={body} />
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel
            title={`Steps (${steps.fields.length})`}
            action={
              <Button type="button" size="sm" variant="secondary" onClick={() => steps.append({ title: "", detail: "", required: true })}>
                <Plus /> Add step
              </Button>
            }
          >
            {steps.fields.length === 0 ? (
              <p className="text-sm text-muted">Steps become an interactive checklist on the reading view. Add them for procedures and checklists; skip for policies and references.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {steps.fields.map((f, i) => (
                  <li key={f.id} className="flex gap-3 rounded-lg border border-line bg-surface-2/40 p-3">
                    <span className="mt-1.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface text-[11px] font-bold text-muted ring-1 ring-line">{i + 1}</span>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <Input {...form.register(`steps.${i}.title` as const, { required: true })} placeholder="What to do" className="font-medium" />
                      <Textarea rows={2} {...form.register(`steps.${i}.detail` as const)} placeholder="How to do it, what to check, where to click (optional)" className="min-h-0" />
                      <label className="flex items-center gap-2 text-xs text-muted">
                        <Controller control={form.control} name={`steps.${i}.required` as const} render={({ field }) => <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(!!c)} />} /> Required step
                      </label>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button type="button" className="rounded p-1 text-muted hover:bg-surface hover:text-ink disabled:opacity-30" disabled={i === 0} onClick={() => steps.move(i, i - 1)} aria-label="Move up">
                        <ArrowUp className="size-4" />
                      </button>
                      <button type="button" className="rounded p-1 text-muted hover:bg-surface hover:text-ink disabled:opacity-30" disabled={i === steps.fields.length - 1} onClick={() => steps.move(i, i + 1)} aria-label="Move down">
                        <ArrowDown className="size-4" />
                      </button>
                      <button type="button" className="rounded p-1 text-muted hover:bg-bad-soft hover:text-bad" onClick={() => steps.remove(i)} aria-label="Remove step">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel
            title={`Quiz (${quiz.fields.length} question${quiz.fields.length === 1 ? "" : "s"})`}
            action={
              <Button type="button" size="sm" variant="secondary" onClick={() => quiz.append({ question: "", options: ["", ""], answerIndex: 0 })}>
                <Plus /> Add question
              </Button>
            }
          >
            {quiz.fields.length === 0 ? (
              <p className="text-sm text-muted">Optional. When a quiz exists, people must get every answer right before they can acknowledge. Two to four options per question.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {!requiresAck ? <p className="rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">The quiz only runs when &quot;Requires acknowledgment&quot; is on.</p> : null}
                {quiz.fields.map((f, qi) => (
                  <QuizQuestionEditor key={f.id} index={qi} form={form} onRemove={() => quiz.remove(qi)} />
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          {published ? (
            <Panel title="Change note" className={cn(contentChanged && "border-warn")}>
              <Field hint={contentChanged ? "The body or steps changed. Saving creates version " + (initial!.version + 1) + " and everyone will be asked to acknowledge again." : "Only needed when the body or steps change."} error={form.formState.errors.changeNote?.message}>
                <Input {...form.register("changeNote")} placeholder="What changed and why" />
              </Field>
            </Panel>
          ) : null}
          <Panel title="Where it lives">
            <div className="flex flex-col gap-3">
              <Field label="Code" hint="Short reference like SALES-004">
                <Input {...form.register("code")} placeholder="SALES-004" className="font-mono uppercase" />
              </Field>
              <Field label="Scope">
                <NativeSelect {...form.register("scope")}>
                  <option value="DEPARTMENT">One department</option>
                  <option value="COMPANY">Company wide</option>
                </NativeSelect>
              </Field>
              <Field label="Department" hint={scope === "COMPANY" ? "Optional owner department for a company wide SOP." : undefined}>
                <NativeSelect {...form.register("departmentId")}>
                  <option value="">{scope === "COMPANY" ? "Everyone" : "Choose a department"}</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Category">
                <NativeSelect {...form.register("category")}>
                  {SOP_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}: {c.hint}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Review date" hint="When an owner should re-read this.">
                <Input type="date" {...form.register("reviewDate")} />
              </Field>
            </div>
          </Panel>
          <Panel title="Rules">
            <div className="flex flex-col gap-3">
              <label className="flex items-start justify-between gap-3">
                <span>
                  <span className="block text-[13px] font-semibold text-ink-2">Requires acknowledgment</span>
                  <span className="block text-xs text-muted">People must confirm they read it. New versions ask again.</span>
                </span>
                <Controller control={form.control} name="requiresAcknowledgment" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />} />
              </label>
              <Field label="Enforced by the system" hint="Which automation or screen enforces this, if any.">
                <Textarea rows={2} {...form.register("enforcedBySystem")} placeholder="Discounts above the limit route to an owner for approval" className="min-h-0" />
              </Field>
            </div>
          </Panel>
          <Panel title="Findability">
            <div className="flex flex-col gap-3">
              <Field label="Keywords" hint="Comma separated. Used by search and the assistant.">
                <Input {...form.register("keywordsText")} placeholder="onboarding, setup, billing" />
              </Field>
              <Field label="Tags" hint="Comma separated.">
                <Input {...form.register("tagsText")} placeholder="customer success" />
              </Field>
            </div>
          </Panel>
          <Panel title="Applies to" padded={false}>
            <p className="px-4 pt-3 text-xs text-muted">Shown in the help drawer on these screens, on these task types, and at these deal stages.</p>
            <Controller
              control={form.control}
              name="appliesTo"
              render={({ field }) => (
                <div className="max-h-80 overflow-y-auto px-2 pb-2 pt-2">
                  {groups.map((g) => (
                    <div key={g} className="mb-2">
                      <div className="px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted">{g}</div>
                      <div className="grid grid-cols-2 gap-x-1">
                        {APPLIES_TO_OPTIONS.filter((o) => o.group === g).map((o) => {
                          const on = field.value.includes(o.value);
                          return (
                            <label key={o.value} className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-[12.5px] hover:bg-surface-2", on && "text-ink")}>
                              <Checkbox checked={on} onCheckedChange={(c) => field.onChange(c ? [...field.value, o.value] : field.value.filter((v) => v !== o.value))} />
                              <span className="truncate">{o.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            />
          </Panel>
          {initial ? (
            <p className="text-xs text-muted">
              Reading view: <Link href={`/hq/sops/${initial.slug}`} className="text-brand hover:underline">/hq/sops/{initial.slug}</Link>
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}

function QuizQuestionEditor({ index, form, onRemove }: { index: number; form: ReturnType<typeof useForm<FormValues>>; onRemove: () => void }) {
  const options = form.watch(`quiz.${index}.options`);
  const setOptions = (next: string[]) => form.setValue(`quiz.${index}.options`, next, { shouldDirty: true });
  return (
    <div className="rounded-lg border border-line bg-surface-2/40 p-3">
      <div className="flex items-start gap-2">
        <span className="mt-2 text-xs font-bold text-muted">Q{index + 1}</span>
        <Input {...form.register(`quiz.${index}.question` as const, { required: true })} placeholder="What must happen before a demo is offered?" className="flex-1" />
        <button type="button" className="mt-1 rounded p-1 text-muted hover:bg-bad-soft hover:text-bad" onClick={onRemove} aria-label="Remove question">
          <Trash2 className="size-4" />
        </button>
      </div>
      <Controller
        control={form.control}
        name={`quiz.${index}.answerIndex` as const}
        render={({ field }) => (
          <div className="mt-2 flex flex-col gap-1.5 pl-6">
            {options.map((_, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <input type="radio" className="accent-brand" checked={Number(field.value) === oi} onChange={() => field.onChange(oi)} title="Mark as the correct answer" />
                <Input value={options[oi]} onChange={(e) => setOptions(options.map((o, i) => (i === oi ? e.target.value : o)))} placeholder={`Option ${oi + 1}`} className="h-8 text-[13px]" />
                <button type="button" className="rounded p-1 text-muted hover:text-bad disabled:opacity-30" disabled={options.length <= 2} onClick={() => { const next = options.filter((_, i) => i !== oi); setOptions(next); if (Number(field.value) >= next.length) field.onChange(0); }} aria-label="Remove option">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <button type="button" className="text-xs font-semibold text-brand hover:underline disabled:opacity-40" disabled={options.length >= 4} onClick={() => setOptions([...options, ""])}>
                + Add option
              </button>
              <span className="text-[11px] text-muted">Select the radio next to the correct answer</span>
            </div>
          </div>
        )}
      />
    </div>
  );
}
