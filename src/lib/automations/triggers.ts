// Trigger and action shapes for automations. Pure module (no Prisma) so the editor UI can use it.
// The JSON stored in Automation.trigger / Automation.actions follows the seed exactly.

export type TriggerType = "quote.unviewed" | "quote.viewed_no_response" | "ticket.created" | "deal.stage_changed" | "deal.stale" | "invoice.overdue" | "robot.maintenance_due" | "robot.raas_ending" | "schedule";
export type TriggerKind = "time" | "event" | "schedule";

export type Trigger = {
  type: TriggerType;
  afterDays?: number;
  beforeDays?: number;
  days?: number[];
  priority?: string;
  from?: string;
  to?: string;
  cron?: string;
};

export type Condition = { field: "owner" | "industry"; value: string };

export type AssigneeKey = "quote_owner" | "deal_owner" | "invoice_owner" | "site_technician" | `user:${string}`;

export type AutomationAction =
  | { type: "create_task"; title: string; taskType?: string; assignee?: string; dueInDays?: number; sop?: string; priority?: string }
  | { type: "notify_tier"; tier: "OWNER" | "LEADERSHIP"; title: string }
  | { type: "notify_assignee"; title?: string }
  | { type: "notify_department"; department: string; title: string }
  | { type: "create_project"; projectType: string }
  | { type: "create_deal"; dealType: string }
  | { type: "digest"; to: string; report: string }
  | { type: "slack"; text: string }
  | { type: "email"; toRole: string; subject: string; body: string };

export type ActionType = AutomationAction["type"];

export type TriggerField = { key: keyof Trigger; label: string; kind: "number" | "days" | "select" | "cron" | "text"; hint?: string; options?: { value: string; label: string }[] };

export const TRIGGER_DEFS: { type: TriggerType; kind: TriggerKind; label: string; description: string; fields: TriggerField[] }[] = [
  { type: "quote.unviewed", kind: "time", label: "Quote not opened", description: "A sent quote has not been opened for a number of days.", fields: [{ key: "afterDays", label: "Days since sent", kind: "number" }] },
  { type: "quote.viewed_no_response", kind: "time", label: "Quote opened, no answer", description: "A quote was opened but not accepted or declined.", fields: [{ key: "afterDays", label: "Days since opened", kind: "number" }] },
  { type: "ticket.created", kind: "event", label: "Ticket created", description: "Fires the moment a ticket is created.", fields: [{ key: "priority", label: "Only for priority", kind: "select", options: [{ value: "", label: "Any priority" }, { value: "CRITICAL", label: "Critical" }, { value: "HIGH", label: "High" }, { value: "NORMAL", label: "Normal" }, { value: "LOW", label: "Low" }] }] },
  { type: "deal.stage_changed", kind: "event", label: "Deal moved to a stage", description: "Fires when a deal reaches a stage.", fields: [{ key: "to", label: "Stage key", kind: "text", hint: "For example won, quote_sent, negotiation" }] },
  { type: "deal.stale", kind: "time", label: "Deal gone quiet", description: "An open deal has had no activity for a number of days.", fields: [{ key: "afterDays", label: "Days without activity", kind: "number" }] },
  { type: "invoice.overdue", kind: "time", label: "Invoice overdue", description: "An unpaid invoice is past its due date. Fires once per listed day offset.", fields: [{ key: "days", label: "Days after due date", kind: "days", hint: "Comma separated, for example 1, 7, 14" }] },
  { type: "robot.maintenance_due", kind: "time", label: "Maintenance coming up", description: "A deployed robot's next maintenance date is within a number of days.", fields: [{ key: "beforeDays", label: "Days before the date", kind: "number" }] },
  { type: "robot.raas_ending", kind: "time", label: "RaaS term ending", description: "A Robot as a Service term ends within a number of days.", fields: [{ key: "beforeDays", label: "Days before the end", kind: "number" }] },
  { type: "schedule", kind: "schedule", label: "On a schedule", description: "Runs on a cron schedule (UTC). Minutes, hours, day of month, month, day of week.", fields: [{ key: "cron", label: "Cron (UTC)", kind: "cron", hint: "0 13 * * 1 is every Monday at 13:00 UTC (8am Chicago)" }] },
];

