// Pure helpers and option lists for the service module. Safe to import from client components
// (no Prisma, no settings). Server code gets the same exports plus the SLA helpers from "@/lib/service".
import type { Ownership, RobotStatus, TicketPriority, TicketStatus } from "@/generated/prisma/enums";

export const TICKET_STATUS_STEPS: { value: TicketStatus; label: string; hint: string }[] = [
  { value: "NEW", label: "New", hint: "Logged. Nobody has responded yet." },
  { value: "ACKNOWLEDGED", label: "Acknowledged", hint: "We told the customer we are on it." },
  { value: "IN_PROGRESS", label: "In progress", hint: "Someone is actively working the issue." },
  { value: "WAITING_CUSTOMER", label: "Waiting customer", hint: "We need something from the customer." },
  { value: "WAITING_OEM", label: "Waiting OEM", hint: "Parts or answers needed from the manufacturer." },
  { value: "RESOLVED", label: "Resolved", hint: "Fixed. Waiting for the customer to confirm." },
  { value: "CLOSED", label: "Closed", hint: "Done and confirmed." },
];

export const OPEN_TICKET_STATUSES: TicketStatus[] = ["NEW", "ACKNOWLEDGED", "IN_PROGRESS", "WAITING_CUSTOMER", "WAITING_OEM"];

export const TICKET_PRIORITIES: { value: TicketPriority; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
];

// What clients pick from. Critical is reserved for staff.
export const PORTAL_PRIORITIES: { value: "LOW" | "NORMAL" | "HIGH"; label: string; description: string }[] = [
  { value: "LOW", label: "Low", description: "A question or a small request. Nothing is stopping you." },
  { value: "NORMAL", label: "Normal", description: "The robot still works, but something is not right." },
  { value: "HIGH", label: "High", description: "A robot is down, stuck or unsafe and you need it back." },
];

export const PORTAL_STATUS_WORDS: Record<TicketStatus, string> = {
  NEW: "Received",
  ACKNOWLEDGED: "We are on it",
  IN_PROGRESS: "Being worked on",
  WAITING_CUSTOMER: "Waiting for you",
  WAITING_OEM: "Waiting for parts",
  RESOLVED: "Fixed",
  CLOSED: "Closed",
};

export const ROBOT_STATUSES: { value: RobotStatus; label: string }[] = [
  { value: "IN_STOCK", label: "In stock" },
  { value: "RESERVED", label: "Reserved" },
  { value: "DEPLOYED", label: "Deployed" },
  { value: "IN_SERVICE", label: "In service" },
  { value: "RETURNED", label: "Returned" },
  { value: "RETIRED", label: "Retired" },
];

export const ROBOT_STATUS_LABELS: Record<RobotStatus, string> = Object.fromEntries(ROBOT_STATUSES.map((s) => [s.value, s.label])) as Record<RobotStatus, string>;

// Plain words for clients.
export const ROBOT_STATUS_WORDS: Record<RobotStatus, string> = {
  IN_STOCK: "Being prepared",
  RESERVED: "Reserved for you",
  DEPLOYED: "Running at your site",
  IN_SERVICE: "Being serviced",
  RETURNED: "Returned",
  RETIRED: "Retired",
};

export const OWNERSHIPS: { value: Ownership; label: string }[] = [
  { value: "RAAS", label: "Robot as a Service" },
  { value: "PURCHASED", label: "Purchased" },
  { value: "DEMO", label: "Demo" },
  { value: "LOANER", label: "Loaner" },
];
export const OWNERSHIP_LABELS: Record<Ownership, string> = Object.fromEntries(OWNERSHIPS.map((s) => [s.value, s.label])) as Record<Ownership, string>;

export const SITE_STATUSES = [
  { value: "PROSPECT", label: "Prospect" },
  { value: "SURVEY_SCHEDULED", label: "Survey scheduled" },
  { value: "SURVEYED", label: "Surveyed" },
  { value: "INSTALL_SCHEDULED", label: "Install scheduled" },
  { value: "LIVE", label: "Live" },
  { value: "PAUSED", label: "Paused" },
  { value: "CHURNED", label: "Churned" },
];

export const MAINTENANCE_TYPES = [
  { value: "scheduled", label: "Scheduled service" },
  { value: "repair", label: "Repair" },
  { value: "firmware", label: "Firmware update" },
  { value: "inspection", label: "Inspection" },
];

export const DOCUMENT_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "contract", label: "Contract" },
  { value: "quote", label: "Quote" },
  { value: "invoice", label: "Invoice" },
  { value: "manual", label: "Manual" },
  { value: "photo", label: "Photo" },
  { value: "certificate", label: "Certificate" },
];

export const TIMEZONES = [
  { value: "America/New_York", label: "Eastern" },
  { value: "America/Chicago", label: "Central" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Phoenix", label: "Arizona" },
  { value: "America/Los_Angeles", label: "Pacific" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
];

export function addDaysTo(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

// Next service date: last maintenance, else install date, plus the interval. Null when neither date is known.
export function computeNextMaintenance(lastMaintenance: Date | null | undefined, installDate: Date | null | undefined, intervalDays: number): Date | null {
  const base = lastMaintenance ?? installDate ?? null;
  if (!base) return null;
  return addDaysTo(base, Math.max(1, intervalDays || 90));
}

export function isWithinDays(d: Date | string | null | undefined, days: number): boolean {
  if (!d) return false;
  const t = new Date(d).getTime();
  const now = Date.now();
  return t >= now && t - now <= days * 86400000;
}

// SLA tone for a ticket: breached (bad), due within 4 hours (warn), otherwise muted. Closed tickets get none.
export function slaTone(slaDueAt: Date | string | null | undefined, status: TicketStatus): "bad" | "warn" | "muted" | "none" {
  if (!slaDueAt || status === "RESOLVED" || status === "CLOSED") return "none";
  const diff = new Date(slaDueAt).getTime() - Date.now();
  if (diff < 0) return "bad";
  if (diff <= 4 * 3600000) return "warn";
  return "muted";
}

export function humanizeHours(hours: number): string {
  if (hours <= 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} business day${days === 1 ? "" : "s"}`;
}

export function toDateInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

export function toDateTimeInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

export function robotLabel(r: { modelName?: string | null; oem?: string | null; serialNumber: string }): string {
  return `${r.modelName ?? r.oem ?? "Robot"} · ${r.serialNumber}`;
}
