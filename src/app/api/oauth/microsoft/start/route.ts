import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/session";
import { microsoftAuthorizeUrl, microsoftConfigured } from "@/lib/mail/oauth";
import { randomToken } from "@/lib/crypto";
import { appUrl } from "@/lib/mailer";

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.kind !== "STAFF") return NextResponse.redirect(appUrl("/login?next=/hq/inbox"));
  if (!microsoftConfigured()) return NextResponse.redirect(appUrl("/hq/inbox?error=microsoft-not-configured"));
  const state = randomToken(16);
  const jar = await cookies();
  jar.set("hq_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" });
  return NextResponse.redirect(microsoftAuthorizeUrl(state));
}
