"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller, type FieldValues, type Path } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { saveSettingsGroup, type SettingsGroup } from "@/server/actions/settings";

export type FieldSpec = {
  name: string;
  label: string;
  hint?: string;
  type: "text" | "number" | "textarea" | "switch" | "select" | "list" | "readonly";
  options?: { value: string; label: string }[];
  placeholder?: string;
  rows?: number;
  step?: string;
  min?: number;
  max?: number;
  full?: boolean;
  mono?: boolean;
};

export type GroupSpec = { key: SettingsGroup; title: string; intro: string; fields: FieldSpec[] };

// One generic form per settings group. Values round trip as the JSON stored in Setting.value.
export function GroupForm({ spec, values }: { spec: GroupSpec; values: Record<string, unknown> }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const form = useForm<FieldValues>({ defaultValues: values });
  const submit = form.handleSubmit((v) =>
    start(async () => {
      const payload: Record<string, unknown> = { ...v };
      for (const f of spec.fields) if (f.type === "readonly") delete payload[f.name];
      const r = await saveSettingsGroup(spec.key, payload);
      if (r.ok) {
        toast.success(`${spec.title} saved`);
        form.reset(v);
        router.refresh();
      } else toast.error(r.error);
    }),
  );
  return (
    <form onSubmit={submit} className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="font-display text-[17px] font-bold text-ink">{spec.title}</h2>
        <p className="mt-0.5 text-sm text-muted">{spec.intro}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {spec.fields.map((f) => (
          <div key={f.name} className={f.full || f.type === "textarea" || f.type === "list" || f.type === "switch" ? "sm:col-span-2" : undefined}>
            <SpecField spec={f} form={form} />
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-end gap-3 border-t border-line pt-4">
        {form.formState.isDirty ? <span className="text-xs text-muted">Unsaved changes</span> : null}
        <Button type="submit" loading={pending} disabled={!form.formState.isDirty}>
          Save {spec.title.toLowerCase()}
        </Button>
      </div>
    </form>
  );
}

function SpecField({ spec, form }: { spec: FieldSpec; form: ReturnType<typeof useForm<FieldValues>> }) {
  const name = spec.name as Path<FieldValues>;
  if (spec.type === "switch") {
    return (
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <label className="flex items-center justify-between gap-4 rounded-lg border border-line px-3 py-2.5">
            <span>
              <span className="block text-[13px] font-semibold text-ink-2">{spec.label}</span>
              {spec.hint ? <span className="block text-xs text-muted">{spec.hint}</span> : null}
            </span>
            <Switch checked={!!field.value} onCheckedChange={field.onChange} />
          </label>
        )}
      />
    );
  }
  if (spec.type === "list") {
    return (
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => {
          const items: string[] = Array.isArray(field.value) ? field.value : [];
          return (
            <Field label={spec.label} hint={spec.hint}>
              <div className="flex flex-col gap-2">
                {items.map((it, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={it} onChange={(e) => field.onChange(items.map((x, j) => (j === i ? e.target.value : x)))} placeholder={spec.placeholder} className={spec.mono ? "font-mono text-xs" : undefined} />
                    <button type="button" className="rounded p-1.5 text-muted hover:bg-bad-soft hover:text-bad" onClick={() => field.onChange(items.filter((_, j) => j !== i))} aria-label="Remove">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                <div>
                  <Button type="button" size="sm" variant="secondary" onClick={() => field.onChange([...items, ""])}>
                    <Plus /> Add
                  </Button>
                </div>
              </div>
            </Field>
          );
        }}
      />
    );
  }
  if (spec.type === "readonly") {
    return (
      <Field label={spec.label} hint={spec.hint}>
        <Input value={String(form.getValues(name) ?? "")} disabled className="tabular" />
      </Field>
    );
  }
  if (spec.type === "select") {
    return (
      <Field label={spec.label} hint={spec.hint}>
        <NativeSelect {...form.register(name)}>
          {spec.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
    );
  }
  if (spec.type === "textarea") {
    return (
      <Field label={spec.label} hint={spec.hint}>
        <Textarea rows={spec.rows ?? 4} {...form.register(name)} placeholder={spec.placeholder} className={spec.mono ? "font-mono text-xs" : undefined} />
      </Field>
    );
  }
  return (
    <Field label={spec.label} hint={spec.hint}>
      <Input type={spec.type === "number" ? "number" : "text"} step={spec.step} min={spec.min} max={spec.max} {...form.register(name)} placeholder={spec.placeholder} className={spec.mono ? "font-mono" : undefined} />
    </Field>
  );
}
