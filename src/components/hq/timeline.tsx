"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Phone, StickyNote, Users, Mail, MessageSquare, ArrowDownLeft, ArrowUpRight, Trash2, ExternalLink, FileText, LifeBuoy, Receipt, GitCommitHorizontal, Bot, Zap, CheckSquare } from "lucide-react";
import { cn, fmtDate, fmtDateTime, relTime } from "@/lib/utils";
import { LinkedinIcon } from "@/components/hq/icons";
import type { TimelineItem } from "@/lib/timeline";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { addActivity, deleteActivity } from "@/server/actions/crm";

const TYPE_META: Record<string, { icon: React.ElementType; label: string; tone: string }> = {
  NOTE: { icon: StickyNote, label: "Note", tone: "text-ink-2" },
  CALL: { icon: Phone, label: "Call", tone: "text-info" },
  MEETING: { icon: Users, label: "Meeting", tone: "text-brand" },
  EMAIL_IN: { icon: Mail, label: "Email received", tone: "text-ok" },
  EMAIL_OUT: { icon: Mail, label: "Email sent", tone: "text-brand" },
  SMS: { icon: MessageSquare, label: "Text", tone: "text-info" },
  LINKEDIN: { icon: LinkedinIcon, label: "LinkedIn", tone: "text-info" },
  SOCIAL: { icon: MessageSquare, label: "Social", tone: "text-info" },
  TASK_DONE: { icon: CheckSquare, label: "Task done", tone: "text-ok" },
  QUOTE_SENT: { icon: FileText, label: "Quote sent", tone: "text-brand" },
  QUOTE_VIEWED: { icon: FileText, label: "Quote viewed", tone: "text-info" },
  QUOTE_ACCEPTED: { icon: FileText, label: "Quote accepted", tone: "text-ok" },
  QUOTE_DECLINED: { icon: FileText, label: "Quote declined", tone: "text-bad" },
  INVOICE_SENT: { icon: Receipt, label: "Invoice sent", tone: "text-brand" },
  PAYMENT: { icon: Receipt, label: "Payment", tone: "text-ok" },
  STAGE_CHANGE: { icon: GitCommitHorizontal, label: "Stage change", tone: "text-warn" },
  TICKET: { icon: LifeBuoy, label: "Ticket", tone: "text-warn" },
  CATALOG_CHANGE: { icon: Bot, label: "Catalog change", tone: "text-muted" },
  SYSTEM: { icon: Zap, label: "System", tone: "text-muted" },
};

export type TimelineContext = { contactId?: string | null; companyId?: string | null; dealId?: string | null; quoteId?: string | null; ticketId?: string | null; siteId?: string | null };

