import * as React from "react";
import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";

// Staff previewing a client's portal carry ?company=<id> on every link so the preview sticks.
export function portalHref(path: string, preview?: string | null): string {
  if (!preview) return path;
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set("company", preview);
  return `${base}?${params}`;
}

export function previewFor(user: { kind: string }, company?: string | null): string | null {
  return user.kind === "STAFF" && company ? company : null;
}

export function PortalHeader({ title, intro, action, back }: { title: React.ReactNode; intro?: React.ReactNode; action?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {back ? (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
            <ArrowLeft className="size-4" /> {back.label}
          </Link>
        ) : null}
        <h1 className="font-display text-[26px] font-bold leading-tight text-ink md:text-3xl">{title}</h1>
        {intro ? <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted">{intro}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function NoCompany() {
  return <EmptyState title="No company linked yet" body="Your account is not linked to a company, so there is nothing to show. Call (630) 809-9698 or email info@spectrumrobotics.ai and we will fix that." />;
}

export function PortalEmpty({ icon, title, body, action }: { icon?: LucideIcon; title: string; body?: React.ReactNode; action?: React.ReactNode }) {
  return <EmptyState icon={icon} title={title} body={body} action={action} className="bg-surface" />;
}

// One fact, large and readable.
export function Fact({ label, value, tone = "default", className }: { label: string; value: React.ReactNode; tone?: "default" | "ok" | "warn" | "bad"; className?: string }) {
  const tones = { default: "text-ink", ok: "text-ok", warn: "text-warn", bad: "text-bad" };
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={cn("mt-0.5 text-[15px] font-medium leading-snug break-words", tones[tone])}>{value === null || value === undefined || value === "" ? <span className="font-normal text-faint">Not set</span> : value}</div>
    </div>
  );
}

export function FactGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  return <dl className={cn("grid gap-x-6 gap-y-4", cols === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>{children}</dl>;
}

export function PortalPanel({ title, children, action, className, padded = true }: { title?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cn("rounded-2xl border border-line bg-surface shadow-sm", className)}>
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="font-display text-[16px] font-semibold text-ink">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className={cn(padded && "p-5")}>{children}</div>
    </section>
  );
}
