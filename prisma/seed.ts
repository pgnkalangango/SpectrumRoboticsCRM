/* eslint-disable no-console */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { hash } from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { DEFAULT_SETTINGS } from "../src/lib/settings";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const dataDir = path.join(process.cwd(), "prisma", "seed-data");
const readJson = <T,>(f: string): T => JSON.parse(readFileSync(path.join(dataDir, f), "utf8")) as T;

const DEPARTMENTS = [
  { slug: "leadership", name: "Leadership", description: "Owners and company direction.", color: "#0F7C80", sortOrder: 0 },
  { slug: "sales", name: "Sales", description: "Outbound, inbound, quotes and closing.", color: "#149CA0", sortOrder: 10 },
  { slug: "service", name: "Service", description: "Site surveys, installs, maintenance and support tickets.", color: "#2B5FB3", sortOrder: 20 },
  { slug: "marketing", name: "Marketing", description: "Content, campaigns, ads and social.", color: "#B4700F", sortOrder: 30 },
  { slug: "finance", name: "Finance", description: "Invoicing, collections, accounting sync and approvals.", color: "#1F7A4D", sortOrder: 40 },
  { slug: "admin", name: "Admin", description: "Customer setup, scheduling, documents and portal access.", color: "#7A3E9D", sortOrder: 50 },
  { slug: "hr", name: "HR", description: "Hiring, onboarding and people operations.", color: "#B23A48", sortOrder: 60 },
];

const STAGES = [
  { key: "new", label: "New", probability: 5, sortOrder: 0, color: "#9AA4AB" },
  { key: "contacted", label: "Contacted", probability: 10, sortOrder: 10, color: "#6F9AE8" },
  { key: "call_booked", label: "Call booked", probability: 20, sortOrder: 20, color: "#2B5FB3" },
  { key: "discovery", label: "Discovery", probability: 30, sortOrder: 30, color: "#149CA0" },
  { key: "assessment", label: "Assessment", probability: 45, sortOrder: 40, color: "#0F7C80" },
  { key: "quote_sent", label: "Quote sent", probability: 60, sortOrder: 50, color: "#B4700F" },
  { key: "negotiation", label: "Negotiation", probability: 75, sortOrder: 60, color: "#D08A1F" },
  { key: "won", label: "Won", probability: 100, sortOrder: 70, isWon: true, color: "#1F7A4D" },
  { key: "lost", label: "Lost", probability: 0, sortOrder: 80, isLost: true, color: "#B23A48" },
  { key: "nurturing", label: "Nurturing", probability: 5, sortOrder: 90, color: "#7A8A92" },
];

const OWNERS = [
  { email: "pg@spectrumrobotics.ai", name: "PG Nkalang'ango", title: "Associate, Strategic Growth & Technology", phone: "(832) 488-8797", bookingLink: "https://calendar.app.google/jTrXgEpgFc3KHuPJA", territory: "Chicagoland, Illinois, Midwest, Utah, Colorado" },
  { email: "pgnkalangango@gmail.com", name: "PG Nkalang'ango", title: "Associate, Strategic Growth & Technology", phone: "(832) 488-8797", bookingLink: "https://calendar.app.google/jTrXgEpgFc3KHuPJA", territory: "Chicagoland, Illinois, Midwest, Utah, Colorado" },
  { email: "djenkins@spectrumrobotics.ai", name: "Dr Darryl Jenkins", title: "CEO", phone: "(630) 809-9698" },
];

