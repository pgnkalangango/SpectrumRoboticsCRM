import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/permissions";
import { fullName } from "@/lib/utils";
import { PageHeader } from "@/components/ui/empty-state";
import { Breadcrumbs } from "@/components/hq/record";
import { QuoteBuilder, type BuilderQuote } from "@/components/hq/quotes/quote-builder";
import { loadCatalog } from "@/lib/quotes/load";

export const metadata = { title: "Edit quote" };

export default async function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const { id } = await params;
  const [q, products] = await Promise.all([
    prisma.quote.findUnique({ where: { id }, include: { lines: { orderBy: { sortOrder: "asc" }, include: { product: { select: { name: true } } } }, company: { select: { id: true, name: true } }, contact: { select: { id: true, firstName: true, lastName: true } }, deal: { select: { id: true, name: true } }, owner: { select: { id: true, name: true } } } }),
    loadCatalog(),
  ]);
  if (!q) notFound();
  if (!["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(q.status)) redirect(`/hq/quotes/${id}`);
  const initial: BuilderQuote = {
    id: q.id,
    number: q.number,
    status: q.status,
    title: q.title,
    company: q.company ? { id: q.company.id, label: q.company.name } : null,
    contact: q.contact ? { id: q.contact.id, label: fullName(q.contact) } : null,
    deal: q.deal ? { id: q.deal.id, label: q.deal.name } : null,
    owner: q.owner ? { id: q.owner.id, label: q.owner.name } : null,
    validUntil: q.validUntil ? q.validUntil.toISOString().slice(0, 10) : "",
    taxRate: String(Number(q.taxRate)),
    deliveryFee: String(Number(q.deliveryFee)),
    installFee: String(Number(q.installFee)),
    notes: q.notes ?? "",
    terms: q.terms ?? "",
    internalNotes: q.internalNotes ?? "",
    lines: q.lines.map((l) => ({ key: l.id, productId: l.productId, productName: l.product?.name ?? null, description: l.description, quantity: String(l.quantity), unitPrice: String(Number(l.unitPrice)), pricingMode: l.pricingMode, discountPct: String(Number(l.discountPct)) })),
  };
  return (
    <div>
      <Breadcrumbs items={[{ label: "Quotes", href: "/hq/quotes" }, { label: q.number, href: `/hq/quotes/${q.id}` }, { label: "Edit" }]} />
      <PageHeader title={`Edit ${q.number}`} subtitle={q.status === "APPROVED" ? "This quote was approved. Saving changes puts it back in draft, so a discount would need approval again." : q.status === "PENDING_APPROVAL" ? "Saving withdraws the pending approval request." : "Changes are saved as a draft. Send from the quote page when it looks right."} />
      <QuoteBuilder initial={initial} products={products} canDiscount={can(user, "quotes.discount")} />
    </div>
  );
}
