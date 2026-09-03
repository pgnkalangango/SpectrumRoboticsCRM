// Client safe SOP option lists and shared types. No Prisma here so client components can import freely.

export type SopStep = { title: string; detail?: string | null; required?: boolean };
export type QuizQuestion = { question: string; options: string[]; answerIndex: number };

export const SOP_CATEGORIES = [
  { value: "policy", label: "Policy", hint: "Rules everyone follows" },
  { value: "procedure", label: "Procedure", hint: "Step by step how we do a job" },
  { value: "checklist", label: "Checklist", hint: "Tick off before you finish" },
  { value: "playbook", label: "Playbook", hint: "Scripts and sequences" },
  { value: "reference", label: "Reference", hint: "Facts, lists, templates" },
  { value: "onboarding", label: "Onboarding", hint: "First weeks in a role" },
  { value: "best_practice", label: "Best practice", hint: "What good looks like" },
] as const;

export type SopCategory = (typeof SOP_CATEGORIES)[number]["value"];

export const CATEGORY_TONE: Record<string, "default" | "brand" | "ok" | "warn" | "bad" | "info" | "outline" | "dark"> = {
  policy: "bad",
  procedure: "brand",
  checklist: "ok",
  playbook: "info",
  reference: "default",
  onboarding: "warn",
  best_practice: "outline",
};

export const APPLIES_TO_OPTIONS: { value: string; label: string; group: "Task" | "Screen" | "Stage" }[] = [
  { value: "task:email", label: "Email", group: "Task" },
  { value: "task:call", label: "Call", group: "Task" },
  { value: "task:follow_up", label: "Follow up", group: "Task" },
  { value: "task:quote", label: "Quote", group: "Task" },
  { value: "task:meeting", label: "Meeting", group: "Task" },
  { value: "task:survey", label: "Site survey", group: "Task" },
  { value: "task:install", label: "Install", group: "Task" },
  { value: "task:maintenance", label: "Maintenance", group: "Task" },
  { value: "task:onboarding", label: "Onboarding", group: "Task" },
  { value: "screen:my_day", label: "My Day", group: "Screen" },
  { value: "screen:inbox", label: "Inbox", group: "Screen" },
  { value: "screen:tasks", label: "Tasks", group: "Screen" },
  { value: "screen:assistant", label: "Assistant", group: "Screen" },
  { value: "screen:contacts", label: "Contacts", group: "Screen" },
  { value: "screen:companies", label: "Companies", group: "Screen" },
  { value: "screen:deals", label: "Deals", group: "Screen" },
  { value: "screen:quotes", label: "Quotes", group: "Screen" },
  { value: "screen:invoices", label: "Invoices", group: "Screen" },
  { value: "screen:sites", label: "Sites", group: "Screen" },
  { value: "screen:robots", label: "Robots", group: "Screen" },
  { value: "screen:tickets", label: "Tickets", group: "Screen" },
  { value: "screen:marketing", label: "Marketing", group: "Screen" },
  { value: "screen:campaigns", label: "Campaigns", group: "Screen" },
  { value: "screen:sops", label: "SOPs", group: "Screen" },
  { value: "screen:catalog", label: "Catalog", group: "Screen" },
  { value: "screen:approvals", label: "Approvals", group: "Screen" },
  { value: "screen:reports", label: "Reports", group: "Screen" },
  { value: "screen:team", label: "Team", group: "Screen" },
  { value: "screen:clients", label: "Client accounts", group: "Screen" },
  { value: "screen:settings", label: "Settings", group: "Screen" },
  { value: "screen:integrations", label: "Integrations", group: "Screen" },
  { value: "screen:mcp", label: "MCP", group: "Screen" },
  { value: "screen:portal_home", label: "Portal home", group: "Screen" },
  { value: "screen:portal_support", label: "Portal support", group: "Screen" },
  { value: "stage:new", label: "New", group: "Stage" },
  { value: "stage:contacted", label: "Contacted", group: "Stage" },
  { value: "stage:call_booked", label: "Call booked", group: "Stage" },
  { value: "stage:discovery", label: "Discovery", group: "Stage" },
  { value: "stage:assessment", label: "Assessment", group: "Stage" },
  { value: "stage:quote_sent", label: "Quote sent", group: "Stage" },
  { value: "stage:negotiation", label: "Negotiation", group: "Stage" },
  { value: "stage:won", label: "Won", group: "Stage" },
  { value: "stage:lost", label: "Lost", group: "Stage" },
  { value: "stage:nurturing", label: "Nurturing", group: "Stage" },
];

export function appliesToLabel(value: string): string {
  const found = APPLIES_TO_OPTIONS.find((o) => o.value === value);
  if (found) return `${found.group}: ${found.label}`;
  const [group, rest] = value.split(":");
  return `${group ? group[0].toUpperCase() + group.slice(1) : ""}: ${(rest ?? value).replace(/_/g, " ")}`;
}

export function categoryLabel(value: string): string {
  return SOP_CATEGORIES.find((c) => c.value === value)?.label ?? value.replace(/_/g, " ");
}

export function parseSteps(v: unknown): SopStep[] {
  if (!Array.isArray(v)) return [];
  return v.filter((s): s is SopStep => !!s && typeof s === "object" && typeof (s as SopStep).title === "string");
}

export function parseQuiz(v: unknown): QuizQuestion[] {
  if (!Array.isArray(v)) return [];
  return v.filter((q): q is QuizQuestion => !!q && typeof q === "object" && typeof (q as QuizQuestion).question === "string" && Array.isArray((q as QuizQuestion).options));
}
