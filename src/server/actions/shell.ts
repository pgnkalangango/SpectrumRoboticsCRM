"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { actionUser } from "@/lib/session";

export async function markNotificationsRead(ids?: string[]) {
  const user = await actionUser();
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
  revalidatePath("/hq");
  return { ok: true };
}

export async function completeTour(tourKey = "hq") {
  const user = await actionUser();
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { onboarding: true } });
  const onboarding = ((row?.onboarding as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  const tours = ((onboarding.tours as Record<string, string>) ?? {}) as Record<string, string>;
  tours[tourKey] = new Date().toISOString();
  await prisma.user.update({ where: { id: user.id }, data: { onboarding: { ...onboarding, tours, tourCompleted: true } } });
  return { ok: true };
}

export async function heartbeat() {
  const user = await actionUser();
  await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } }).catch(() => null);
  return { ok: true };
}
