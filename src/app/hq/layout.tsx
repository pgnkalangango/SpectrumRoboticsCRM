import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { HQ_NAV, screenForPath } from "@/lib/nav";
import { atLeast, can } from "@/lib/permissions";
import { Providers } from "@/components/providers";
import { HqShell } from "@/components/hq/shell";

export default async function HqLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaff();
  const h = await headers();
  const pathname = h.get("x-pathname") ?? h.get("next-url") ?? "/hq";
  const screen = screenForPath(pathname);

  const [user, notifications, pendingApprovals, screenSops] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.id }, select: { id: true, name: true, email: true, image: true, tier: true, avatarColor: true, title: true, onboarding: true, department: { select: { name: true } } } }),
    prisma.notification.findMany({ where: { userId: session.id }, orderBy: { createdAt: "desc" }, take: 15 }),
    can(session, "approvals.decide") ? prisma.approval.count({ where: { status: "PENDING" } }) : Promise.resolve(0),
    screen ? prisma.sop.findMany({ where: { status: "PUBLISHED", appliesTo: { has: `screen:${screen}` } }, select: { slug: true, title: true, summary: true, category: true }, take: 8 }) : Promise.resolve([]),
  ]);
  if (!user) return null;

  const nav = HQ_NAV.map((g) => ({ ...g, items: g.items.filter((i) => atLeast(session.tier, i.minTier) && (!i.permission || can(session, i.permission))) })).filter((g) => g.items.length > 0);
  const onboarding = (user.onboarding as { tourCompleted?: boolean } | null) ?? null;

  return (
    <Providers>
      <HqShell
        user={{ id: user.id, name: user.name, email: user.email, image: user.image, tier: user.tier, avatarColor: user.avatarColor, title: user.title, department: user.department?.name ?? null, tourDone: !!onboarding?.tourCompleted }}
        nav={nav}
        notifications={notifications.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, type: n.type, createdAt: n.createdAt.toISOString(), readAt: n.readAt?.toISOString() ?? null }))}
        pendingApprovals={pendingApprovals}
        screenSops={screenSops}
      >
        {children}
      </HqShell>
    </Providers>
  );
}
