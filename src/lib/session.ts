import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Tier } from "@/generated/prisma/enums";
import { atLeast, can, type PermissionKey, type SessionUser } from "@/lib/permissions";

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id) return null;
  return {
    id: u.id,
    email: u.email ?? "",
    name: u.name ?? "",
    image: u.image,
    kind: u.kind,
    tier: u.tier,
    permissions: u.permissions ?? [],
    companyId: u.companyId ?? null,
    departmentId: u.departmentId ?? null,
  };
}

export class AccessDenied extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "AccessDenied";
  }
}

// For server components and route handlers: redirect when not signed in as staff.
export async function requireStaff(minTier: Tier = "EMPLOYEE"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/hq");
  if (user.kind !== "STAFF") redirect("/portal");
  if (!atLeast(user.tier, minTier)) redirect("/hq?denied=1");
  return user;
}

export async function requireClient(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login?as=client&next=/portal");
  return user;
}

// For server actions: throw instead of redirect so the caller gets a readable error.
export async function actionStaff(minTier: Tier = "EMPLOYEE"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || user.kind !== "STAFF") throw new AccessDenied("Please sign in as a team member.");
  if (!atLeast(user.tier, minTier)) throw new AccessDenied();
  return user;
}

export async function actionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AccessDenied("Please sign in.");
  return user;
}

export async function actionCan(key: PermissionKey): Promise<SessionUser> {
  const user = await actionStaff();
  if (!can(user, key)) throw new AccessDenied();
  return user;
}
