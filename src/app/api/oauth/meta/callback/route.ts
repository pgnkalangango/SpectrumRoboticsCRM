import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { sha256 } from "@/lib/crypto";
import { appUrl } from "@/lib/mailer";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { connectMeta, metaConfigured } from "@/lib/social/meta";

const COOKIE = "hq_oauth_meta";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || user.kind !== "STAFF" || user.tier !== "OWNER" || !can(user, "integrations.manage")) return NextResponse.redirect(appUrl("/hq/integrations?error=owners_only"));
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  const cookie = req.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const clear = (res: NextResponse) => {
    res.cookies.set(COOKIE, "", { path: "/api/oauth/meta", maxAge: 0 });
    return res;
  };
  if (!metaConfigured()) return clear(NextResponse.redirect(appUrl("/hq/integrations?error=meta_not_configured")));
  if (providerError) return clear(NextResponse.redirect(appUrl(`/hq/integrations?error=${encodeURIComponent(providerError)}`)));
  if (!code || !state || !cookie || sha256(cookie) !== state) return clear(NextResponse.redirect(appUrl("/hq/integrations?error=state_mismatch")));
  try {
    const r = await connectMeta(code, appUrl("/api/oauth/meta/callback"));
    await audit({ actorId: user.id, action: "connect", entityType: "Connection", entityId: r.connectionId, after: { provider: "META", pages: r.pages, instagram: r.instagram } });
    return clear(NextResponse.redirect(appUrl(`/hq/integrations?connected=meta&accounts=${r.pages + r.instagram}`)));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Meta connection failed";
    await prisma.integration.updateMany({ where: { key: "meta" }, data: { status: "ERROR", lastError: message.slice(0, 500) } });
    return clear(NextResponse.redirect(appUrl(`/hq/integrations?error=${encodeURIComponent(message.slice(0, 200))}`)));
  }
}
