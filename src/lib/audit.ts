import { prisma } from "@/lib/prisma";
import type { ActivityType, Direction } from "@/generated/prisma/enums";

export async function audit(params: {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: params.actorId ?? undefined,
        actorEmail: params.actorEmail ?? undefined,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? undefined,
        before: params.before === undefined ? undefined : (params.before as object),
        after: params.after === undefined ? undefined : (params.after as object),
      },
    });
  } catch (e) {
    console.warn("audit log failed", e);
  }
}

// Every write that matters lands on the timeline.
export async function logActivity(params: {
  type?: ActivityType;
  subject?: string;
  body?: string;
  contactId?: string | null;
  companyId?: string | null;
  dealId?: string | null;
  quoteId?: string | null;
  invoiceId?: string | null;
  ticketId?: string | null;
  siteId?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
  source?: string;
  direction?: Direction;
  externalId?: string | null;
  externalUrl?: string | null;
  participants?: string[];
  metadata?: unknown;
  occurredAt?: Date;
}) {
  try {
    const row = await prisma.activity.create({
      data: {
        type: params.type ?? "NOTE",
        subject: params.subject,
        body: params.body,
        contactId: params.contactId ?? undefined,
        companyId: params.companyId ?? undefined,
        dealId: params.dealId ?? undefined,
        quoteId: params.quoteId ?? undefined,
        invoiceId: params.invoiceId ?? undefined,
        ticketId: params.ticketId ?? undefined,
        siteId: params.siteId ?? undefined,
        actorId: params.actorId ?? undefined,
        actorLabel: params.actorLabel ?? undefined,
        source: params.source ?? "manual",
        direction: params.direction ?? "INTERNAL",
        externalId: params.externalId ?? undefined,
        externalUrl: params.externalUrl ?? undefined,
        participants: params.participants ?? [],
        metadata: params.metadata === undefined ? undefined : (params.metadata as object),
        occurredAt: params.occurredAt ?? new Date(),
      },
    });
    const touch = { lastActivityAt: new Date() };
    if (params.dealId) await prisma.deal.update({ where: { id: params.dealId }, data: touch }).catch(() => null);
    if (params.contactId && (params.type === "EMAIL_OUT" || params.type === "CALL" || params.type === "MEETING" || params.type === "LINKEDIN")) {
      await prisma.contact.update({ where: { id: params.contactId }, data: { lastContactedAt: new Date() } }).catch(() => null);
    }
    return row;
  } catch (e) {
    console.warn("activity log failed", e);
    return null;
  }
}

export async function notify(params: { userId: string; type?: string; title: string; body?: string; link?: string }) {
  try {
    return await prisma.notification.create({ data: { userId: params.userId, type: params.type ?? "info", title: params.title, body: params.body, link: params.link } });
  } catch (e) {
    console.warn("notify failed", e);
    return null;
  }
}

export async function notifyTier(params: { minTier: "OWNER" | "LEADERSHIP"; type?: string; title: string; body?: string; link?: string; exceptUserId?: string }) {
  const tiers = params.minTier === "OWNER" ? ["OWNER" as const] : ["OWNER" as const, "LEADERSHIP" as const];
  const users = await prisma.user.findMany({ where: { kind: "STAFF", status: "ACTIVE", tier: { in: tiers } }, select: { id: true } });
  await Promise.all(users.filter((u) => u.id !== params.exceptUserId).map((u) => notify({ userId: u.id, type: params.type, title: params.title, body: params.body, link: params.link })));
}