export const ACTION_DEFS: { type: ActionType; label: string; description: string }[] = [
  { type: "create_task", label: "Create a task", description: "A task for the right person, linked to the record." },
  { type: "notify_tier", label: "Notify owners or leadership", description: "In app notification to everyone at a tier." },
  { type: "notify_assignee", label: "Notify the assignee or owner", description: "In app notification to the person responsible for the record." },
  { type: "notify_department", label: "Notify a department", description: "In app notification to everyone in a department." },
  { type: "create_project", label: "Create a project", description: "For example an install project when a deal is won." },
  { type: "create_deal", label: "Create a deal", description: "For example a renewal deal before a RaaS term ends." },
  { type: "digest", label: "Send a digest", description: "Email a report to a tier, a department or an address." },
  { type: "slack", label: "Post to Slack", description: "Posts a message to the SLACK_WEBHOOK_URL channel." },
  { type: "email", label: "Send an email", description: "System email to a tier, a department or an address." },
];

export const ASSIGNEE_OPTIONS: { value: string; label: string }[] = [
  { value: "quote_owner", label: "Quote owner" },
  { value: "deal_owner", label: "Deal owner" },
  { value: "invoice_owner", label: "Invoice owner" },
  { value: "site_technician", label: "Site technician" },
];

export const DIGEST_REPORTS = [{ value: "pipeline_weekly", label: "Weekly pipeline digest" }];

export const TRIGGER_LABEL: Record<TriggerType, string> = Object.fromEntries(TRIGGER_DEFS.map((d) => [d.type, d.label])) as Record<TriggerType, string>;

export function triggerKind(type: string): TriggerKind {
  return TRIGGER_DEFS.find((d) => d.type === type)?.kind ?? "time";
}

export function parseTrigger(json: unknown): Trigger {
  const t = (json ?? {}) as Partial<Trigger>;
  const type = (TRIGGER_DEFS.some((d) => d.type === t.type) ? t.type : "schedule") as TriggerType;
  return {
    type,
    afterDays: t.afterDays !== undefined ? Number(t.afterDays) : undefined,
    beforeDays: t.beforeDays !== undefined ? Number(t.beforeDays) : undefined,
    days: Array.isArray(t.days) ? t.days.map(Number).filter((n) => Number.isFinite(n)) : undefined,
    priority: t.priority || undefined,
    from: t.from || undefined,
    to: t.to || undefined,
    cron: t.cron || undefined,
  };
}

export function parseActions(json: unknown): AutomationAction[] {
  if (!Array.isArray(json)) return [];
  return json.filter((a) => a && typeof a === "object" && typeof (a as { type?: unknown }).type === "string") as AutomationAction[];
}

