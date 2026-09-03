import { notFound } from "next/navigation";
import { CheckCircle2, Clock, MessageSquare } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/session";
import { portalScope } from "@/lib/portal";
import { fmtDate, fmtDateTime, label, relTime } from "@/lib/utils";
import { PORTAL_STATUS_WORDS, robotLabel, slaPromise } from "@/lib/service";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/badge";
import { Fact, FactGrid, NoCompany, PortalHeader, PortalPanel, portalHref, previewFor } from "@/components/portal/ui";
import { TicketReply } from "@/components/portal/ticket-reply";

export const metadata = { title: "Ticket" };

export default async function PortalTicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ company?: string }> }) {
  const user = await requireClient();
  const { id } = await params;
  const sp = await searchParams;
  const preview = previewFor(user, sp.company);
  const scope = await portalScope(user, sp.company);
  if (!scope.companyId) return <NoCompany />;
  const t = await prisma.ticket.findUnique({
    where: { id },
    select: {
      id: true, number: true, subject: true, description: true, category: true, priority: true, status: true, companyId: true, clientVisible: true, slaDueAt: true, firstResponseAt: true, resolvedAt: true, closedAt: true, resolution: true, createdAt: true, updatedAt: true,
      site: { select: { name: true } },
      robotUnit: { select: { id: true, serialNumber: true, modelName: true, oem: true } },
      assignee: { select: { name: true, image: true, avatarColor: true, title: true } },
      createdBy: { select: { name: true } },
      comments: { where: { internal: false }, orderBy: { createdAt: "asc" }, select: { id: true, body: true, createdAt: true, author: { select: { id: true, name: true, image: true, avatarColor: true, kind: true } } } },
    },
  });
  if (!t || t.companyId !== scope.companyId || !t.clientVisible) notFound();
  const promise = await slaPromise(t.priority);
  const done = t.status === "RESOLVED" || t.status === "CLOSED";

  return (
    <div>
      <PortalHeader back={{ href: portalHref("/portal/support", preview), label: "All tickets" }} title={t.subject} intro={`Ticket ${t.number}, opened ${fmtDate(t.createdAt)}${t.createdBy ? ` by ${t.createdBy.name}` : ""}.`} />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5">
          {t.resolution && done ? (
            <div className="flex gap-3 rounded-2xl border border-ok/40 bg-ok-soft p-5 text-ok">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
              <div>
                <div className="font-display text-[16px] font-semibold">Fixed{t.resolvedAt ? ` on ${fmtDate(t.resolvedAt)}` : ""}</div>
                <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed opacity-90">{t.resolution}</p>
              </div>
            </div>
          ) : null}
          {t.description ? (
            <PortalPanel title="What you told us">
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-2">{t.description}</p>
            </PortalPanel>
          ) : null}
          <PortalPanel title="Conversation" padded={false}>
            {t.comments.length === 0 ? (
              <p className="p-5 text-[15px] text-muted">No replies yet. {done ? "" : "You will see the team's replies here and get an email when one arrives."}</p>
            ) : (
              <ul className="divide-y divide-line">
                {t.comments.map((c) => {
                  const mine = c.author?.id === user.id;
                  const staff = c.author?.kind === "STAFF";
                  const who = c.author?.name ?? "Client";
                  return (
                    <li key={c.id} className={`flex gap-3 px-5 py-4 ${staff ? "bg-brand-mist/60" : ""}`}>
                      <Avatar name={who} src={c.author?.image} color={c.author?.avatarColor} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 text-[14px]">
                          <span className="font-semibold text-ink">{mine ? "You" : who}</span>
                          {staff ? <span className="rounded bg-brand-tint px-1.5 text-[11px] font-semibold text-brand-deep dark:text-brand-bright">Spectrum Robotics</span> : null}
                          <span className="ml-auto text-[12px] text-muted" title={fmtDateTime(c.createdAt)}>{relTime(c.createdAt)}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-2">{c.body}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </PortalPanel>
          <TicketReply ticketId={t.id} preview={preview} closed={done} />
        </div>

        <div className="flex flex-col gap-5">
          <PortalPanel title="Where things stand">
            <div className="flex flex-col gap-4">
              <StatusBadge value={t.status} labelOverride={PORTAL_STATUS_WORDS[t.status]} className="w-fit text-[13px]" />
              <FactGrid cols={2}>
                <Fact label="Priority" value={label(t.priority)} />
                <Fact label="Type" value={label(t.category)} />
                {t.robotUnit ? <Fact label="Robot" value={robotLabel(t.robotUnit)} /> : null}
                {t.site ? <Fact label="Location" value={t.site.name} /> : null}
                <Fact label="Last update" value={relTime(t.updatedAt)} />
              </FactGrid>
              <div className="flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-[14px] text-ink-2">
                {t.firstResponseAt ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : <Clock className="mt-0.5 size-4 shrink-0 text-brand" />}
                <span>{t.firstResponseAt ? `We responded ${relTime(t.firstResponseAt)}.` : promise}</span>
              </div>
            </div>
          </PortalPanel>
          {t.assignee ? (
            <PortalPanel title="Who is helping">
              <div className="flex items-center gap-3">
                <Avatar name={t.assignee.name} src={t.assignee.image} color={t.assignee.avatarColor} size={44} />
                <div>
                  <div className="text-[15px] font-semibold text-ink">{t.assignee.name}</div>
                  <div className="text-[13px] text-muted">{t.assignee.title ?? "Spectrum Robotics"}</div>
                </div>
              </div>
            </PortalPanel>
          ) : (
            <PortalPanel title="Who is helping">
              <p className="flex items-start gap-2 text-[14px] text-muted">
                <MessageSquare className="mt-0.5 size-4 shrink-0" /> Your ticket is in the queue. Someone will pick it up shortly.
              </p>
            </PortalPanel>
          )}
        </div>
      </div>
    </div>
  );
}