const INTEGRATIONS = [
  { key: "outlook", name: "Microsoft 365 mail and calendar (each person's own)", category: "email", mechanism: "oauth", scope: "per_user", rolloutOrder: 1, secretNames: ["MICROSOFT_GRAPH_CLIENT_ID", "MICROSOFT_GRAPH_CLIENT_SECRET"], config: { scopes: ["offline_access", "User.Read", "Mail.Read", "Mail.Send", "Calendars.ReadWrite", "Contacts.Read"] } },
  { key: "google", name: "Google Workspace mail and calendar (each person's own)", category: "email", mechanism: "oauth", scope: "per_user", rolloutOrder: 2, secretNames: ["GOOGLE_WORKSPACE_CLIENT_ID", "GOOGLE_WORKSPACE_CLIENT_SECRET"], config: { scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/calendar"] } },
  { key: "anthropic", name: "Anthropic (assistant model)", category: "ai", mechanism: "api_key", scope: "shared", rolloutOrder: 3, secretNames: ["ANTHROPIC_API_KEY"] },
  { key: "quickbooks", name: "QuickBooks Online", category: "accounting", mechanism: "oauth", scope: "shared", rolloutOrder: 4, secretNames: ["QUICKBOOKS_CLIENT_ID", "QUICKBOOKS_CLIENT_SECRET"], enabledForTiers: ["OWNER"] },
  { key: "stripe", name: "Stripe (card and ACH payments)", category: "payments", mechanism: "api_key", scope: "shared", rolloutOrder: 5, secretNames: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"], enabledForTiers: ["OWNER"] },
  { key: "linkedin", name: "LinkedIn company page", category: "social", mechanism: "oauth", scope: "shared", rolloutOrder: 6, secretNames: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"], enabledForTiers: ["OWNER", "LEADERSHIP"] },
  { key: "meta", name: "Facebook page and Instagram", category: "social", mechanism: "oauth", scope: "shared", rolloutOrder: 7, secretNames: ["META_APP_ID", "META_APP_SECRET"], enabledForTiers: ["OWNER", "LEADERSHIP"] },
  { key: "canva", name: "Canva (designs and brand kit)", category: "design", mechanism: "mcp", scope: "shared", rolloutOrder: 8, secretNames: ["CANVA_CLIENT_ID", "CANVA_CLIENT_SECRET"], enabledForTiers: ["OWNER", "LEADERSHIP"] },
  { key: "higgsfield", name: "Higgsfield (video and image generation)", category: "media", mechanism: "mcp", scope: "shared", rolloutOrder: 9, enabledForTiers: ["OWNER", "LEADERSHIP"] },
  { key: "creatify", name: "Creatify (AI video ads)", category: "media", mechanism: "mcp", scope: "shared", rolloutOrder: 10, enabledForTiers: ["OWNER", "LEADERSHIP"] },
  { key: "openart", name: "OpenArt (image generation)", category: "media", mechanism: "mcp", scope: "shared", rolloutOrder: 11, enabledForTiers: ["OWNER", "LEADERSHIP"] },
  { key: "slack", name: "Slack (channel notifications)", category: "chat", mechanism: "webhook", scope: "shared", rolloutOrder: 12, secretNames: ["SLACK_WEBHOOK_URL"], enabledForTiers: ["OWNER"] },
];

const AUTOMATIONS = [
  { name: "Quote unviewed after 3 days", description: "Creates a follow up task for the rep when a sent quote has not been opened in 3 days.", trigger: { type: "quote.unviewed", afterDays: 3 }, actions: [{ type: "create_task", title: "Follow up: quote not opened yet", taskType: "follow_up", assignee: "quote_owner", dueInDays: 0 }] },
  { name: "Quote viewed, no answer after 5 days", description: "Nudge task when a client opened a quote but has not accepted or declined.", trigger: { type: "quote.viewed_no_response", afterDays: 5 }, actions: [{ type: "create_task", title: "Check in on the quote they opened", taskType: "follow_up", assignee: "quote_owner" }] },
  { name: "Critical ticket opened", description: "Notify owners and the on call technician the moment a critical ticket is created.", trigger: { type: "ticket.created", priority: "CRITICAL" }, actions: [{ type: "notify_tier", tier: "OWNER", title: "Critical ticket opened" }, { type: "notify_assignee" }] },
  { name: "Deal won", description: "When a deal is won: create the customer setup task, the install project, and notify Finance.", trigger: { type: "deal.stage_changed", to: "won" }, actions: [{ type: "create_task", title: "Set up the new customer (ADMIN-001)", taskType: "onboarding", assignee: "deal_owner", sop: "admin-new-customer-setup" }, { type: "create_project", projectType: "install" }, { type: "notify_department", department: "finance", title: "Deal won, invoice when ready" }] },
  { name: "Deal quiet for 14 days", description: "Task for the owner when an open deal has no activity for 14 days.", trigger: { type: "deal.stale", afterDays: 14 }, actions: [{ type: "create_task", title: "Deal has gone quiet, decide the next step", taskType: "follow_up", assignee: "deal_owner" }] },
  { name: "Invoice overdue", description: "Reminder task on due date + 1, + 7 and + 14 following the collections SOP.", trigger: { type: "invoice.overdue", days: [1, 7, 14] }, actions: [{ type: "create_task", title: "Send payment reminder (FIN-001)", taskType: "follow_up", assignee: "invoice_owner" }] },
  { name: "Maintenance due in 14 days", description: "Creates the maintenance visit task two weeks before a robot's next maintenance date.", trigger: { type: "robot.maintenance_due", beforeDays: 14 }, actions: [{ type: "create_task", title: "Schedule 90 day maintenance (SVC-003)", taskType: "maintenance", assignee: "site_technician" }] },
  { name: "RaaS term ending in 60 days", description: "Renewal deal and owner heads up 60 days before a RaaS term ends.", trigger: { type: "robot.raas_ending", beforeDays: 60 }, actions: [{ type: "create_deal", dealType: "RENEWAL" }, { type: "notify_tier", tier: "LEADERSHIP", title: "RaaS renewal coming up" }] },
  { name: "Weekly pipeline digest", description: "Every Monday morning, email leadership the pipeline by stage and owner, quotes waiting, and overdue invoices.", trigger: { type: "schedule", cron: "0 13 * * 1" }, actions: [{ type: "digest", to: "LEADERSHIP", report: "pipeline_weekly" }] },
];

const SAVED_PROMPTS = [
  { title: "What should I do first today?", prompt: "Look at my overdue and due today tasks, deals with no next step, and quotes waiting on a reply. Tell me the three things I should do first and why.", scope: "company", sortOrder: 0 },
  { title: "Who is waiting on a reply from me?", prompt: "Search my email for the last two weeks and list every thread where the last message is from someone else and I have not replied. Group by customer.", scope: "company", sortOrder: 1 },
  { title: "Prep me for my next meeting", prompt: "Look at my calendar for the next meeting with an external person. Pull their contact and company timeline, open deals, quotes and tickets, and give me a one paragraph brief plus three questions to ask.", scope: "company", sortOrder: 2 },
  { title: "Draft a follow up in my voice", prompt: "Draft a short follow up email (under 90 words, no demo offer, booking link included) to the contact I name next, using my voice profile and the sequence templates SOP.", scope: "company", sortOrder: 3 },
  { title: "Email stats this month", prompt: "From my mailbox, how many emails did I send and receive this month, how many prospects replied, and what is my median reply time? Show a short table.", scope: "company", sortOrder: 4 },
  { title: "How do I handle this?", prompt: "A customer asked me something I am not sure about. I will paste it next. Find the SOP that applies, quote the relevant steps, and draft my reply.", scope: "company", sortOrder: 5 },
  { title: "Pipeline check", prompt: "Give me a pipeline summary: open value by stage and owner, what is stale, which quotes are waiting, and what changed this week.", scope: "department", department: "Leadership", sortOrder: 6 },
  { title: "Open tickets by SLA", prompt: "List open tickets sorted by SLA deadline, flag any breached or within 4 hours, and suggest who should take each unassigned one.", scope: "department", department: "Service", sortOrder: 7 },
  { title: "Overdue invoices", prompt: "List every overdue invoice with days late, balance and last reminder sent, and draft the next reminder per the collections SOP.", scope: "department", department: "Finance", sortOrder: 8 },
  { title: "This week's social posts", prompt: "Draft three LinkedIn posts and two Instagram captions for this week from our recent deployments and SOP approved claims. Run the proof and claims check on each.", scope: "department", department: "Marketing", sortOrder: 9 },
];

type B44Product = { name: string; product_id?: string | null; oem?: string | null; category?: string; description?: string; tagline?: string; price?: number | null; raas_monthly_price?: number | null; monthly_lease_36mo?: number | null; internal_cost?: number | null; price_display_prefix?: string; published?: boolean; image?: string | null; specifications?: string; features?: unknown; sort_order?: number; stripe_product_id?: string | null; record_type?: string; essential_accessories?: string; accessory_for?: string };
type B44Sop = { slug: string; title: string; summary?: string; body?: string; steps?: unknown; category?: string; scope?: string; department?: string; keywords?: string[]; tags?: string[]; applies_to?: string[]; requires_acknowledgment?: boolean; enforced_by_system?: string; review_date?: string; source?: string; version?: number; published_at?: string };
type ManualSop = { slug: string; code: string; title: string; department: string; category: string; scope: "COMPANY" | "DEPARTMENT"; status?: string; summary: string; keywords: string[]; appliesTo: string[]; requiresAcknowledgment: boolean; enforcedBySystem?: string; body: string; steps: unknown };
type Crm = {
  companies: { name: string; website?: string; industry?: string; city?: string; state?: string; street?: string; zip?: string; status: string }[];
  contacts: { firstName: string; lastName?: string; email?: string; company?: string; jobTitle?: string; phoneOffice?: string; phoneMobile?: string; type?: string; leadSource?: string; linkedinUrl?: string; owner?: string; notes?: string }[];
  deals: { name: string; company: string; value: number; stage: string; probability?: number; owner?: string; channel?: string; notes?: string }[];
  quotes: { number: string; title: string; company: string; contactEmail?: string; contactName?: string; rep: string; status: string; validUntil: string; taxRate: number; delivery: number; install: number; discountPct?: number; lines: [string, number, number, number?][] }[];
};

async function main() {
  console.log("Seeding Spectrum HQ…");

  // Departments
  const deptBySlug: Record<string, string> = {};
  for (const d of DEPARTMENTS) {
    const row = await prisma.department.upsert({ where: { slug: d.slug }, create: d, update: { name: d.name, description: d.description, color: d.color, sortOrder: d.sortOrder } });
    deptBySlug[d.slug] = row.id;
  }
  const deptByName = (name?: string) => (name ? deptBySlug[name.toLowerCase()] ?? null : null);

  // Pipeline stages
  for (const s of STAGES) await prisma.pipelineStage.upsert({ where: { key: s.key }, create: s, update: s });

  // Settings
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({ where: { key }, create: { key, value: value as object }, update: {} });
  }

  // Owners
  const seedPassword = process.env.SEED_OWNER_PASSWORD ?? "SpectrumHQ-2026!";
  const passwordHash = await hash(seedPassword, 12);
  const userByEmail: Record<string, string> = {};
  for (const o of OWNERS) {
    const u = await prisma.user.upsert({
      where: { email: o.email },
      create: { ...o, passwordHash, kind: "STAFF", tier: "OWNER", roleLabel: "admin", status: "ACTIVE", emailVerified: new Date(), departmentId: deptBySlug.leadership, approvalLimitPct: 100, permissions: ["social.post"] },
      update: { name: o.name, title: o.title, phone: o.phone, bookingLink: o.bookingLink, territory: o.territory, tier: "OWNER", kind: "STAFF", departmentId: deptBySlug.leadership },
    });
    userByEmail[o.email] = u.id;
  }
  const ownerId = userByEmail["pg@spectrumrobotics.ai"];
  const userFor = (email?: string | null) => (email ? userByEmail[email.toLowerCase()] ?? null : null);

  // Integrations registry
  for (const i of INTEGRATIONS) {
    const { key, ...rest } = i;
    await prisma.integration.upsert({
      where: { key },
      create: { key, ...rest, status: key === "anthropic" && process.env.ANTHROPIC_API_KEY ? "CONNECTED" : "NOT_CONFIGURED", enabledForTiers: (rest.enabledForTiers as ("OWNER" | "LEADERSHIP" | "EMPLOYEE")[] | undefined) ?? ["OWNER", "LEADERSHIP", "EMPLOYEE"] },
      update: { name: rest.name, category: rest.category, mechanism: rest.mechanism, scope: rest.scope, rolloutOrder: rest.rolloutOrder, secretNames: rest.secretNames ?? [] },
    });
  }

  // Products
  const products = readJson<{ entities: B44Product[] }>("base44-products.json").entities;
  let productCount = 0;
  for (const p of products) {
    const sku = p.product_id?.trim() || null;
    const data = {
      name: p.name,
      oem: p.oem ?? null,
      category: p.category ?? "Service Robot",
      description: [p.tagline, p.description].filter(Boolean).join("\n\n") || null,
      imageUrl: p.image ? `https://spectrumrobotics.ai${p.image}` : null,
      purchasePrice: p.price ?? null,
      monthlyPrice: p.raas_monthly_price ?? p.monthly_lease_36mo ?? null,
      internalCost: p.internal_cost ?? null,
      priceDisplayPrefix: p.price_display_prefix ?? "from",
      published: p.published ?? true,
      specs: { specifications: p.specifications ?? null, features: p.features ?? null, recordType: p.record_type ?? null, essentialAccessories: p.essential_accessories ?? null, accessoryFor: p.accessory_for ?? null },
      sortOrder: p.sort_order ?? 0,
      stripeProductId: p.stripe_product_id ?? null,
      warrantyMonths: 12,
    };
    if (sku) await prisma.product.upsert({ where: { sku }, create: { sku, ...data }, update: data });
    else {
      const existing = await prisma.product.findFirst({ where: { name: p.name, sku: null } });
      if (existing) await prisma.product.update({ where: { id: existing.id }, data });
      else await prisma.product.create({ data });
    }
    productCount++;
  }

  // CRM records
  const crm = readJson<Crm>("crm.json");
  const companyByName: Record<string, string> = {};
  for (const c of crm.companies) {
    const domain = c.website ? new URL(c.website).hostname.replace(/^www\./, "") : null;
    const existing = await prisma.company.findFirst({ where: { name: c.name } });
    const data = { name: c.name, website: c.website ?? null, domain, industry: c.industry ?? null, addressCity: c.city ?? null, addressState: c.state ?? null, addressStreet: c.street ?? null, addressZip: c.zip ?? null, status: c.status as "PROSPECT" | "ACTIVE" | "PARTNER" | "INACTIVE" | "COMPETITOR", ownerId: ownerId, source: "migration" };
    const row = existing ? await prisma.company.update({ where: { id: existing.id }, data }) : await prisma.company.create({ data });
    companyByName[c.name] = row.id;
  }
  const contactByEmail: Record<string, string> = {};
  for (const c of crm.contacts) {
    const companyId = c.company ? companyByName[c.company] ?? null : null;
    const existing = c.email ? await prisma.contact.findFirst({ where: { email: c.email } }) : await prisma.contact.findFirst({ where: { firstName: c.firstName, lastName: c.lastName ?? null, companyId } });
    const data = { firstName: c.firstName, lastName: c.lastName ?? null, email: c.email ?? null, companyId, companyName: c.company ?? null, jobTitle: c.jobTitle ?? null, phoneOffice: c.phoneOffice ?? null, phoneMobile: c.phoneMobile ?? null, type: (c.type ?? "LEAD") as "LEAD" | "PROSPECT" | "CLIENT" | "PARTNER" | "VENDOR" | "OTHER", leadSource: c.leadSource ?? null, linkedinUrl: c.linkedinUrl ?? null, ownerId: userFor(c.owner) ?? ownerId, notes: c.notes ?? null };
    const row = existing ? await prisma.contact.update({ where: { id: existing.id }, data }) : await prisma.contact.create({ data });
    if (c.email) contactByEmail[c.email.toLowerCase()] = row.id;
  }
  for (const d of crm.deals) {
    const companyId = companyByName[d.company] ?? null;
    const existing = await prisma.deal.findFirst({ where: { name: d.name, companyId } });
    const data = { name: d.name, companyId, value: d.value, stageKey: d.stage, probability: d.probability ?? null, ownerId: userFor(d.owner) ?? ownerId, channel: d.channel ?? null, notes: d.notes ?? null, nextStep: existing?.nextStep ?? "Confirm decision timeline with Hollywood Casino Joliet" };
    if (existing) await prisma.deal.update({ where: { id: existing.id }, data });
    else await prisma.deal.create({ data });
  }
  for (const q of crm.quotes) {
    const companyId = companyByName[q.company] ?? null;
    const contactId = q.contactEmail ? contactByEmail[q.contactEmail.toLowerCase()] ?? null : q.contactName ? (await prisma.contact.findFirst({ where: { firstName: q.contactName.split(" ")[0], companyId } }))?.id ?? null : null;
    const subtotal = q.lines.reduce((a, [, qty, unit, disc]) => a + qty * unit * (1 - (disc ?? 0) / 100), 0);
    const discountTotal = (subtotal * (q.discountPct ?? 0)) / 100;
    const taxable = subtotal - discountTotal + q.delivery + q.install;
    const taxAmount = Math.round(taxable * (q.taxRate / 100) * 100) / 100;
    const total = Math.round((taxable + taxAmount) * 100) / 100;
    const data = {
      title: q.title,
      companyId,
      contactId,
      ownerId: userFor(q.rep) ?? userByEmail["djenkins@spectrumrobotics.ai"],
      status: q.status as "DRAFT" | "PENDING_APPROVAL",
      validUntil: new Date(q.validUntil),
      subtotal,
      discountTotal,
      deliveryFee: q.delivery,
      installFee: q.install,
      taxRate: q.taxRate,
      taxAmount,
      oneTimeTotal: total,
      monthlyTotal: 0,
      total,
      terms: DEFAULT_SETTINGS.quotes.defaultTerms,
      internalNotes: `Migrated from the Ultimate CRM. Rep on record: ${q.rep}.`,
    };
    const row = await prisma.quote.upsert({ where: { number: q.number }, create: { number: q.number, ...data }, update: data });
    await prisma.quoteLine.deleteMany({ where: { quoteId: row.id } });
    await prisma.quoteLine.createMany({ data: q.lines.map(([description, quantity, unitPrice, discountPct], i) => ({ quoteId: row.id, description, quantity, unitPrice, discountPct: discountPct ?? 0, total: quantity * unitPrice * (1 - (discountPct ?? 0) / 100), pricingMode: "ONE_TIME", sortOrder: i })) });
  }

  // SOPs from the HQ library (outreach playbook and owner policies)
  const b44Sops = readJson<{ entities: B44Sop[] }>("base44-sops.json").entities;
  let sopCount = 0;
  for (const s of b44Sops) {
    const data = {
      title: s.title,
      summary: s.summary ?? null,
      body: s.body ?? "",
      steps: (s.steps as object) ?? undefined,
      category: s.category ?? "procedure",
      scope: (s.scope === "company" ? "COMPANY" : "DEPARTMENT") as "COMPANY" | "DEPARTMENT",
      departmentId: s.department && s.department !== "All" ? deptByName(s.department) : null,
      ownerId,
      status: "PUBLISHED" as const,
      version: s.version ?? 1,
      keywords: s.keywords ?? [],
      tags: s.tags ?? [],
      appliesTo: s.applies_to ?? [],
      requiresAcknowledgment: !!s.requires_acknowledgment,
      enforcedBySystem: s.enforced_by_system || null,
      reviewDate: s.review_date ? new Date(s.review_date) : null,
      publishedAt: s.published_at ? new Date(s.published_at) : new Date(),
      source: s.source ?? "outreach playbook",
    };
    const row = await prisma.sop.upsert({ where: { slug: s.slug }, create: { slug: s.slug, ...data }, update: data });
    await prisma.sopVersion.upsert({ where: { sopId_version: { sopId: row.id, version: row.version } }, create: { sopId: row.id, version: row.version, title: row.title, body: row.body, steps: row.steps ?? undefined, changeNote: "Imported", changedById: ownerId }, update: {} });
    sopCount++;
  }
  // SOPs from the master manual and the department set
  for (const file of ["manual-sops.json", "department-sops.json"]) {
    for (const s of readJson<ManualSop[]>(file)) {
      const data = {
        code: s.code,
        title: s.title,
        summary: s.summary,
        body: s.body,
        steps: s.steps as object,
        category: s.category,
        scope: s.scope,
        departmentId: deptByName(s.department),
        ownerId,
        status: (s.status ?? "PUBLISHED") as "PUBLISHED" | "DRAFT",
        keywords: s.keywords,
        appliesTo: s.appliesTo,
        requiresAcknowledgment: s.requiresAcknowledgment,
        enforcedBySystem: s.enforcedBySystem || null,
        reviewDate: new Date("2026-12-01"),
        publishedAt: new Date(),
        source: file === "manual-sops.json" ? "master SOP manual (Nov 2025)" : "department set drafted Sep 2026",
      };
      const row = await prisma.sop.upsert({ where: { slug: s.slug }, create: { slug: s.slug, ...data }, update: data });
      await prisma.sopVersion.upsert({ where: { sopId_version: { sopId: row.id, version: row.version } }, create: { sopId: row.id, version: row.version, title: row.title, body: row.body, steps: row.steps ?? undefined, changeNote: "Imported", changedById: ownerId }, update: {} });
      sopCount++;
    }
  }

  // Automations and saved prompts
  for (const a of AUTOMATIONS) {
    const existing = await prisma.automation.findFirst({ where: { name: a.name } });
    if (!existing) await prisma.automation.create({ data: { ...a, createdById: ownerId } });
  }
  for (const p of SAVED_PROMPTS) {
    const existing = await prisma.savedPrompt.findFirst({ where: { title: p.title, scope: p.scope } });
    if (!existing) await prisma.savedPrompt.create({ data: p });
  }

  console.log(`Done. ${DEPARTMENTS.length} departments, ${STAGES.length} stages, ${OWNERS.length} owners, ${productCount} products, ${crm.companies.length} companies, ${crm.contacts.length} contacts, ${crm.deals.length} deals, ${crm.quotes.length} quotes, ${sopCount} SOPs, ${AUTOMATIONS.length} automations.`);
  if (!process.env.SEED_OWNER_PASSWORD) console.log(`Owner accounts use the default password "${seedPassword}". Change it after first sign in or set SEED_OWNER_PASSWORD before seeding.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
