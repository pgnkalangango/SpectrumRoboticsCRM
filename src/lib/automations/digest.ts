// Weekly pipeline digest: open pipeline by stage and owner, quotes waiting, overdue invoices and
// open tickets by priority. Sent by email through sendSystemMail and optionally posted to Slack.
import { prisma } from "@/lib/prisma";
import { appUrl, sendSystemMail } from "@/lib/mailer";
import { money } from "@/lib/utils";

export type DigestReport = "pipeline_weekly";

export function slackConfigured(): boolean {
  return !!process.env.SLACK_WEBHOOK_URL;
}

export async function postSlack(text: string): Promise<{ ok: boolean; reason?: string }> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return { ok: false, reason: "SLACK_WEBHOOK_URL is not set" };
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    if (!r.ok) return { ok: false, reason: `Slack returned ${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Slack request failed" };
  }
}

// "to" can be a tier (OWNER, LEADERSHIP), a department slug (finance) or an email address.
export async function resolveRecipients(to: string): Promise<{ id: string | null; email: string; name: string }[]> {
  const key = (to ?? "").trim();
  if (!key) return [];
  if (key.includes("@")) return [{ id: null, email: key, name: key }];
  const upper = key.toUpperCase();
  if (upper === "OWNER" || upper === "LEADERSHIP") {
    const tiers = upper === "OWNER" ? ["OWNER" as const] : ["OWNER" as const, "LEADERSHIP" as const];
    return prisma.user.findMany({ where: { kind: "STAFF", status: "ACTIVE", tier: { in: tiers } }, select: { id: true, email: true, name: true } });
  }
  if (upper === "EMPLOYEE" || upper === "ALL" || upper === "STAFF") return prisma.user.findMany({ where: { kind: "STAFF", status: "ACTIVE" }, select: { id: true, email: true, name: true } });
  return prisma.user.findMany({ where: { kind: "STAFF", status: "ACTIVE", department: { slug: key.toLowerCase() } }, select: { id: true, email: true, name: true } });
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function buildPipelineDigest(): Promise<{ subject: string; html: string; text: string; slack: string }> {
  const now = new Date();
  const [stages, openDeals, quotesWaiting, overdueInvoices, openTickets] = await Promise.all([
    prisma.pipelineStage.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.deal.findMany({ where: { stage: { isWon: false, isLost: false } }, include: { owner: { select: { name: true } }, company: { select: { name: true } }, stage: true } }),
    prisma.quote.findMany({ where: { status: { in: ["SENT", "VIEWED"] } }, include: { company: { select: { name: true } }, owner: { select: { name: true } } }, orderBy: { sentAt: "asc" } }),
    prisma.invoice.findMany({ where: { status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"] }, dueDate: { lt: now } }, include: { company: { select: { name: true } } }, orderBy: { dueDate: "asc" } }),
    prisma.ticket.groupBy({ by: ["priority"], where: { status: { notIn: ["RESOLVED", "CLOSED"] } }, _count: { _all: true } }),
  ]);

  const byStage = stages.filter((s) => !s.isWon && !s.isLost).map((s) => {
    const deals = openDeals.filter((d) => d.stageKey === s.key);
    return { label: s.label, count: deals.length, value: deals.reduce((a, d) => a + Number(d.value), 0), monthly: deals.reduce((a, d) => a + Number(d.monthlyValue), 0) };
  }).filter((r) => r.count > 0);
  const ownerMap = new Map<string, { count: number; value: number }>();
  for (const d of openDeals) {
    const key = d.owner?.name ?? "Unassigned";
    const cur = ownerMap.get(key) ?? { count: 0, value: 0 };
    ownerMap.set(key, { count: cur.count + 1, value: cur.value + Number(d.value) });
  }
  const byOwner = [...ownerMap.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.value - a.value);
  const totalValue = openDeals.reduce((a, d) => a + Number(d.value), 0);
  const weighted = openDeals.reduce((a, d) => a + (Number(d.value) * (d.probability ?? d.stage.probability)) / 100, 0);
  const priorityOrder = ["CRITICAL", "HIGH", "NORMAL", "LOW"];
  const tickets = priorityOrder.map((p) => ({ priority: p, count: openTickets.find((t) => t.priority === p)?._count._all ?? 0 })).filter((t) => t.count > 0);
  const dateLabel = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const subject = `Pipeline digest, ${dateLabel}: ${money(totalValue)} open across ${openDeals.length} deal${openDeals.length === 1 ? "" : "s"}`;
  const link = appUrl("/hq/reports");

  const daysLate = (d: Date | null) => (d ? Math.max(1, Math.round((now.getTime() - d.getTime()) / 86400000)) : 0);
  const table = (headers: string[], rows: string[][]) => `<table style="border-collapse:collapse;width:100%;margin:8px 0 18px;font-size:14px"><thead><tr>${headers.map((h) => `<th style="text-align:left;padding:6px 8px;border-bottom:1px solid #dae3e4;color:#6e7780;font-size:12px;text-transform:uppercase">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td style="padding:6px 8px;border-bottom:1px solid #eef2f3">${esc(c)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${headers.length}" style="padding:6px 8px;color:#9aa4ab">Nothing here this week.</td></tr>`}</tbody></table>`;
  const h2 = (t: string) => `<h2 style="font-size:15px;margin:22px 0 4px;color:#141517">${esc(t)}</h2>`;

  const html = [
    `<h1 style="font-size:20px;margin:0 0 4px">Weekly pipeline digest</h1><p style="margin:0;color:#6e7780">${esc(dateLabel)} · ${money(totalValue)} open, ${money(weighted)} weighted by stage</p>`,
    h2("Open pipeline by stage"),
    table(["Stage", "Deals", "One time", "Monthly"], byStage.map((r) => [r.label, String(r.count), money(r.value), money(r.monthly)])),
    h2("By owner"),
    table(["Owner", "Deals", "Value"], byOwner.map((r) => [r.name, String(r.count), money(r.value)])),
    h2("Quotes waiting on a reply"),
    table(["Quote", "Company", "Rep", "Status", "Sent"], quotesWaiting.map((q) => [`${q.number} ${q.title}`, q.company?.name ?? "", q.owner?.name ?? "", q.status === "VIEWED" ? "Opened" : "Sent", q.sentAt ? `${daysLate(q.sentAt)} days ago` : ""])),
    h2("Overdue invoices"),
    table(["Invoice", "Company", "Balance", "Days late"], overdueInvoices.map((i) => [i.number, i.company?.name ?? "", money(Number(i.balanceDue), { cents: true }), String(daysLate(i.dueDate))])),
    h2("Open tickets by priority"),
    table(["Priority", "Open"], tickets.map((t) => [t.priority.charAt(0) + t.priority.slice(1).toLowerCase(), String(t.count)])),
    `<p style="margin-top:20px"><a href="${link}" style="color:#149CA0;font-weight:600">Open the reports dashboard</a></p>`,
  ].join("");

  const lines = [
    `*Weekly pipeline digest* (${dateLabel})`,
    `${money(totalValue)} open across ${openDeals.length} deals, ${money(weighted)} weighted.`,
    "",
    "*By stage*",
    ...(byStage.length ? byStage.map((r) => `• ${r.label}: ${r.count} deal${r.count === 1 ? "" : "s"}, ${money(r.value)}`) : ["• No open deals"]),
    "",
    "*By owner*",
    ...(byOwner.length ? byOwner.map((r) => `• ${r.name}: ${r.count}, ${money(r.value)}`) : ["• Nobody has open deals"]),
    "",
    `*Quotes waiting on a reply*: ${quotesWaiting.length}`,
    ...quotesWaiting.slice(0, 8).map((q) => `• ${q.number} ${q.company?.name ?? ""} (${q.status === "VIEWED" ? "opened" : "sent"} ${q.sentAt ? `${daysLate(q.sentAt)}d ago` : ""})`),
    "",
    `*Overdue invoices*: ${overdueInvoices.length}${overdueInvoices.length ? `, ${money(overdueInvoices.reduce((a, i) => a + Number(i.balanceDue), 0))} outstanding` : ""}`,
    ...overdueInvoices.slice(0, 8).map((i) => `• ${i.number} ${i.company?.name ?? ""}: ${money(Number(i.balanceDue))} (${daysLate(i.dueDate)} days late)`),
    "",
    `*Open tickets*: ${tickets.length ? tickets.map((t) => `${t.count} ${t.priority.toLowerCase()}`).join(", ") : "none"}`,
    "",
    link,
  ];
  const text = lines.join("\n").replace(/\*/g, "");
  return { subject, html, text, slack: lines.join("\n") };
}

export async function sendDigest(opts: { to: string; report: DigestReport | string; slack?: boolean }): Promise<{ recipients: string[]; delivered: boolean; slack: boolean; reason?: string }> {
  if (opts.report !== "pipeline_weekly") return { recipients: [], delivered: false, slack: false, reason: `Unknown report ${opts.report}` };
  const digest = await buildPipelineDigest();
  const recipients = await resolveRecipients(opts.to);
  let delivered = false;
  for (const r of recipients) {
    const res = await sendSystemMail({ to: r.email, subject: digest.subject, html: digest.html, text: digest.text });
    delivered = delivered || res.delivered;
  }
  let slackOk = false;
  if (opts.slack ?? slackConfigured()) slackOk = (await postSlack(digest.slack)).ok;
  return { recipients: recipients.map((r) => r.email), delivered, slack: slackOk, reason: recipients.length === 0 ? `No recipients for "${opts.to}"` : undefined };
}
