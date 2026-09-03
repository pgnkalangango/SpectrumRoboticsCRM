import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/session";
import { appUrl } from "@/lib/mailer";
import { audit } from "@/lib/audit";
import { completeQuickbooksOAuth } from "@/lib/quickbooks";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || user.kind !== "STAFF" || user.tier !== "OWNER") return NextResponse.redirect(appUrl("/hq?denied=1"));
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get("qb_oauth_state")?.value;
  jar.delete("qb_oauth_state");
  if (url.searchParams.get("error")) return NextResponse.redirect(appUrl(`/hq/integrations?error=${encodeURIComponent(url.searchParams.get("error") ?? "quickbooks")}`));
  if (!code || !realmId || !state || !expected || state !== expected) return NextResponse.redirect(appUrl("/hq/integrations?error=quickbooks_state"));
  const r = await completeQuickbooksOAuth(code, realmId);
  if (!r.ok) return NextResponse.redirect(appUrl(`/hq/integrations?error=${encodeURIComponent(r.error)}`));
  await audit({ actorId: user.id, action: "connect", entityType: "Integration", entityId: "quickbooks", after: { realmId } });
  return NextResponse.redirect(appUrl("/hq/integrations?connected=quickbooks"));
}
