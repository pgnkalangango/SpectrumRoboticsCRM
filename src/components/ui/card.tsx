import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-line bg-surface shadow-sm", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-start justify-between gap-3 px-5 pt-4 pb-2", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-display text-[15px] font-semibold leading-tight text-ink", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-[13px] text-muted mt-0.5", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-2 px-5 pb-4", className)} {...props} />;
}

export function Stat({ label, value, sub, tone = "default", className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "default" | "ok" | "warn" | "bad" | "brand"; className?: string }) {
  const tones = { default: "text-ink", ok: "text-ok", warn: "text-warn", bad: "text-bad", brand: "text-brand" };
  return (
    <div className={cn("rounded-xl border border-line bg-surface px-4 py-3.5 shadow-sm", className)}>
      <div className="eyebrow">{label}</div>
      <div className={cn("mt-1.5 font-display text-2xl font-bold tabular leading-none", tones[tone])}>{value}</div>
      {sub ? <div className="mt-1.5 text-xs text-muted">{sub}</div> : null}
    </div>
  );
}
