import { NextResponse } from "next/server";
import { runScheduledAutomations } from "@/lib/automations/engine";
import { publishDuePosts } from "@/lib/social/publish";
import { sendDigest } from "@/lib/automations/digest";
import { syncAllMailboxes } from "@/lib/mail/people";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Called every 5 to 15 minutes by the host's scheduler.
//   GET /api/cron/automations            Authorization: Bearer <CRON_SECRET>   (or ?key=<CRON_SECRET>)
//   GET /api/cron/automations?digest=1   also sends the weekly pipeline digest right now
// Runs time based automations, publishes scheduled social posts and, through the "schedule"
// automations, sends digests.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET is not set. Add it to the environment before enabling the scheduler." }, { status: 503 });
  const url = new URL(req.url);
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (bearer !== secret && url.searchParams.get("key") !== secret) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const out: Record<string, unknown> = { ok: true, at: now.toISOString() };
  try {
    out.automations = await runScheduledAutomations(now);
  } catch (e) {
    out.automations = { error: e instanceof Error ? e.message : "failed" };
    out.ok = false;
  }
  try {
    out.social = await publishDuePosts(now);
  } catch (e) {
    out.social = { error: e instanceof Error ? e.message : "failed" };
    out.ok = false;
  }
  // Mailboxes: pull new mail, refresh people and follow ups. Once an hour is plenty, so this runs
  // when the minute is under 15 or when ?mail=1 forces it.
  if (url.searchParams.get("mail") === "1" || now.getMinutes() < 15) {
    try {
      out.mail = await syncAllMailboxes();
    } catch (e) {
      out.mail = { error: e instanceof Error ? e.message : "failed" };
    }
  }
  if (url.searchParams.get("digest") === "1") {
    try {
      out.digest = await sendDigest({ to: url.searchParams.get("to") ?? "LEADERSHIP", report: "pipeline_weekly" });
    } catch (e) {
      out.digest = { error: e instanceof Error ? e.message : "failed" };
      out.ok = false;
    }
  }
  return NextResponse.json(out, { status: out.ok ? 200 : 500 });
}
