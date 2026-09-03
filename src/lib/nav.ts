import type { Tier } from "@/generated/prisma/enums";
import type { PermissionKey } from "@/lib/permissions";

// One nav list, filtered by tier and permission. `screen` is the key SOPs and the help drawer link to.
export type NavItem = { to: string; label: string; icon: string; screen: string; minTier: Tier; permission?: PermissionKey; end?: boolean; tour?: string };
export type NavGroup = { group: string; items: NavItem[] };

export const HQ_NAV: NavGroup[] = [
  {
    group: "Work",
    items: [
      { to: "/hq", end: true, label: "My Day", icon: "Sun", screen: "my_day", minTier: "EMPLOYEE", tour: "my-day" },
      { to: "/hq/inbox", label: "Inbox", icon: "Inbox", screen: "inbox", minTier: "EMPLOYEE", tour: "inbox" },
      { to: "/hq/tasks", label: "Tasks", icon: "CheckSquare", screen: "tasks", minTier: "EMPLOYEE" },
      { to: "/hq/assistant", label: "Assistant", icon: "Sparkles", screen: "assistant", minTier: "EMPLOYEE", tour: "assistant" },
    ],
  },
  {
    group: "Sales",
    items: [
      { to: "/hq/contacts", label: "Contacts", icon: "Users", screen: "contacts", minTier: "EMPLOYEE", tour: "contacts" },
      { to: "/hq/companies", label: "Companies", icon: "Building2", screen: "companies", minTier: "EMPLOYEE" },
      { to: "/hq/deals", label: "Deals", icon: "Kanban", screen: "deals", minTier: "EMPLOYEE", tour: "deals" },
      { to: "/hq/quotes", label: "Quotes", icon: "FileText", screen: "quotes", minTier: "EMPLOYEE", tour: "quotes" },
      { to: "/hq/invoices", label: "Invoices", icon: "Receipt", screen: "invoices", minTier: "EMPLOYEE" },
    ],
  },
  {
    group: "Service",
    items: [
      { to: "/hq/service/sites", label: "Sites", icon: "MapPin", screen: "sites", minTier: "EMPLOYEE" },
      { to: "/hq/service/robots", label: "Robots", icon: "Bot", screen: "robots", minTier: "EMPLOYEE" },
      { to: "/hq/service/tickets", label: "Tickets", icon: "LifeBuoy", screen: "tickets", minTier: "EMPLOYEE", tour: "tickets" },
    ],
  },
  {
    group: "Marketing",
    items: [
      { to: "/hq/marketing", label: "Content", icon: "Megaphone", screen: "marketing", minTier: "EMPLOYEE" },
      { to: "/hq/marketing/campaigns", label: "Campaigns", icon: "Flag", screen: "campaigns", minTier: "EMPLOYEE" },
    ],
  },
  {
    group: "Company",
    items: [
      { to: "/hq/sops", label: "SOPs", icon: "BookOpen", screen: "sops", minTier: "EMPLOYEE", tour: "sops" },
      { to: "/hq/catalog", label: "Catalog", icon: "Package", screen: "catalog", minTier: "EMPLOYEE" },
      { to: "/hq/approvals", label: "Approvals", icon: "ShieldCheck", screen: "approvals", minTier: "EMPLOYEE" },
      { to: "/hq/reports", label: "Reports", icon: "BarChart3", screen: "reports", minTier: "LEADERSHIP", permission: "reports.view" },
    ],
  },
  {
    group: "Admin",
    items: [
      { to: "/hq/team", label: "Team", icon: "UserCog", screen: "team", minTier: "LEADERSHIP" },
      { to: "/hq/clients", label: "Client accounts", icon: "KeyRound", screen: "clients", minTier: "LEADERSHIP", permission: "clients.manage" },
      { to: "/hq/automations", label: "Automations", icon: "Workflow", screen: "automations", minTier: "LEADERSHIP", permission: "automations.manage" },
      { to: "/hq/integrations", label: "Integrations", icon: "Plug", screen: "integrations", minTier: "OWNER", permission: "integrations.manage" },
      { to: "/hq/mcp", label: "MCP", icon: "Network", screen: "mcp", minTier: "LEADERSHIP" },
      { to: "/hq/settings", label: "Settings", icon: "Settings", screen: "settings", minTier: "OWNER", permission: "settings.manage" },
      { to: "/hq/audit", label: "Audit log", icon: "ScrollText", screen: "audit", minTier: "OWNER", permission: "audit.view" },
    ],
  },
];

export const PORTAL_NAV: NavItem[] = [
  { to: "/portal", end: true, label: "Home", icon: "Home", screen: "portal_home", minTier: "CLIENT" },
  { to: "/portal/quotes", label: "Quotes", icon: "FileText", screen: "portal_quotes", minTier: "CLIENT" },
  { to: "/portal/invoices", label: "Invoices", icon: "Receipt", screen: "portal_invoices", minTier: "CLIENT" },
  { to: "/portal/robots", label: "My robots", icon: "Bot", screen: "portal_robots", minTier: "CLIENT" },
  { to: "/portal/support", label: "Support", icon: "LifeBuoy", screen: "portal_support", minTier: "CLIENT" },
  { to: "/portal/documents", label: "Documents", icon: "FolderOpen", screen: "portal_documents", minTier: "CLIENT" },
  { to: "/portal/training", label: "Training", icon: "GraduationCap", screen: "portal_training", minTier: "CLIENT" },
  { to: "/portal/profile", label: "My profile", icon: "UserRound", screen: "portal_profile", minTier: "CLIENT" },
];

export function screenForPath(pathname: string): string | null {
  for (const g of HQ_NAV) for (const i of g.items) if (i.end ? pathname === i.to : pathname.startsWith(i.to)) return i.screen;
  return null;
}
