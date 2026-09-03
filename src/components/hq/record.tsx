import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="mb-3 flex items-center gap-1 text-[13px] text-muted">
      {items.map((it, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <ChevronRight className="size-3.5 text-faint" /> : null}
          {it.href ? (
            <Link href={it.href} className="hover:text-ink">
              {it.label}
            </Link>
          ) : (
            <span className="text-ink">{it.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

export function RecordHeader({ avatar, title, subtitle, badges, actions, meta }: { avatar?: React.ReactNode; title: React.ReactNode; subtitle?: React.ReactNode; badges?: React.ReactNode; actions?: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-sm md:flex-row md:items-start md:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        {avatar}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl font-bold leading-tight text-ink md:text-[22px]">{title}</h1>
            {badges}
          </div>
          {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
          {meta ? <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">{meta}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function KeyValue({ items, className, columns = 1 }: { items: { label: string; value: React.ReactNode }[]; className?: string; columns?: 1 | 2 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 text-sm", columns === 2 && "sm:grid-cols-2", className)}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{it.label}</dt>
          <dd className="mt-0.5 break-words text-ink">{it.value === null || it.value === undefined || it.value === "" ? <span className="text-faint">Not set</span> : it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Panel({ title, action, children, className, padded = true }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cn("rounded-xl border border-line bg-surface shadow-sm", className)}>
      {title ? (
        <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className={cn(padded && "p-4")}>{children}</div>
    </section>
  );
}

export function Pagination({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-muted">
      <span>
        Page {page} of {pages} · {total} total
      </span>
      <div className="flex gap-1">
        {page > 1 ? (
          <Link className="rounded-md border border-line px-2.5 py-1 hover:bg-surface-2" href={hrefFor(page - 1)}>
            Previous
          </Link>
        ) : null}
        {page < pages ? (
          <Link className="rounded-md border border-line px-2.5 py-1 hover:bg-surface-2" href={hrefFor(page + 1)}>
            Next
          </Link>
        ) : null}
      </div>
    </div>
  );
}
