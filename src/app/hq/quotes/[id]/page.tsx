import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Circle, Clock, Eye, Send, XCircle, FileText, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getTimeline } from "@/lib/timeline";
import { cn, fmtDate, fmtDateTime, fullName, money, relTime } from "@/lib/utils";
import { hasDiscount, maxDiscountPct } from "@/lib/quotes/math";
import { loadQuoteDoc } from "@/lib/quotes/load";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Breadcrumbs, KeyValue, Panel, RecordHeader } from "@/components/hq/record";
import { Timeline } from "@/components/hq/timeline";
import { QuoteDocument } from "@/components/hq/quotes/quote-document";
import { QuoteActions } from "@/components/hq/quotes/quote-actions";

export default async function QuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const loaded = await loadQuoteDoc({ id });
  if (!loaded) notFound();
  const { quote: q, doc } = loaded;
  const [timeline, extra, supersededBy, supersedes, approvals] = await Promise.all([
    getTimeline({ quoteId: id }),
    prisma.quote.findUnique({ where: { id }, select: { deal: { select: { id: true, name: true, stageKey: true, stage: { select: { label: true } } } }, approvedBy: { select: { name: true } }, invoices: { where: { status: { not: "VOID" } }, select: { id: true, number: true, status: true, balanceDue: true }, take: 1 } } }),
    prisma.quote.findFirst({ where: { supersedesId: id }, select: { id: true, number: true, status: true } }),
    q.supersedesId ? prisma.quote.findUnique({ where: { id: q.supersedesId }, select: { id: true, number: true, status: true } }) : null,
    prisma.approval.findMany({ where: { entityType: "Quote", entityId: id }, orderBy: { createdAt: "desc" }, take: 3, include: { requestedBy: { select: { name: true } }, decidedBy: { select: { name: true } } } }),
  ]);
  const discounted = hasDiscount(q);
  const invoice = extra?.invoices[0] ?? null;
  const now = new Date();
  const expired = q.validUntil ? q.validUntil < now : false;

  const steps = [
    { key: "created", label: "Created", at: q.createdAt, done: true, icon: FileText },
    ...(discounted ? [{ key: "approved", label: q.approvedAt ? "Discount approved" : q.status === "PENDING_APPROVAL" ? "Waiting for approval" : "Approval needed", at: q.approvedAt, done: !!q.approvedAt, icon: Check }] : []),
    { key: "sent", label: "Sent", at: q.sentAt, done: !!q.sentAt, icon: Send },
    { key: "viewed", label: "Viewed by client", at: q.viewedAt, done: !!q.viewedAt, icon: Eye },
    { key: "decided", label: q.status === "ACCEPTED" ? `Accepted by ${q.acceptedByName ?? "client"}` : q.status === "DECLINED" ? "Declined" : q.status === "EXPIRED" ? "Expired" : "Client decision", at: q.respondedAt, done: q.status === "ACCEPTED" || q.status === "DECLINED", bad: q.status === "DECLINED" || q.status === "EXPIRED", icon: q.status === "DECLINED" ? XCircle : Check },
  ];

  return (
    <div>
      <Breadcrumbs items={[{ label: "Quotes", href: "/hq/quotes" }, { label: q.number }]} />
      <RecordHeader
        title={q.title}
        badges={
          <>
            <StatusBadge value={q.status} />
            {q.version > 1 ? <Badge>Version {q.version}</Badge> : null}
            {discounted ? <Badge variant="warn">Up to {maxDiscountPct(q)}% off</Badge> : null}
            {expired && (q.status === "SENT" || q.status === "VIEWED") ? <Badge variant="bad">Past valid date</Badge> : null}
          </>
        }
        subtitle={
          <>
            <span className="tabular">{q.number}</span>
            {q.company ? (
              <>
                {" · "}
                <Link href={`/hq/companies/${q.company.id}`} className="hover:text-brand">
                  {q.company.name}
                </Link>
              </>
            ) : null}
            {q.contact ? (
              <>
                {" · "}
                <Link href={`/hq/contacts/${q.contact.id}`} className="hover:text-brand">
                  {fullName(q.contact)}
                </Link>
              </>
            ) : null}
          </>
        }
        meta={
          <>
            <span className="font-display text-lg font-bold text-ink tabular">
              {money(Number(q.total), { cents: true })}
              {Number(q.monthlyTotal) ? <span className="text-sm font-medium text-muted"> + {money(Number(q.monthlyTotal), { cents: true })}/mo</span> : null}
            </span>
            {q.validUntil ? <span className={cn(expired && "text-bad")}>Valid until {fmtDate(q.validUntil, { year: "numeric" })}</span> : null}
            {q.owner ? <span className="flex items-center gap-1.5"><Avatar name={q.owner.name} src={q.owner.image} color={q.owner.avatarColor} size={18} /> {q.owner.name}</span> : null}
          </>
        }
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/hq/assistant?type=quote&id=${q.id}&label=${encodeURIComponent(q.number)}`}>
                <Sparkles /> Ask assistant
              </Link>
            </Button>
            <QuoteActions
              quote={{ id: q.id, number: q.number, status: q.status, hasDiscount: discounted, publicToken: q.publicToken, contactEmail: q.contact?.email ?? null, contactName: q.contact ? fullName(q.contact) : null, invoice: invoice ? { id: invoice.id, number: invoice.number } : null, supersededBy: supersededBy ? { id: supersededBy.id, number: supersededBy.number } : null }}
              canDiscount={can(user, "quotes.discount")}
              isLeadership={user.tier !== "EMPLOYEE"}
            />
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-4">
          <Panel title="Progress">
            <ol className="flex flex-col gap-3">
              {steps.map((s) => (
                <li key={s.key} className="flex items-start gap-3">
                  <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full", s.done ? (s.bad ? "bg-bad-soft text-bad" : "bg-ok-soft text-ok") : "bg-surface-2 text-faint")}>{s.done ? <s.icon className="size-3.5" /> : <Circle className="size-3" />}</span>
                  <span className="min-w-0">
                    <span className={cn("block text-sm", s.done ? "font-medium text-ink" : "text-muted")}>{s.label}</span>
                    {s.at ? <span className="block text-xs text-muted">{fmtDateTime(s.at)}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title="Details">
            <KeyValue
              items={[
                { label: "Deal", value: extra?.deal ? <Link href={`/hq/deals/${extra.deal.id}`} className="text-brand hover:underline">{extra.deal.name}</Link> : null },
                { label: "Deal stage", value: extra?.deal ? <StatusBadge value={extra.deal.stageKey} labelOverride={extra.deal.stage.label} /> : null },
                { label: "Contact email", value: q.contact?.email },
                { label: "Approved by", value: extra?.approvedBy ? `${extra.approvedBy.name}${q.approvedAt ? `, ${fmtDate(q.approvedAt)}` : ""}` : null },
                { label: "Accepted by", value: q.acceptedByName ? `${q.acceptedByName}${q.acceptedIp ? ` (${q.acceptedIp})` : ""}` : null },
                { label: "Decline reason", value: q.declineReason },
                { label: "Invoice", value: invoice ? <Link href={`/hq/invoices/${invoice.id}`} className="text-brand hover:underline">{invoice.number} · {invoice.status.toLowerCase().replace("_", " ")}</Link> : null },
                { label: "Public link", value: q.publicToken && q.status !== "DRAFT" ? <a href={`/q/${q.publicToken}`} target="_blank" rel="noreferrer" className="break-all text-brand hover:underline">/q/{q.publicToken.slice(0, 10)}…</a> : null },
                { label: "Updated", value: relTime(q.updatedAt) },
              ]}
            />
          </Panel>
          {supersedes || supersededBy ? (
            <Panel title="Versions">
              <ul className="flex flex-col gap-1.5 text-sm">
                {supersededBy ? (
                  <li className="flex items-center justify-between gap-2">
                    <Link href={`/hq/quotes/${supersededBy.id}`} className="font-medium text-brand hover:underline">
                      {supersededBy.number}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      newer <StatusBadge value={supersededBy.status} />
                    </span>
                  </li>
                ) : null}
                <li className="flex items-center justify-between gap-2 text-ink">
                  <span className="font-medium">{q.number}</span>
                  <span className="text-xs text-muted">this version</span>
                </li>
                {supersedes ? (
                  <li className="flex items-center justify-between gap-2">
                    <Link href={`/hq/quotes/${supersedes.id}`} className="font-medium text-brand hover:underline">
                      {supersedes.number}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      previous <StatusBadge value={supersedes.status} />
                    </span>
                  </li>
                ) : null}
              </ul>
            </Panel>
          ) : null}
          {approvals.length ? (
            <Panel title="Approval requests">
              <ul className="flex flex-col gap-2 text-sm">
                {approvals.map((a) => (
                  <li key={a.id} className="flex flex-col gap-0.5">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-ink-2">{a.requestedBy?.name ?? "System"} · {relTime(a.createdAt)}</span>
                      <StatusBadge value={a.status} />
                    </span>
                    {a.reason ? <span className="text-xs text-muted">{a.reason}</span> : null}
                    {a.decisionNote ? <span className="text-xs text-muted">{a.decidedBy?.name ?? "Decision"}: {a.decisionNote}</span> : null}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
          {q.internalNotes ? (
            <Panel title="Internal notes">
              <p className="whitespace-pre-wrap text-sm text-ink-2">{q.internalNotes}</p>
              <p className="mt-2 flex items-center gap-1 text-[11px] text-faint">
                <Clock className="size-3" /> Staff only, never sent to the client.
              </p>
            </Panel>
          ) : null}
        </div>

        <Tabs defaultValue={sp.tab ?? "preview"}>
          <TabsList>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="timeline">
              Timeline <span className="rounded bg-surface-2 px-1 text-[10px]">{timeline.length}</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="preview">
            <QuoteDocument doc={doc} />
          </TabsContent>
          <TabsContent value="timeline">
            <Timeline items={timeline} context={{ quoteId: q.id, contactId: q.contactId, companyId: q.companyId, dealId: q.dealId }} currentUserId={user.id} canDeleteAny={user.tier !== "EMPLOYEE"} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