export function Timeline({ items, context, currentUserId, canDeleteAny, showLinks = true, composer = true }: { items: TimelineItem[]; context: TimelineContext; currentUserId: string; canDeleteAny?: boolean; showLinks?: boolean; composer?: boolean }) {
  const router = useRouter();
  const [type, setType] = React.useState<"NOTE" | "CALL" | "MEETING" | "EMAIL_OUT">("NOTE");
  const [body, setBody] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [pending, start] = React.useTransition();

  const submit = () => {
    if (!body.trim()) return;
    start(async () => {
      const r = await addActivity({ type, body, subject: subject || null, ...context });
      if (r.ok) {
        setBody("");
        setSubject("");
        toast.success("Logged");
        router.refresh();
      } else toast.error(r.error);
    });
  };

  const grouped = React.useMemo(() => {
    const g: { day: string; items: TimelineItem[] }[] = [];
    for (const it of items) {
      const day = fmtDate(it.occurredAt, { weekday: "short" });
      const last = g[g.length - 1];
      if (last && last.day === day) last.items.push(it);
      else g.push({ day, items: [it] });
    }
    return g;
  }, [items]);

  return (
    <div className="flex flex-col gap-5">
      {composer ? (
        <div className="rounded-xl border border-line bg-surface p-3 shadow-sm">
          <div className="mb-2 flex flex-wrap gap-1">
            {(["NOTE", "CALL", "MEETING", "EMAIL_OUT"] as const).map((t) => {
              const M = TYPE_META[t];
              return (
                <button key={t} type="button" onClick={() => setType(t)} className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold", type === t ? "bg-brand-tint text-brand-deep dark:text-brand-bright" : "text-muted hover:bg-surface-2 hover:text-ink")}>
                  <M.icon className="size-3.5" /> {t === "EMAIL_OUT" ? "Email" : M.label}
                </button>
              );
            })}
          </div>
          {type !== "NOTE" ? <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={type === "CALL" ? "Who you spoke with and about what" : type === "MEETING" ? "Meeting title" : "Subject"} className="mb-2" /> : null}
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder={type === "NOTE" ? "Write a note. Anything worth remembering about this record." : type === "CALL" ? "What was said, what was agreed, what happens next." : type === "MEETING" ? "Notes from the meeting and the next step." : "Summary of what you sent."}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
            }}
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-faint">⌘ Enter to save</span>
            <Button size="sm" onClick={submit} loading={pending} disabled={!body.trim()}>
              Log {type === "EMAIL_OUT" ? "email" : TYPE_META[type].label.toLowerCase()}
            </Button>
          </div>
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No activity yet. Notes, calls, emails, quotes and stage changes will show up here in order.</p>
      ) : (
        <ol className="relative flex flex-col gap-5 border-l border-line pl-5 ml-2">
          {grouped.map((g) => (
            <li key={g.day}>
              <div className="mb-2 -ml-[29px] flex items-center gap-2">
                <span className="size-2 rounded-full bg-line-strong ring-4 ring-ground" />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{g.day}</span>
              </div>
              <ul className="flex flex-col gap-3">
                {g.items.map((it) => (
                  <TimelineRow key={it.id} item={it} canDelete={canDeleteAny || it.actorId === currentUserId} showLinks={showLinks} onDeleted={() => router.refresh()} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function TimelineRow({ item, canDelete, showLinks, onDeleted }: { item: TimelineItem; canDelete: boolean; showLinks: boolean; onDeleted: () => void }) {
  const M = TYPE_META[item.type] ?? TYPE_META.SYSTEM;
  const who = item.actor?.name ?? item.actorLabel ?? "System";
  const [pending, start] = React.useTransition();
  const manual = ["NOTE", "CALL", "MEETING", "EMAIL_OUT", "EMAIL_IN", "SMS", "LINKEDIN"].includes(item.type);
  return (
    <li className="group flex gap-3 rounded-lg border border-line bg-surface p-3 shadow-sm">
      <div className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2", M.tone)}>
        <M.icon className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
          <span className="font-semibold text-ink">{M.label}</span>
          {item.direction === "INBOUND" ? <ArrowDownLeft className="size-3.5 text-ok" /> : item.direction === "OUTBOUND" ? <ArrowUpRight className="size-3.5 text-brand" /> : null}
          {item.subject ? <span className="text-ink-2">{item.subject}</span> : null}
          <span className="ml-auto text-[11px] text-faint" title={fmtDateTime(item.occurredAt)}>
            {relTime(item.occurredAt)}
          </span>
        </div>
        {item.body ? <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{item.body}</p> : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <span className="flex items-center gap-1">
            <Avatar name={who} src={item.actor?.image} color={item.actor?.avatarColor} size={16} /> {who}
          </span>
          {showLinks && item.contact ? <Link href={`/hq/contacts/${item.contact.id}`} className="hover:text-brand">{item.contact.name}</Link> : null}
          {showLinks && item.deal ? <Link href={`/hq/deals/${item.deal.id}`} className="hover:text-brand">{item.deal.name}</Link> : null}
          {showLinks && item.quote ? <Link href={`/hq/quotes/${item.quote.id}`} className="hover:text-brand">Quote {item.quote.number}</Link> : null}
          {showLinks && item.ticket ? <Link href={`/hq/service/tickets/${item.ticket.id}`} className="hover:text-brand">{item.ticket.number}</Link> : null}
          {item.externalUrl ? (
            <a href={item.externalUrl} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 hover:text-brand">
              Open <ExternalLink className="size-3" />
            </a>
          ) : null}
          {item.source !== "manual" && item.source !== "system" ? <span className="rounded bg-surface-2 px-1 py-px capitalize">{item.source}</span> : null}
          {canDelete && manual ? (
            <button
              className="ml-auto flex items-center gap-1 opacity-0 transition-opacity hover:text-bad group-hover:opacity-100"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await deleteActivity(item.id);
                  if (r.ok) onDeleted();
                  else toast.error(r.error);
                })
              }
            >
              <Trash2 className="size-3" /> Delete
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
