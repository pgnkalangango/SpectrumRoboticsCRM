"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { saveDepartment } from "@/server/actions/settings";

export type DepartmentRow = { id: string; slug: string; name: string; description: string | null; color: string; leadId: string | null; userCount: number; sopCount: number };
export type StaffOption = { id: string; name: string; email: string };

export function DepartmentsForm({ departments, staff }: { departments: DepartmentRow[]; staff: StaffOption[] }) {
  const [adding, setAdding] = React.useState(false);
  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[17px] font-bold text-ink">Departments</h2>
          <p className="mt-0.5 text-sm text-muted">Departments group people and SOPs. The color shows next to every SOP and team member.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setAdding(true)} disabled={adding}>
          <Plus /> Add department
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        {adding ? <DepartmentRowForm staff={staff} onDone={() => setAdding(false)} /> : null}
        {departments.map((d) => (
          <DepartmentRowForm key={d.id} dept={d} staff={staff} />
        ))}
      </div>
    </div>
  );
}

function DepartmentRowForm({ dept, staff, onDone }: { dept?: DepartmentRow; staff: StaffOption[]; onDone?: () => void }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [v, setV] = React.useState({ name: dept?.name ?? "", description: dept?.description ?? "", color: dept?.color ?? "#149CA0", leadId: dept?.leadId ?? "" });
  const initial = { name: dept?.name ?? "", description: dept?.description ?? "", color: dept?.color ?? "#149CA0", leadId: dept?.leadId ?? "" };
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const save = () =>
    start(async () => {
      const r = await saveDepartment({ id: dept?.id, name: v.name, description: v.description || null, color: v.color, leadId: v.leadId || null });
      if (r.ok) {
        toast.success(dept ? "Department saved" : "Department added");
        onDone?.();
        router.refresh();
      } else toast.error(r.error);
    });
  return (
    <div className="rounded-lg border border-line bg-surface-2/40 p-3">
      <div className="grid gap-3 sm:grid-cols-[auto_1fr_1fr_1fr]">
        <div className="flex items-end gap-2">
          <input type="color" value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} className="size-9 cursor-pointer rounded-lg border border-line bg-surface p-0.5" aria-label="Department color" />
        </div>
        <Field label="Name">
          <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Customer Success" />
        </Field>
        <Field label="Description">
          <Input value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder="What this team owns" />
        </Field>
        <Field label="Lead">
          <NativeSelect value={v.leadId} onChange={(e) => setV({ ...v, leadId: e.target.value })}>
            <option value="">Nobody yet</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-muted">{dept ? `${dept.userCount} people · ${dept.sopCount} SOPs · key ${dept.slug}` : "New department"}</span>
        <div className="flex gap-2">
          {onDone ? (
            <Button size="sm" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          ) : null}
          <Button size="sm" onClick={save} loading={pending} disabled={!dirty || !v.name.trim()}>
            {dept ? "Save" : "Add"}
          </Button>
        </div>
      </div>
    </div>
  );
}
