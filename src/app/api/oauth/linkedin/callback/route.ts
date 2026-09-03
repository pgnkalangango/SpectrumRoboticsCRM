import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { sha256 } from "@/lib/crypto";
import { appUrl } from "@/lib/mailer";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { connectLinkedIn, linkedinConfigured } from "@/lib/social/linkedin";

const COOKIE = "hq_oauth_linkedin";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || user.kind !== "STAFF" || user.tier !== "OWNER" || !can(user, "integrations.manage")) return NextResponse.redirect(appUrl("/hq/integrations?error=owners_only"));
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  const cookie = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const clear = (res: NextResponse) => {
    res.cookies.set(COOKIE, "", { path: "/api/oauth/linkedin", maxAge: 0 });
    return res;
  };
  if (!linkedinConfigured()) return clear(NextResponse.redirect(appUrl("/hq/integrations?error=linkedin_not_configured")));
  if (providerError) return clear(NextResponse.redirect(appUrl(`/hq/integrations?error=${encodeURIComponent(providerError)}`)));
  if (!code || !state || !cookie || sha256(cookie) !== state) return clear(NextResponse.redirect(appUrl("/hq/integrations?error=state_mismatch")));
  try {
    const r = await connectLinkedIn(code, appUrl("/api/oauth/linkedin/callback"));
    await audit({ actorId: user.id, action: "connect", entityType: "Connection", entityId: r.connectionId, after: { provider: "LINKEDIN", accounts: r.accounts } });
    return clear(NextResponse.redirect(appUrl(`/hq/integrations?connected=linkedin&accounts=${r.accounts}`)));
  } catch (e) {
    const message = e instanceof Error ? e.message : "LinkedIn connection failed";
    await prisma.integration.updateMany({ where: { key: "linkedin" }, data: { status: "ERROR", lastError: message.slice(0, 500) } });
    return clear(NextResponse.redirect(appUrl(`/hq/integrations?error=${encodeURIComponent(message.slice(0, 200))}`)));
  }
}
