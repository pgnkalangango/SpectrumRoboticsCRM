import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getSetting } from "@/lib/settings";
import { fullName } from "@/lib/utils";
import { PageHeader } from "@/components/ui/empty-state";
import { Breadcrumbs } from "@/components/hq/record";
import { loadCatalog } from "@/lib/quotes/load";
import { QuoteBuilder, type BuilderQuote } from "@/components/hq/quotes/quote-builder";

export const metadata = { title: "New quote" };

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ contactId?: string; companyId?: string; dealId?: string }> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const [settings, products] = await Promise.all([getSetting("quotes"), loadCatalog()]);
  const [contact, deal] = await Promise.all([
    sp.contactId ? prisma.contact.findUnique({ where: { id: sp.contactId }, select: { id: true, firstName: true, lastName: true, companyId: true, company: { select: { id: true, name: true } } } }) : null,
    sp.dealId ? prisma.deal.findUnique({ where: { id: sp.dealId }, select: { id: true, name: true, companyId: true, primaryContactId: true, company: { select: { id: true, name: true } }, primaryContact: { select: { id: true, firstName: true, lastName: true } } } }) : null,
  ]);
  const companyId = sp.companyId ?? contact?.companyId ?? deal?.companyId ?? null;
  const company = companyId ? await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true } }) : null;
  const pickedContact = contact ?? deal?.primaryContact ?? null;
  const validUntilDate = new Date();
  validUntilDate.setDate(validUntilDate.getDate() + settings.validityDays);
  const validUntil = validUntilDate.toISOString().slice(0, 10);
  const initial: BuilderQuote = {
    title: deal ? deal.name : company ? `${company.name} robotics proposal` : "",
    company: company ? { id: company.id, label: company.name } : null,
    contact: pickedContact ? { id: pickedContact.id, label: fullName(pickedContact) } : null,
    deal: deal ? { id: deal.id, label: deal.name } : null,
    owner: { id: user.id, label: user.name },
    validUntil,
    taxRate: String(settings.taxRate ?? 0),
    deliveryFee: "0",
    installFee: "0",
    notes: "",
    terms: settings.defaultTerms,
    internalNotes: "",
    lines: [],
  };
  return (
    <div>
      <Breadcrumbs items={[{ label: "Quotes", href: "/hq/quotes" }, { label: "New quote" }]} />
      <PageHeader title="New quote" subtitle="Add items from the catalog, set fees and tax, and save a draft. Send it from the quote page." />
      <QuoteBuilder initial={initial} products={products} canDiscount={can(user, "quotes.discount")} />
    </div>
  );
}
