import { getSessionUser } from "@/lib/session";
import { portalScope } from "@/lib/portal";
import { loadQuoteDoc, pdfResponse } from "@/lib/quotes/load";
import { renderDocumentPdf } from "@/lib/quotes/pdf";

const PORTAL_STATUSES = ["SENT", "VIEWED", "ACCEPTED", "DECLINED", "EXPIRED"];

// Streams the quote PDF to a signed in client, or to a staff member previewing the portal with ?company=<id>.
// The same document renderer the staff and public pages use; the client only ever sees their own company's quotes.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Please sign in to download this file.", { status: 401 });
  const { id } = await ctx.params;
  const company = new URL(req.url).searchParams.get("company");
  const scope = await portalScope(user, company);
  if (!scope.companyId) return new Response("Your account is not linked to a company yet.", { status: 403 });
  const loaded = await loadQuoteDoc({ id });
  if (!loaded || loaded.quote.companyId !== scope.companyId || !PORTAL_STATUSES.includes(loaded.quote.status)) return new Response("Quote not found.", { status: 404 });
  try {
    const bytes = await renderDocumentPdf(loaded.doc);
    return pdfResponse(bytes, `Spectrum-Robotics-Quote-${loaded.quote.number}.pdf`);
  } catch (e) {
    console.error("portal quote pdf failed", e);
    return new Response("The PDF for this quote is not ready yet. Please try again shortly, or ask your Spectrum contact to email it.", { status: 501, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
}
