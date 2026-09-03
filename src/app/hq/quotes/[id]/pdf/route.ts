import { getSessionUser } from "@/lib/session";
import { loadQuoteDoc, pdfResponse } from "@/lib/quotes/load";
import { renderDocumentPdf } from "@/lib/quotes/pdf";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.kind !== "STAFF") return new Response("Sign in as a team member to download this file.", { status: 401 });
  const { id } = await params;
  const loaded = await loadQuoteDoc({ id });
  if (!loaded) return new Response("Not found", { status: 404 });
  const bytes = await renderDocumentPdf(loaded.doc);
  return pdfResponse(bytes, `Quote-${loaded.doc.number}.pdf`);
}