export function parseConditions(json: unknown): Condition[] {
  if (!Array.isArray(json)) return [];
  return json.filter((c) => c && typeof c === "object" && (c as Condition).field && (c as Condition).value) as Condition[];
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function describeTrigger(t: Trigger): string {
  switch (t.type) {
    case "quote.unviewed":
      return `When a sent quote has not been opened for ${plural(t.afterDays ?? 3, "day")}`;
    case "quote.viewed_no_response":
      return `When a quote was opened but not answered for ${plural(t.afterDays ?? 5, "day")}`;
    case "ticket.created":
      return t.priority ? `When a ${t.priority.toLowerCase()} ticket is created` : "When any ticket is created";
    case "deal.stage_changed":
      return t.to ? `When a deal moves to ${t.to.replace(/_/g, " ")}` : "When a deal changes stage";
    case "deal.stale":
      return `When an open deal has no activity for ${plural(t.afterDays ?? 14, "day")}`;
    case "invoice.overdue":
      return `When an invoice is ${(t.days ?? [1]).map((d) => `${d}`).join(", ")} day${(t.days ?? []).length === 1 ? "" : "s"} past due`;
    case "robot.maintenance_due":
      return `${plural(t.beforeDays ?? 14, "day")} before a robot's next maintenance`;
    case "robot.raas_ending":
      return `${plural(t.beforeDays ?? 60, "day")} before a RaaS term ends`;
    case "schedule":
      return `On a schedule: ${describeCron(t.cron ?? "")}`;
  }
}

export function describeAction(a: AutomationAction): string {
  switch (a.type) {
    case "create_task":
      return `Task "${a.title}" for the ${(a.assignee ?? "deal_owner").replace(/^user:.*/, "chosen person").replace(/_/g, " ")}${a.dueInDays ? `, due in ${plural(a.dueInDays, "day")}` : ""}`;
    case "notify_tier":
      return `Notify ${a.tier === "OWNER" ? "owners" : "leadership"}: "${a.title}"`;
    case "notify_assignee":
      return "Notify the person responsible";
    case "notify_department":
      return `Notify ${a.department}: "${a.title}"`;
    case "create_project":
      return `Create ${a.projectType} project`;
    case "create_deal":
      return `Create ${a.dealType.toLowerCase().replace(/_/g, " ")} deal`;
    case "digest":
      return `Email the ${a.report.replace(/_/g, " ")} to ${a.to.toLowerCase()}`;
    case "slack":
      return "Post to Slack";
    case "email":
      return `Email ${a.toRole.toLowerCase()}: "${a.subject}"`;
    default:
      return "Unknown action";
  }
}

export function describeActions(actions: AutomationAction[]): string {
  return actions.map(describeAction).join(" · ");
}

// ───────────────────────────── Tiny cron matcher ─────────────────────────────
// Five fields: minute hour day-of-month month day-of-week. Supports numbers, *, lists (1,3,5),
// ranges (1-5) and steps (*/15). Evaluated in UTC.

function fieldMatches(field: string, value: number, min: number, max: number): boolean {
  return field.split(",").some((part) => {
    const p = part.trim();
    if (p === "*") return true;
    const step = p.includes("/") ? Number(p.split("/")[1]) : 1;
    const base = p.includes("/") ? p.split("/")[0] : p;
    let lo = min;
    let hi = max;
    if (base !== "*") {
      if (base.includes("-")) {
        const [a, b] = base.split("-").map(Number);
        lo = a;
        hi = b;
      } else {
        const n = Number(base);
        if (!Number.isFinite(n)) return false;
        if (step === 1) return n === value;
        lo = n;
        hi = max;
      }
    }
    if (value < lo || value > hi) return false;
    return (value - lo) % (Number.isFinite(step) && step > 0 ? step : 1) === 0;
  });
}

export function cronMatches(expr: string, date: Date): boolean {
  const parts = (expr ?? "").trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [m, h, dom, mon, dow] = parts;
  const dayOfWeek = date.getUTCDay();
  return (
    fieldMatches(m, date.getUTCMinutes(), 0, 59) &&
    fieldMatches(h, date.getUTCHours(), 0, 23) &&
    fieldMatches(dom, date.getUTCDate(), 1, 31) &&
    fieldMatches(mon, date.getUTCMonth() + 1, 1, 12) &&
    (fieldMatches(dow, dayOfWeek, 0, 7) || (dayOfWeek === 0 && fieldMatches(dow, 7, 0, 7)))
  );
}

export function isValidCron(expr: string): boolean {
  const parts = (expr ?? "").trim().split(/\s+/);
  return parts.length === 5 && parts.every((p) => /^[\d*,\-/]+$/.test(p));
}

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function describeCron(expr: string): string {
  if (!isValidCron(expr)) return expr ? `"${expr}" (check the format)` : "no schedule set";
  const [m, h, dom, , dow] = expr.trim().split(/\s+/);
  const time = /^\d+$/.test(m) && /^\d+$/.test(h) ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} UTC` : `minute ${m} of hour ${h}`;
  if (dow !== "*" && /^[\d,]+$/.test(dow)) return `every ${dow.split(",").map((d) => DOW[Number(d)] ?? d).join(" and ")} at ${time}`;
  if (dom !== "*") return `on day ${dom} of the month at ${time}`;
  if (h === "*") return `every hour at minute ${m}`;
  return `every day at ${time}`;
}
