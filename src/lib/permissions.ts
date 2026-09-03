import type { Tier, UserKind } from "@/generated/prisma/enums";

export const TIER_RANK: Record<Tier, number> = { CLIENT: 0, EMPLOYEE: 1, LEADERSHIP: 2, OWNER: 3 };

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  kind: UserKind;
  tier: Tier;
  permissions: string[];
  companyId?: string | null;
  departmentId?: string | null;
};

// Permission keys. Tiers grant defaults; owners can add or remove per person.
export const PERMISSIONS = {
  "quotes.discount": { label: "Discount quotes", default: ["OWNER"] },
  "quotes.approve": { label: "Approve quotes", default: ["OWNER", "LEADERSHIP"] },
  "catalog.publish": { label: "Publish catalog changes", default: ["OWNER", "LEADERSHIP"] },
  "social.post": { label: "Publish to social channels", default: ["OWNER"] },
  "social.draft": { label: "Draft social posts", default: ["OWNER", "LEADERSHIP", "EMPLOYEE"] },
  "team.manage": { label: "Add and manage team members", default: ["OWNER"] },
  "clients.manage": { label: "Manage client accounts", default: ["OWNER", "LEADERSHIP"] },
  "sops.edit": { label: "Edit SOPs", default: ["OWNER", "LEADERSHIP"] },
  "reports.view": { label: "View leadership reports", default: ["OWNER", "LEADERSHIP"] },
  "finance.view": { label: "View costs and margins", default: ["OWNER"] },
  "integrations.manage": { label: "Manage integrations and MCP", default: ["OWNER"] },
  "settings.manage": { label: "Change company settings", default: ["OWNER"] },
  "automations.manage": { label: "Manage automations", default: ["OWNER", "LEADERSHIP"] },
  "approvals.decide": { label: "Decide approvals", default: ["OWNER", "LEADERSHIP"] },
  "tickets.manage": { label: "Assign and resolve tickets", default: ["OWNER", "LEADERSHIP", "EMPLOYEE"] },
  "audit.view": { label: "View audit log", default: ["OWNER"] },
  "mcp.keys": { label: "Create MCP access keys", default: ["OWNER", "LEADERSHIP"] },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export function atLeast(tier: Tier, min: Tier): boolean {
  return TIER_RANK[tier] >= TIER_RANK[min];
}

export function can(user: Pick<SessionUser, "tier" | "permissions" | "kind"> | null | undefined, key: PermissionKey): boolean {
  if (!user || user.kind !== "STAFF") return false;
  if (user.tier === "OWNER") return true;
  if (user.permissions?.includes(`-${key}`)) return false; // explicit deny
  if (user.permissions?.includes(key)) return true;
  const defaults = PERMISSIONS[key].default as readonly string[];
  return defaults.includes(user.tier);
}

export function isStaff(user: Pick<SessionUser, "kind"> | null | undefined): boolean {
  return user?.kind === "STAFF";
}

export function isClient(user: Pick<SessionUser, "kind"> | null | undefined): boolean {
  return user?.kind === "CLIENT";
}

export const TIER_LABELS: Record<Tier, string> = {
  OWNER: "Owner",
  LEADERSHIP: "Leadership",
  EMPLOYEE: "Employee",
  CLIENT: "Client",
};

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  manager: "Manager",
  sales_rep: "Sales representative",
  tech: "Field technician",
  support: "Support",
  marketing: "Marketing",
  finance: "Finance",
  viewer: "Viewer",
};
