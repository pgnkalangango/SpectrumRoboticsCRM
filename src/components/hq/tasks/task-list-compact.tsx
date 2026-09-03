import Link from "next/link";
import { Plus } from "lucide-react";
import { fmtDate, isOverdue, label } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { TaskQuickComplete } from "@/components/hq/task-quick-complete";

export type CompactTask = { id: string; title: string; dueAt: string | null; priority: string; status: string; assignee: string | null; taskType: string };

export function TaskListCompact({ tasks, newHref }: { tasks: CompactTask[]; newHref?: string }) {
  return (
    <div>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted">No open tasks.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
              <TaskQuickComplete id={t.id} done={t.status === "DONE"} />
              <div className="min-w-0 flex-1">
                <Link href={`/hq/tasks?open=${t.id}`} className="block truncate text-sm font-medium hover:text-brand">
                  {t.title}
                </Link>
                <div className="text-xs text-muted">
                  {t.dueAt ? <span className={isOverdue(t.dueAt) && t.status !== "DONE" ? "font-semibold text-bad" : ""}>Due {fmtDate(t.dueAt)}</span> : "No due date"}
                  {t.assignee ? ` · ${t.assignee}` : ""} · {label(t.taskType)}
                </div>
              </div>
              <StatusBadge value={t.priority} />
            </li>
          ))}
        </ul>
      )}
      {newHref ? (
        <Button asChild variant="secondary" size="sm" className="mt-3">
          <Link href={newHref}>
            <Plus /> New task
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
