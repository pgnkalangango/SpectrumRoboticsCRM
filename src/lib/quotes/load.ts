// Server side loaders shared by the staff pages, the public pages and the PDF routes.
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { invoiceToDoc, quoteToDoc, type InvoiceDoc, type QuoteDoc } from "@/lib/quotes/document";
import type { Prisma } from "@/generated/prisma/client";
import type { CatalogProduct } from "@/components/hq/quotes/catalog-picker";

export const quoteDocInclude = {
  lines: { orderBy: { sortOrder: "asc" } },
  company: { select: { id: true, name: true, addressStreet: true, addressCity: true, addressState: true, addressZip: true, phone: true } },
  contact: { select: { id: true, firstName: true, lastName: true, email: true, phoneMobile: true, phoneOffice: true, companyName: true, addressStreet: true, addressCity: true, addressState: true, addressZip: true } },
  owner: { select: { id: true, name: true, email: true, title: true, phone: true, image: true, avatarColor: true } },
} satisfies Prisma.QuoteInclude;

export const invoiceDocInclude = {
  lines: { orderBy: { sortOrder: "asc" } },
  payments: { orderBy: { paidAt: "desc" } },
  quote: { select: { id: true, number: true } },
  company: { select: { id: true, name: true, addressStreet: true, addressCity: true, addressState: true, addressZip: true, phone: true, quickbooksCustomerId: true } },
  contact: { select: { id: true, firstName: true, lastName: true, email: true, phoneMobile: true, phoneOffice: true, companyName: true, addressStreet: true, addressCity: true, addressState: true, addressZip: true } },
  owner: { select: { id: true, name: true, email: true, title: true, phone: true, image: true, avatarColor: true } },
} satisfies Prisma.InvoiceInclude;

export type QuoteWithDoc = Prisma.QuoteGetPayload<{ include: typeof quoteDocInclude }>;
export type InvoiceWithDoc = Prisma.InvoiceGetPayload<{ include: typeof invoiceDocInclude }>;

export async function docSettings() {
  const [quotes, company] = await Promise.all([getSetting("quotes"), getSetting("company")]);
  return { footer: quotes.pdfFooter, company: { name: company.name, address: company.address, phone: company.phone, email: company.email, website: company.website } };
}

export async function loadQuoteDoc(where: Prisma.QuoteWhereUniqueInput): Promise<{ quote: QuoteWithDoc; doc: QuoteDoc } | null> {
  const [quote, s] = await Promise.all([prisma.quote.findUnique({ where, include: quoteDocInclude }), docSettings()]);
  if (!quote) return null;
  return { quote, doc: quoteToDoc(quote, s) };
}

export async function loadInvoiceDoc(where: Prisma.InvoiceWhereUniqueInput): Promise<{ invoice: InvoiceWithDoc; doc: InvoiceDoc } | null> {
  const [invoice, s] = await Promise.all([prisma.invoice.findUnique({ where, include: invoiceDocInclude }), docSettings()]);
  if (!invoice) return null;
  return { invoice, doc: invoiceToDoc(invoice, s) };
}

// Published products for the quote builder's catalog picker. Never includes internalCost.
export async function loadCatalog(): Promise<CatalogProduct[]> {
  const rows = await prisma.product.findMany({ where: { published: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, sku: true, oem: true, category: true, imageUrl: true, purchasePrice: true, monthlyPrice: true, description: true } });
  return rows.map((p) => ({ id: p.id, name: p.name, sku: p.sku, oem: p.oem, category: p.category, imageUrl: p.imageUrl, purchasePrice: p.purchasePrice === null ? null : Number(p.purchasePrice), monthlyPrice: p.monthlyPrice === null ? null : Number(p.monthlyPrice), description: p.description ? p.description.slice(0, 160) : null }));
}

export function pdfResponse(bytes: Uint8Array, filename: string): Response {
  return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"`, "Cache-Control": "private, no-store" } });
}
