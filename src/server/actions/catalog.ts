"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { actionCan, actionStaff, AccessDenied } from "@/lib/session";
import { can } from "@/lib/permissions";
import { audit, logActivity } from "@/lib/audit";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(e: unknown): Result<never> {
  if (e instanceof AccessDenied) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
  console.error(e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const opt = (max = 200) => z.string().max(max).optional().nullable().transform((v) => (v && v.trim() ? v.trim() : null));
const money = z.union([z.null(), z.undefined(), z.literal(""), z.coerce.number().min(0, "Prices cannot be negative.")]).transform((v) => (v === "" || v === null || v === undefined ? null : v));
const int = z.union([z.null(), z.undefined(), z.literal(""), z.coerce.number().int().min(0)]).transform((v) => (v === "" || v === null || v === undefined ? null : v));

const productSchema = z.object({
  name: z.string().min(1, "Give the product a name.").max(160),
  sku: opt(60),
  oem: opt(60),
  category: z.string().min(1, "Pick a category.").max(60),
  description: z.string().max(5000).optional().nullable(),
  imageUrl: opt(500),
  purchasePrice: money,
  monthlyPrice: money,
  internalCost: money,
  priceDisplayPrefix: z.string().max(20).default("from"),
  warrantyMonths: int,
  leadTimeDays: int,
  published: z.boolean().default(false),
  sortOrder: z.coerce.number().int().default(100),
  specsText: z.string().max(10000).optional().nullable(),
});
export type ProductInput = z.input<typeof productSchema>;

export async function saveProduct(input: ProductInput & { id?: string }): Promise<Result<{ id: string }>> {
  try {
    const user = await actionCan("catalog.publish");
    const d = productSchema.parse(input);
    const seesCost = can(user, "finance.view");
    if (d.sku) {
      const dup = await prisma.product.findFirst({ where: { sku: d.sku, ...(input.id ? { id: { not: input.id } } : {}) }, select: { name: true } });
      if (dup) return { ok: false, error: `SKU ${d.sku} is already used by ${dup.name}.` };
    }
    const data = {
      name: d.name.trim(),
      sku: d.sku,
      oem: d.oem,
      category: d.category.trim(),
      description: d.description?.trim() || null,
      imageUrl: d.imageUrl,
      purchasePrice: d.purchasePrice,
      monthlyPrice: d.monthlyPrice,
      priceDisplayPrefix: d.priceDisplayPrefix || "from",
      warrantyMonths: d.warrantyMonths,
      leadTimeDays: d.leadTimeDays,
      published: d.published,
      sortOrder: d.sortOrder,
    };
    if (input.id) {
      const before = await prisma.product.findUnique({ where: { id: input.id } });
      if (!before) return { ok: false, error: "Product not found." };
      const specs = { ...((before.specs as Record<string, unknown> | null) ?? {}), specifications: d.specsText?.trim() || null };
      await prisma.product.update({ where: { id: input.id }, data: { ...data, specs, ...(seesCost ? { internalCost: d.internalCost } : {}) } });
      const changes: string[] = [];
      const cmp = (label: string, a: unknown, b: unknown) => {
        const av = a === null || a === undefined ? null : Number(a);
        const bv = b === null || b === undefined ? null : Number(b);
        if (av !== bv) changes.push(`${label}: ${av === null ? "none" : `$${av}`} → ${bv === null ? "none" : `$${bv}`}`);
      };
      cmp("Purchase price", before.purchasePrice, data.purchasePrice);
      cmp("Monthly price", before.monthlyPrice, data.monthlyPrice);
      if (seesCost) cmp("Internal cost", before.internalCost, d.internalCost);
      if (before.published !== data.published) changes.push(data.published ? "Published" : "Unpublished");
      if (before.name !== data.name) changes.push(`Renamed from ${before.name}`);
      if (changes.length) {
        const priceChanged = changes.some((c) => c.includes("price") || c.includes("cost"));
        await logActivity({ type: "CATALOG_CHANGE", subject: `${data.name} updated`, body: changes.filter((c) => !seesCost || !c.startsWith("Internal cost") || user.tier === "OWNER").join("\n"), actorId: user.id, source: "system" });
        if (priceChanged) await audit({ actorId: user.id, action: "price_change", entityType: "Product", entityId: input.id, before: { purchasePrice: before.purchasePrice, monthlyPrice: before.monthlyPrice, internalCost: seesCost ? before.internalCost : undefined }, after: { purchasePrice: data.purchasePrice, monthlyPrice: data.monthlyPrice, internalCost: seesCost ? d.internalCost : undefined } });
      }
      revalidatePath("/hq/catalog");
      return { ok: true, data: { id: input.id } };
    }
    const row = await prisma.product.create({ data: { ...data, specs: { specifications: d.specsText?.trim() || null }, ...(seesCost ? { internalCost: d.internalCost } : {}) } });
    await logActivity({ type: "CATALOG_CHANGE", subject: `${data.name} added to the catalog`, body: [data.purchasePrice !== null ? `Purchase $${data.purchasePrice}` : null, data.monthlyPrice !== null ? `Monthly $${data.monthlyPrice}` : null].filter(Boolean).join(" · ") || undefined, actorId: user.id, source: "system" });
    await audit({ actorId: user.id, action: "create", entityType: "Product", entityId: row.id, after: { name: data.name, purchasePrice: data.purchasePrice, monthlyPrice: data.monthlyPrice } });
    revalidatePath("/hq/catalog");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function setProductPublished(id: string, published: boolean): Promise<Result> {
  try {
    const user = await actionCan("catalog.publish");
    const p = await prisma.product.update({ where: { id }, data: { published }, select: { name: true } });
    await logActivity({ type: "CATALOG_CHANGE", subject: `${p.name} ${published ? "published" : "unpublished"}`, actorId: user.id, source: "system" });
    await audit({ actorId: user.id, action: "update", entityType: "Product", entityId: id, after: { published } });
    revalidatePath("/hq/catalog");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteProduct(id: string): Promise<Result> {
  try {
    const user = await actionStaff("OWNER");
    const p = await prisma.product.findUnique({ where: { id }, select: { name: true, _count: { select: { quoteLines: true, robots: true, inventory: true } } } });
    if (!p) return { ok: true };
    const used = p._count.quoteLines + p._count.robots + p._count.inventory;
    if (used > 0) return { ok: false, error: "This product is on quotes, robots or inventory. Unpublish it instead of deleting." };
    await prisma.product.delete({ where: { id } });
    await logActivity({ type: "CATALOG_CHANGE", subject: `${p.name} removed from the catalog`, actorId: user.id, source: "system" });
    await audit({ actorId: user.id, action: "delete", entityType: "Product", entityId: id, before: { name: p.name } });
    revalidatePath("/hq/catalog");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
