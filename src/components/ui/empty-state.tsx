import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({ icon: Icon, title, body, action, className, compact }: { icon?: LucideIcon; title: string; body?: React.ReactNode; action?: React.ReactNode; className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface/60 text-center", compact ? "px-4 py-8" : "px-6 py-14", className)}>
      {Icon ? (
        <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-brand-tint text-brand-deep dark:text-brand-bright">
          <Icon className="size-5" />
        </div>
      ) : null}
      <h3 className="font-display text-[15px] font-semibold text-ink">{title}</h3>
      {body ? <p className="mt-1 max-w-sm text-sm text-muted">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow, className, children }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="eyebrow mb-1">{eyebrow}</div> : null}
        <h1 className="font-display text-[22px] font-bold leading-tight text-ink md:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-2 flex items-center justify-between", className)}>
      <h2 className="eyebrow">{children}</h2>
      {action}
    </div>
  );
}
