import { allowRequest } from "@/lib/quotes/ratelimit";
import { loadQuoteDoc, pdfResponse } from "@/lib/quotes/load";
import { renderDocumentPdf } from "@/lib/quotes/pdf";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || !allowRequest(`q:${token}`)) return new Response("Too many requests. Please wait a minute.", { status: 429 });
  const loaded = await loadQuoteDoc({ publicToken: token });
  if (!loaded || loaded.quote.status === "DRAFT") return new Response("Not found", { status: 404 });
  const bytes = await renderDocumentPdf(loaded.doc);
  return pdfResponse(bytes, `Quote-${loaded.doc.number}.pdf`);
}
