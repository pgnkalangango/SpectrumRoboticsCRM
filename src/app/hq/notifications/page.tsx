import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { PageHeader } from "@/components/ui/empty-state";
import { NotificationsList } from "./notifications-list";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireStaff();
  const rows = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 200 });
  const unread = rows.filter((r) => !r.readAt).length;
  return (
    <div>
      <PageHeader title="Notifications" subtitle={unread ? `${unread} unread. Everything that needed your attention, newest first.` : "You are all caught up."} />
      <NotificationsList rows={rows.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() }))} />
    </div>
  );
}
