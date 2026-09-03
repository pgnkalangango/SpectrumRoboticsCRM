"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Checkbox, Progress } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { toggleProjectStage } from "@/server/actions/service";

export type InstallProject = { id: string; name: string; status: string; ownerName: string | null; dealId: string | null; siteId: string | null; stages: { key: string; title: string; done: boolean }[] };

export function InstallChecklist({ project, siteId }: { project: InstallProject; siteId: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const done = project.stages.filter((s) => s.done).length;
  const pct = project.stages.length ? Math.round((done / project.stages.length) * 100) : 0;
  return (
    <section className="rounded-xl border border-line bg-surface shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-[15px] font-semibold text-ink">{project.name}</h3>
            <StatusBadge value={project.status} />
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {done} of {project.stages.length} stages done{project.ownerName ? ` · owned by ${project.ownerName}` : ""}
            {project.dealId ? (
              <>
                {" · "}
                <Link href={`/hq/deals/${project.dealId}`} className="text-brand hover:underline">
                  Deal
                </Link>
              </>
            ) : null}
          </div>
        </div>
        <Link href="/hq/sops/delivery-install-and-training" className="flex items-center gap-1 text-xs font-medium text-brand hover:underline">
          <BookOpen className="size-3.5" /> Install and training SOP
        </Link>
      </header>
      <div className="px-4 pt-3">
        <Progress value={pct} tone={pct === 100 ? "ok" : "brand"} />
      </div>
      <ol className="divide-y divide-line px-1 py-1">
        {project.stages.map((s, i) => (
          <li key={s.key} className="flex items-center gap-3 px-3 py-2.5">
            <Checkbox
              checked={s.done}
              disabled={pending}
              aria-label={s.title}
              onCheckedChange={() =>
                start(async () => {
                  const r = await toggleProjectStage(project.id, s.key, siteId);
                  if (r.ok) {
                    toast.success(r.data?.completed ? "Install complete. The site is now live." : s.done ? "Stage reopened" : "Stage done");
                    router.refresh();
                  } else toast.error(r.error);
                })
              }
            />
            <span className="w-5 text-[11px] font-semibold tabular text-faint">{i + 1}</span>
            <span className={cn("text-sm", s.done ? "text-muted line-through" : "text-ink")}>{s.title}</span>
          </li>
        ))}
      </ol>
      {pct === 100 ? <p className="border-t border-line px-4 py-2.5 text-xs text-ok">All stages done. The site was set to Live and leadership was notified.</p> : null}
    </section>
  );
}
