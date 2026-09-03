"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { actionStaff, AccessDenied } from "@/lib/session";
import { audit, logActivity } from "@/lib/audit";
import type { ContactType } from "@/generated/prisma/enums";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(e: unknown): Result<never> {
  if (e instanceof AccessDenied) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the data." };
  console.error(e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const s = z.string().max(500).optional().nullable().transform((v) => (v ? v.trim() : ""));
const rowSchema = z.object({
  row: z.number().int().optional(),
  fullName: s,
  firstName: s,
  lastName: s,
  email: s,
  phone: s,
  company: s,
  title: s,
  type: s,
  source: s,
  city: s,
  state: s,
  tags: s,
  notes: z.string().max(10000).optional().nullable().transform((v) => (v ? v.trim() : "")),
});
export type ImportRow = z.input<typeof rowSchema>;
export type ImportSummary = { created: number; updated: number; skipped: { row: number; reason: string }[] };

const TYPES: ContactType[] = ["LEAD", "PROSPECT", "CLIENT", "PARTNER", "VENDOR", "OTHER"];
const BATCH_LIMIT = 100;

function splitTags(v: string): string[] {
  return Array.from(new Set(v.split(/[;,|]/).map((t) => t.trim()).filter(Boolean)));
}

// Imports up to 100 rows. Upserts by email, links or creates companies by name, and assigns the importer as owner.
export async function importContacts(rows: ImportRow[], opts: { createCompanies: boolean } = { createCompanies: true }): Promise<Result<ImportSummary>> {
  try {
    const user = await actionStaff();
    if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: "Nothing to import." };
    if (rows.length > BATCH_LIMIT) return { ok: false, error: `Send at most ${BATCH_LIMIT} rows per batch.` };
    const parsed = rows.map((r) => rowSchema.parse(r));
    const summary: ImportSummary = { created: 0, updated: 0, skipped: [] };
    const seenEmails = new Set<string>();
    const companyCache = new Map<string, { id: string; name: string } | null>();

    const resolveCompany = async (name: string): Promise<{ id: string; name: string } | null> => {
      const key = name.toLowerCase();
      if (companyCache.has(key)) return companyCache.get(key)!;
      let co = await prisma.company.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { id: true, name: true } });
      if (!co && opts.createCompanies) {
        co = await prisma.company.create({ data: { name, status: "PROSPECT", source: "import", ownerId: user.id }, select: { id: true, name: true } });
        await logActivity({ type: "SYSTEM", subject: "Company created by import", companyId: co.id, actorId: user.id, source: "import" });
      }
      companyCache.set(key, co ?? null);
      return co ?? null;
    };

    for (let i = 0; i < parsed.length; i++) {
      const r = parsed[i];
      const rowNo = r.row ?? i + 1;
      let firstName = r.firstName;
      let lastName = r.lastName;
      if (!firstName && r.fullName) {
        const parts = r.fullName.split(/\s+/);
        firstName = parts[0];
        lastName = parts.slice(1).join(" ");
      }
      const email = r.email.toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        summary.skipped.push({ row: rowNo, reason: `Email "${r.email}" is not valid` });
        continue;
      }
      if (!firstName && !email) {
        summary.skipped.push({ row: rowNo, reason: "No name and no email" });
        continue;
      }
      if (email) {
        if (seenEmails.has(email)) {
          summary.skipped.push({ row: rowNo, reason: `Duplicate email ${email} in this file` });
          continue;
        }
        seenEmails.add(email);
      }
      const company = r.company ? await resolveCompany(r.company) : null;
      const type = TYPES.includes(r.type.toUpperCase() as ContactType) ? (r.type.toUpperCase() as ContactType) : undefined;
      const tags = splitTags(r.tags);
      const fields = {
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        ...(r.phone ? { phoneMobile: r.phone } : {}),
        ...(r.title ? { jobTitle: r.title } : {}),
        ...(type ? { type } : {}),
        ...(r.source ? { leadSource: r.source.toLowerCase().replace(/\s+/g, "_") } : {}),
        ...(r.city ? { addressCity: r.city } : {}),
        ...(r.state ? { addressState: r.state } : {}),
        ...(company ? { companyId: company.id, companyName: company.name } : r.company ? { companyName: r.company } : {}),
      };
      const existing = email ? await prisma.contact.findFirst({ where: { email }, select: { id: true, tags: true, notes: true, companyId: true } }) : null;
      if (existing) {
        await prisma.contact.update({
          where: { id: existing.id },
          data: { ...fields, tags: tags.length ? Array.from(new Set([...existing.tags, ...tags])) : undefined, notes: r.notes ? (existing.notes ? `${existing.notes}\n\n${r.notes}` : r.notes) : undefined },
        });
        summary.updated++;
      } else {
        const row = await prisma.contact.create({
          data: { firstName: firstName || (email ? email.split("@")[0] : "Unknown"), lastName: lastName || null, email: email || null, ownerId: user.id, type: type ?? "LEAD", tags, notes: r.notes || null, ...fields },
        });
        await logActivity({ type: "SYSTEM", subject: "Contact imported", contactId: row.id, companyId: company?.id ?? null, actorId: user.id, source: "import" });
        summary.created++;
      }
    }
    await audit({ actorId: user.id, action: "import", entityType: "Contact", after: { rows: parsed.length, created: summary.created, updated: summary.updated, skipped: summary.skipped.length, createCompanies: opts.createCompanies } });
    revalidatePath("/hq/contacts");
    revalidatePath("/hq/companies");
    return { ok: true, data: summary };
  } catch (e) {
    return fail(e);
  }
}
