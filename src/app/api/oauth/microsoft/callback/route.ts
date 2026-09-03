import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/session";
import { exchangeMicrosoftCode, storeConnection } from "@/lib/mail/oauth";
import { appUrl } from "@/lib/mailer";
import { audit } from "@/lib/audit";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || user.kind !== "STAFF") return NextResponse.redirect(appUrl("/login?next=/hq/inbox"));
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get("hq_oauth_state")?.value;
  jar.delete("hq_oauth_state");
  if (!code || !state || state !== expected) return NextResponse.redirect(appUrl("/hq/inbox?error=state"));
  try {
    const token = await exchangeMicrosoftCode(code);
    const me = (await (await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName", { headers: { Authorization: `Bearer ${token.access_token}` } })).json()) as { mail?: string; userPrincipalName?: string; displayName?: string };
    const email = (me.mail ?? me.userPrincipalName ?? user.email).toLowerCase();
    await storeConnection({ userId: user.id, provider: "MICROSOFT", token, accountEmail: email, accountName: me.displayName ?? user.name });
    await audit({ actorId: user.id, action: "connect_mailbox", entityType: "Connection", after: { provider: "MICROSOFT", email } });
    return NextResponse.redirect(appUrl("/hq/inbox?connected=microsoft"));
  } catch (e) {
    return NextResponse.redirect(appUrl(`/hq/inbox?error=${encodeURIComponent((e as Error).message)}`));
  }
}
