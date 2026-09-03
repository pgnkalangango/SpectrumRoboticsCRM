import Link from "next/link";
import { CheckSquare, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { cn, fmtDateTime, fullName, isOverdue, label } from "@/lib/utils";
import { TASK_TYPES } from "@/lib/options";
import { PageHeader, EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { FilterBar } from "@/components/hq/filter-bar";
import { TaskQuickComplete } from "@/components/hq/task-quick-complete";
import { TaskSheetFromUrl, type TaskFormValues } from "@/components/hq/tasks/task-sheet";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Tasks" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const q = sp.q?.trim();
  const scope = sp.scope ?? "mine";
  const showDone = sp.status === "done";
  const where: Prisma.TaskWhereInput = {
    ...(scope === "mine" ? { assigneeId: user.id } : scope === "created" ? { createdById: user.id } : {}),
    status: showDone ? { in: ["DONE", "CANCELLED"] } : { in: ["TODO", "IN_PROGRESS", "REVIEW"] },
    ...(sp.type ? { taskType: sp.type } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const tasks = await prisma.task.findMany({
    where,
    orderBy: showDone ? [{ completedAt: "desc" }] : [{ dueAt: { sort: "asc", nulls: "last" } }, { priority: "desc" }],
    take: 300,
    include: { assignee: { select: { id: true, name: true, image: true, avatarColor: true } }, contact: { select: { id: true, firstName: true, lastName: true } }, company: { select: { id: true, name: true } }, deal: { select: { id: true, name: true } }, sop: { select: { id: true, title: true, slug: true } } },
  });
  const now = new Date();
  const endToday = new Date(now);
  endToday.setHours(23, 59, 59, 999);
  const endWeek = new Date(endToday.getTime() + 6 * 86400000);
  const groups = showDone
    ? [{ key: "done", title: "Completed recently", items: tasks }]
    : [
        { key: "overdue", title: "Overdue", items: tasks.filter((t) => t.dueAt && t.dueAt < now) },
        { key: "today", title: "Today", items: tasks.filter((t) => t.dueAt && t.dueAt >= now && t.dueAt <= endToday) },
        { key: "week", title: "This week", items: tasks.filter((t) => t.dueAt && t.dueAt > endToday && t.dueAt <= endWeek) },
        { key: "later", title: "Later", items: tasks.filter((t) => t.dueAt && t.dueAt > endWeek) },
        { key: "nodate", title: "No due date", items: tasks.filter((t) => !t.dueAt) },
      ].filter((g) => g.items.length);

  const byId: Record<string, Partial<TaskFormValues>> = {};
  for (const t of tasks) {
    byId[t.id] = {
      id: t.id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      status: t.status,
      taskType: t.taskType,
      dueAt: t.dueAt ? toLocalInput(t.dueAt) : null,
      assignee: t.assignee ? { id: t.assignee.id, label: t.assignee.name } : null,
      contact: t.contact ? { id: t.contact.id, label: fullName(t.contact) } : null,
      company: t.company ? { id: t.company.id, label: t.company.name } : null,
      deal: t.deal ? { id: t.deal.id, label: t.deal.name } : null,
      sop: t.sop ? { id: t.sop.id, label: t.sop.title } : null,
      sopSlug: t.sop?.slug ?? null,
      checklist: (t.checklist as { text: string; done: boolean }[] | null) ?? [],
    };
  }

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle={scope === "mine" ? `${tasks.length} open task${tasks.length === 1 ? "" : "s"} assigned to you.` : `${tasks.length} task${tasks.length === 1 ? "" : "s"}.`}
        actions={
          <Button asChild>
            <Link href="/hq/tasks?new=1">
              <Plus /> New task
            </Link>
          </Button>
        }
      />
      <FilterBar
        searchPlaceholder="Search tasks"
        selects={[
          { name: "scope", label: "Mine", options: [{ value: "all", label: "Everyone's" }, { value: "created", label: "Created by me" }] },
          { name: "type", label: "All types", options: TASK_TYPES },
          { name: "status", label: "Open", options: [{ value: "done", label: "Completed" }] },
        ]}
      />
      {tasks.length === 0 ? (
        <EmptyState icon={CheckSquare} title={showDone ? "Nothing completed yet" : "No open tasks"} body={showDone ? "Completed tasks show up here." : "Add a task for anything you promised someone, or anything a deal needs next."} action={!showDone ? <Button asChild><Link href="/hq/tasks?new=1"><Plus /> New task</Link></Button> : undefined} />
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className={cn("eyebrow mb-2", g.key === "overdue" && "text-bad")}>
                {g.title} · {g.items.length}
              </h2>
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface shadow-sm">
                {g.items.map((t) => {
                  const list = (t.checklist as { text: string; done: boolean }[] | null) ?? [];
                  const doneCount = list.filter((c) => c.done).length;
                  const rel = t.contact ? { href: `/hq/contacts/${t.contact.id}`, label: fullName(t.contact) } : t.deal ? { href: `/hq/deals/${t.deal.id}`, label: t.deal.name } : t.company ? { href: `/hq/companies/${t.company.id}`, label: t.company.name } : null;
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                      <TaskQuickComplete id={t.id} done={t.status === "DONE"} />
                      <div className="min-w-0 flex-1">
                        <Link href={`/hq/tasks?open=${t.id}${sp.scope ? `&scope=${sp.scope}` : ""}`} className={cn("block truncate text-sm font-medium hover:text-brand", t.status === "DONE" && "text-muted line-through")}>
                          {t.title}
                        </Link>
                        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                          {t.dueAt ? <span className={cn(isOverdue(t.dueAt) && t.status !== "DONE" && "font-semibold text-bad")}>{fmtDateTime(t.dueAt)}</span> : null}
                          <span>{label(t.taskType)}</span>
                          {rel ? <Link href={rel.href} className="hover:text-brand">{rel.label}</Link> : null}
                          {list.length ? <span>{doneCount}/{list.length} steps</span> : null}
                          {t.sop ? <Link href={`/hq/sops/${t.sop.slug}`} className="text-brand hover:underline">SOP</Link> : null}
                        </div>
                      </div>
                      <StatusBadge value={t.priority} />
                      {t.status === "IN_PROGRESS" || t.status === "REVIEW" ? <StatusBadge value={t.status} /> : null}
                      {t.assignee && scope !== "mine" ? <Avatar name={t.assignee.name} src={t.assignee.image} color={t.assignee.avatarColor} size={24} /> : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      <TaskSheetFromUrl tasks={byId} />
    </div>
  );
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
