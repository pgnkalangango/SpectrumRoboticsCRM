import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn, label as toLabel } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] font-semibold leading-5 whitespace-nowrap", {
  variants: {
    variant: {
      default: "bg-surface-2 text-ink-2",
      brand: "bg-brand-tint text-brand-deep dark:text-brand-bright",
      ok: "bg-ok-soft text-ok",
      warn: "bg-warn-soft text-warn",
      bad: "bg-bad-soft text-bad",
      info: "bg-info-soft text-info",
      outline: "border border-line text-ink-2",
      dark: "bg-ink text-white",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

// Status pills: one map for every enum in the system so colors mean the same thing everywhere.
const STATUS_TONE: Record<string, VariantProps<typeof badgeVariants>["variant"]> = {
  // generic
  ACTIVE: "ok", INACTIVE: "default", INVITED: "warn", PENDING: "warn", APPROVED: "ok", REJECTED: "bad", WITHDRAWN: "default", DENIED: "bad",
  // companies / contacts
  PROSPECT: "info", PARTNER: "brand", COMPETITOR: "default", LEAD: "info", CLIENT: "ok", VENDOR: "default", OTHER: "default",
  // tasks
  TODO: "default", IN_PROGRESS: "info", REVIEW: "warn", DONE: "ok", CANCELLED: "default",
  LOW: "default", MEDIUM: "info", NORMAL: "info", HIGH: "warn", URGENT: "bad", CRITICAL: "bad",
  // quotes / invoices
  DRAFT: "default", PENDING_APPROVAL: "warn", SENT: "info", VIEWED: "info", ACCEPTED: "ok", DECLINED: "bad", EXPIRED: "default", SUPERSEDED: "default",
  PARTIALLY_PAID: "warn", PAID: "ok", OVERDUE: "bad", VOID: "default",
  // service
  NEW: "info", ACKNOWLEDGED: "info", WAITING_CUSTOMER: "warn", WAITING_OEM: "warn", RESOLVED: "ok", CLOSED: "default",
  IN_STOCK: "ok", RESERVED: "info", DEPLOYED: "ok", IN_SERVICE: "warn", RETURNED: "default", RETIRED: "default", LOW_STOCK: "warn", OUT_OF_STOCK: "bad", DISCONTINUED: "default",
  SURVEY_SCHEDULED: "info", SURVEYED: "info", INSTALL_SCHEDULED: "warn", LIVE: "ok", PAUSED: "warn", CHURNED: "bad",
  // sops / social
  PUBLISHED: "ok", ARCHIVED: "default", SCHEDULED: "info", PUBLISHING: "info", FAILED: "bad",
  // integrations
  NOT_CONFIGURED: "default", CONNECTED: "ok", ERROR: "bad", DISABLED: "default",
  // tiers
  OWNER: "brand", LEADERSHIP: "info", EMPLOYEE: "default",
  // pipeline
  new: "info", contacted: "info", call_booked: "info", discovery: "info", assessment: "warn", quote_sent: "warn", negotiation: "warn", won: "ok", lost: "bad", nurturing: "default",
};

export function StatusBadge({ value, className, labelOverride }: { value: string | null | undefined; className?: string; labelOverride?: string }) {
  if (!value) return null;
  return (
    <Badge variant={STATUS_TONE[value] ?? "default"} className={className}>
      {labelOverride ?? toLabel(value)}
    </Badge>
  );
}

export { badgeVariants };
