import { allowRequest } from "@/lib/quotes/ratelimit";
import { loadInvoiceDoc, pdfResponse } from "@/lib/quotes/load";
import { renderDocumentPdf } from "@/lib/quotes/pdf";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || !allowRequest(`i:${token}`)) return new Response("Too many requests. Please wait a minute.", { status: 429 });
  const loaded = await loadInvoiceDoc({ publicToken: token });
  if (!loaded || loaded.invoice.status === "DRAFT") return new Response("Not found", { status: 404 });
  const bytes = await renderDocumentPdf(loaded.doc);
  return pdfResponse(bytes, `Invoice-${loaded.doc.number}.pdf`);
}
