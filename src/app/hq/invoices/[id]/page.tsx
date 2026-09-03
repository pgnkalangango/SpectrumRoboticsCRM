import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { getTimeline } from "@/lib/timeline";
import { cn, fmtDate, fmtDateTime, fullName, isOverdue, label, money, relTime } from "@/lib/utils";
import { loadInvoiceDoc } from "@/lib/quotes/load";
import { quickbooksStatus } from "@/lib/quickbooks";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Breadcrumbs, KeyValue, Panel, RecordHeader } from "@/components/hq/record";
import { Timeline } from "@/components/hq/timeline";
import { InvoiceDocument } from "@/components/hq/quotes/quote-document";
import { InvoiceActions } from "@/components/hq/invoices/invoice-actions";
import { InvoiceEditorFromUrl } from "@/components/hq/invoices/invoice-editor";
import { PaymentSyncButton } from "@/components/hq/invoices/payment-sync-button";

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const loaded = await loadInvoiceDoc({ id });
  if (!loaded) notFound();
  const { invoice: inv, doc } = loaded;
  const [timeline, payments, qb] = await Promise.all([
    getTimeline({ OR: [{ invoiceId: id }, ...(inv.quoteId ? [{ quoteId: inv.quoteId, invoiceId: null }] : [])] }),
    prisma.payment.findMany({ where: { invoiceId: id }, orderBy: { paidAt: "desc" }, include: { recordedBy: { select: { name: true } } } }),
    user.tier === "OWNER" ? quickbooksStatus() : Promise.resolve({ connected: false, configured: false, realmId: null, accountName: null, environment: "production" }),
  ]);
  const isOwner = user.tier === "OWNER";
  const balance = Number(inv.balanceDue);
  const late = ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"].includes(inv.status) && isOverdue(inv.dueDate);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Invoices", href: "/hq/invoices" }, { label: inv.number }]} />
      <RecordHeader
        title={inv.title ?? `Invoice ${inv.number}`}
        badges={
          <>
            <StatusBadge value={inv.status} />
            {late && inv.status !== "OVERDUE" ? <Badge variant="bad">Past due</Badge> : null}
            {inv.quickbooksInvoiceId ? <Badge variant="ok">QuickBooks</Badge> : null}
          </>
        }
        subtitle={
          <>
            <span className="tabular">{inv.number}</span>
            {inv.company ? (
              <>
                {" · "}
                <Link href={`/hq/companies/${inv.company.id}`} className="hover:text-brand">
                  {inv.company.name}
                </Link>
              </>
            ) : null}
            {inv.contact ? (
              <>
                {" · "}
                <Link href={`/hq/contacts/${inv.contact.id}`} className="hover:text-brand">
                  {fullName(inv.contact)}
                </Link>
              </>
            ) : null}
          </>
        }
        meta={
          <>
            <span className="font-display text-lg font-bold text-ink tabular">
              {money(balance, { cents: true })} <span className="text-sm font-medium text-muted">due of {money(Number(inv.total), { cents: true })}</span>
            </span>
            {inv.dueDate ? <span className={cn(late && "font-semibold text-bad")}>Due {fmtDate(inv.dueDate, { year: "numeric" })}</span> : null}
            {inv.owner ? <span className="flex items-center gap-1.5"><Avatar name={inv.owner.name} src={inv.owner.image} color={inv.owner.avatarColor} size={18} /> {inv.owner.name}</span> : null}
          </>
        }
        actions={
          <InvoiceActions
            invoice={{ id: inv.id, number: inv.number, status: inv.status, balanceDue: balance, publicToken: inv.publicToken, contactEmail: inv.contact?.email ?? null, contactName: inv.contact ? fullName(inv.contact) : null, quickbooksInvoiceId: inv.quickbooksInvoiceId, quickbooksConnected: qb.connected }}
            isOwner={isOwner}
            isLeadership={user.tier !== "EMPLOYEE"}
          />
        }
      />

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-4">
          <Panel title="Details">
            <KeyValue
              items={[
                { label: "Issued", value: fmtDate(inv.issueDate, { year: "numeric" }) },
                { label: "Terms", value: inv.paymentTerms },
                { label: "From quote", value: inv.quote ? <Link href={`/hq/quotes/${inv.quote.id}`} className="text-brand hover:underline">{inv.quote.number}</Link> : null },
                { label: "Sent", value: inv.sentAt ? fmtDateTime(inv.sentAt) : null },
                { label: "Viewed", value: inv.viewedAt ? fmtDateTime(inv.viewedAt) : null },
                { label: "Paid", value: inv.paidAt ? fmtDateTime(inv.paidAt) : null },
                { label: "Public link", value: inv.publicToken && inv.status !== "DRAFT" ? <a href={`/i/${inv.publicToken}`} target="_blank" rel="noreferrer" className="break-all text-brand hover:underline">/i/{inv.publicToken.slice(0, 10)}…</a> : null },
                { label: "Updated", value: relTime(inv.updatedAt) },
              ]}
            />
          </Panel>
          <Panel title={`Payments (${payments.length})`}>
            {payments.length === 0 ? (
              <p className="text-sm text-muted">No payments yet. Online card and bank payments land here automatically; record checks and wires with the button above.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium tabular text-ink">{money(Number(p.amount), { cents: true })}</div>
                      <div className="text-xs text-muted">
                        {label(p.method)} · {fmtDate(p.paidAt, { year: "numeric" })}
                        {p.reference ? ` · ${p.reference}` : ""}
                        {p.recordedBy ? ` · by ${p.recordedBy.name}` : p.stripePaymentIntentId ? " · via Stripe" : ""}
                      </div>
                    </div>
                    {isOwner ? p.quickbooksPaymentId ? <Badge variant="ok">QB</Badge> : qb.connected ? <PaymentSyncButton paymentId={p.id} /> : null : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {isOwner ? (
            <Panel title="QuickBooks">
              <div className="flex items-start gap-2 text-sm">
                <BookOpen className="mt-0.5 size-4 text-muted" />
                <div className="text-ink-2">
                  {qb.connected ? (
                    <>
                      Connected to <span className="font-medium text-ink">{qb.accountName ?? "QuickBooks Online"}</span>
                      {qb.environment === "sandbox" ? " (sandbox)" : ""}.
                      {inv.quickbooksSyncedAt ? <div className="text-xs text-muted">Last synced {relTime(inv.quickbooksSyncedAt)}</div> : <div className="text-xs text-muted">Not synced yet.</div>}
                    </>
                  ) : qb.configured ? (
                    <>
                      Not connected.{" "}
                      <a href="/api/oauth/quickbooks/start" className="font-medium text-brand hover:underline">
                        Connect QuickBooks
                      </a>
                    </>
                  ) : (
                    "Add QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET to enable syncing."
                  )}
                </div>
              </div>
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
            <InvoiceDocument doc={doc} />
          </TabsContent>
          <TabsContent value="timeline">
            <Timeline items={timeline} context={{ contactId: inv.contactId, companyId: inv.companyId, dealId: inv.dealId, quoteId: inv.quoteId }} currentUserId={user.id} canDeleteAny={user.tier !== "EMPLOYEE"} />
          </TabsContent>
        </Tabs>
      </div>

      {inv.status === "DRAFT" ? (
        <InvoiceEditorFromUrl
          initial={{
            id: inv.id,
            title: inv.title ?? "",
            issueDate: inv.issueDate.toISOString().slice(0, 10),
            dueDate: inv.dueDate?.toISOString().slice(0, 10) ?? "",
            paymentTerms: inv.paymentTerms ?? "",
            taxRate: String(Number(inv.taxRate)),
            notes: inv.notes ?? "",
            company: inv.company ? { id: inv.company.id, label: inv.company.name } : null,
            contact: inv.contact ? { id: inv.contact.id, label: fullName(inv.contact) } : null,
            lines: inv.lines.map((l) => ({ key: l.id, description: l.description, quantity: String(l.quantity), unitPrice: String(Number(l.unitPrice)), pricingMode: l.pricingMode })),
          }}
        />
      ) : null}
    </div>
  );
}
