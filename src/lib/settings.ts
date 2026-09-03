import { prisma } from "@/lib/prisma";

export const DEFAULT_SETTINGS = {
  company: {
    name: "Spectrum Robotics",
    legalName: "Spectrum Robotics LLC",
    address: "1795 Commerce Drive, Elk Grove Village, IL 60007",
    phone: "(630) 809-9698",
    email: "info@spectrumrobotics.ai",
    website: "https://spectrumrobotics.ai",
    tagline: "Providing Innovative Solutions to Meet Industry Demands",
    sendDomain: "spectrumrobotics.ai",
    sendFromName: "Spectrum Robotics",
    timezone: "America/Chicago",
  },
  quotes: {
    counter: 100,
    prefix: "SR",
    validityDays: 30,
    taxRate: 0,
    defaultTerms:
      "Pricing valid until the date shown. Robot as a Service pricing is subject to credit approval. Delivery, installation and training are included unless stated otherwise. Payment terms: net 30 from invoice date unless stated otherwise.",
    discountPolicy: "owners_only",
    pdfFooter: "Spectrum Robotics | 1795 Commerce Drive, Elk Grove Village, IL 60007 | info@spectrumrobotics.ai | (630) 809-9698",
  },
  invoices: { counter: 1000, prefix: "INV", defaultTerms: "Net 30", overdueGraceDays: 0 },
  tickets: { counter: 1000, prefix: "T" },
  pipeline: { staleDays: 14, requireNextStep: true },
  pricingLanguage: { publicPrefix: "from", raasFrom: 799, purchaseFrom: 3800, hideFinancedFigure: true },
  email: {
    footerHtml:
      '<p style="font-size:12px;color:#666">Spectrum Robotics | 1795 Commerce Drive, Elk Grove Village, IL 60007<br/>Reply with the word unsubscribe and we will not contact you again.</p>',
    maxOutreachWords: 100,
    targetOutreachWords: "70-90",
  },
  service: { slaHours: { CRITICAL: 4, HIGH: 24, NORMAL: 72, LOW: 168 }, maintenanceIntervalDays: 90, renewalAlertDays: 60 },
  assistant: {
    model: "claude-opus-5",
    maxTokens: 4000,
    rules: [
      "Cite the SOP section when answering how-to questions",
      "Never invent procedure that is not in the SOP library",
      "Public pricing is always from $X; never state a financed monthly figure",
      "Every email draft ends with the full signature and the company address",
      "No em dashes in drafts",
      "Never promise a demo in outreach; a demo request goes to an owner",
    ],
  },
  leads: { defaultOwnerEmail: "pg@spectrumrobotics.ai", notifyEmails: ["pg@spectrumrobotics.ai"], autoDeal: true },
  social: { requireApproval: true, approverTier: "OWNER" },
  portal: { selfSignup: true, autoApproveMatchingDomain: true, welcomeMessage: "Welcome to your Spectrum Robotics client portal." },
} as const;

export type SettingsMap = { [K in keyof typeof DEFAULT_SETTINGS]: (typeof DEFAULT_SETTINGS)[K] };

export async function getSetting<K extends keyof SettingsMap>(key: K): Promise<SettingsMap[K]> {
  const row = await prisma.setting.findUnique({ where: { key } });
  const def = DEFAULT_SETTINGS[key] as unknown as Record<string, unknown>;
  if (!row) return DEFAULT_SETTINGS[key];
  return { ...def, ...(row.value as Record<string, unknown>) } as SettingsMap[K];
}

export async function getAllSettings(): Promise<SettingsMap> {
  const rows = await prisma.setting.findMany();
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof SettingsMap)[]) {
    const row = rows.find((r) => r.key === key);
    out[key] = { ...(DEFAULT_SETTINGS[key] as object), ...((row?.value as object) ?? {}) };
  }
  return out as SettingsMap;
}

export async function setSetting<K extends keyof SettingsMap>(key: K, value: Partial<SettingsMap[K]>, updatedById?: string) {
  const current = await getSetting(key);
  const merged = { ...(current as object), ...(value as object) };
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: merged, updatedById },
    update: { value: merged, updatedById },
  });
  return merged as SettingsMap[K];
}

// Atomic counters for quote, invoice and ticket numbers.
export async function nextNumber(kind: "quotes" | "invoices" | "tickets"): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.setting.findUnique({ where: { key: kind } });
    const def = DEFAULT_SETTINGS[kind] as { counter: number; prefix: string };
    const value = { ...def, ...((row?.value as object) ?? {}) } as { counter: number; prefix: string };
    const next = (value.counter ?? def.counter) + 1;
    await tx.setting.upsert({ where: { key: kind }, create: { key: kind, value: { ...value, counter: next } }, update: { value: { ...value, counter: next } } });
    const year = new Date().getFullYear().toString().slice(-2);
    return kind === "tickets" ? `${value.prefix}-${next}` : `${value.prefix}-${year}${String(next).padStart(4, "0")}`;
  });
}
