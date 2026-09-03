import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export type TimelineItem = {
  id: string;
  type: string;
  subject: string | null;
  body: string | null;
  occurredAt: string;
  direction: string;
  source: string;
  externalUrl: string | null;
  actorId: string | null;
  actor: { name: string; image: string | null; avatarColor: string | null } | null;
  actorLabel: string | null;
  contact: { id: string; name: string } | null;
  deal: { id: string; name: string } | null;
  quote: { id: string; number: string } | null;
  ticket: { id: string; number: string } | null;
};

export async function getTimeline(where: Prisma.ActivityWhereInput, take = 100): Promise<TimelineItem[]> {
  const rows = await prisma.activity.findMany({
    where,
    orderBy: { occurredAt: "desc" },
    take,
    include: {
      actor: { select: { name: true, image: true, avatarColor: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      deal: { select: { id: true, name: true } },
      quote: { select: { id: true, number: true } },
      ticket: { select: { id: true, number: true } },
    },
  });
  return rows.map((a) => ({
    id: a.id,
    type: a.type,
    subject: a.subject,
    body: a.body,
    occurredAt: a.occurredAt.toISOString(),
    direction: a.direction,
    source: a.source,
    externalUrl: a.externalUrl,
    actorId: a.actorId,
    actor: a.actor,
    actorLabel: a.actorLabel,
    contact: a.contact ? { id: a.contact.id, name: `${a.contact.firstName} ${a.contact.lastName ?? ""}`.trim() } : null,
    deal: a.deal,
    quote: a.quote,
    ticket: a.ticket,
  }));
}
