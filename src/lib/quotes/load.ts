// Server side loaders shared by the staff pages, the public pages and the PDF routes.
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { invoiceToDoc, quoteToDoc, type InvoiceDoc, type QuoteDoc } from "@/lib/quotes/document";
import type { Prisma } from "@/generated/prisma/client";

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

export function pdfResponse(bytes: Uint8Array, filename: string): Response {
  return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"`, "Cache-Control": "private, no-store" } });
}
