import Link from "next/link";
import { Package, Plus, Pencil } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/permissions";
import { cn, money } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FilterBar } from "@/components/hq/filter-bar";
import { Thumb } from "@/components/hq/quotes/catalog-picker";
import { PublishToggle } from "@/components/hq/catalog/publish-toggle";
import { ProductSheetFromUrl, type ProductFormValues } from "@/components/hq/catalog/product-sheet";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Catalog" };

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const canEdit = can(user, "catalog.publish");
  const canSeeCost = can(user, "finance.view");
  const q = sp.q?.trim();
  const where: Prisma.ProductWhereInput = {
    ...(sp.category ? { category: sp.category } : {}),
    ...(sp.oem ? { oem: sp.oem } : {}),
    ...(sp.published === "yes" ? { published: true } : sp.published === "no" ? { published: false } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [rows, categories, oems, counts] = await Promise.all([
    prisma.product.findMany({ where, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.product.groupBy({ by: ["category"], _count: true, orderBy: { category: "asc" } }),
    prisma.product.groupBy({ by: ["oem"], _count: true, orderBy: { oem: "asc" } }),
    prisma.product.aggregate({ _count: true, where: { published: true } }),
  ]);
  const editing = sp.edit ? rows.find((p) => p.id === sp.edit) ?? (await prisma.product.findUnique({ where: { id: sp.edit } })) : null;
  const initial: ProductFormValues | undefined = editing
    ? {
        id: editing.id,
        name: editing.name,
        sku: editing.sku ?? "",
        oem: editing.oem ?? "",
        category: editing.category,
        description: editing.description ?? "",
        imageUrl: editing.imageUrl ?? "",
        purchasePrice: editing.purchasePrice === null ? "" : String(Number(editing.purchasePrice)),
        monthlyPrice: editing.monthlyPrice === null ? "" : String(Number(editing.monthlyPrice)),
        internalCost: canSeeCost && editing.internalCost !== null ? String(Number(editing.internalCost)) : "",
        priceDisplayPrefix: editing.priceDisplayPrefix,
        warrantyMonths: editing.warrantyMonths === null ? "" : String(editing.warrantyMonths),
        leadTimeDays: editing.leadTimeDays === null ? "" : String(editing.leadTimeDays),
        published: editing.published,
        sortOrder: String(editing.sortOrder),
        specsText: (editing.specs as { specifications?: string | null } | null)?.specifications ?? "",
      }
    : undefined;
  const categoryList = categories.map((c) => c.category);
  const oemList = oems.map((o) => o.oem).filter((o): o is string => !!o);

  return (
    <div>
      <PageHeader
        title="Catalog"
        subtitle={`${counts._count} published of ${rows.length === counts._count ? rows.length : categories.reduce((a, c) => a + c._count, 0)} products. Published products can be quoted and appear on the website.${canEdit ? "" : " You can browse; leadership edits pricing."}`}
        actions={
          canEdit ? (
            <Button asChild>
              <Link href="/hq/catalog?new=1">
                <Plus /> New product
              </Link>
            </Button>
          ) : null
        }
      />
      <FilterBar
        searchPlaceholder="Search name, SKU, description"
        selects={[
          { name: "category", label: "All categories", options: categories.map((c) => ({ value: c.category, label: `${c.category} (${c._count})` })) },
          { name: "oem", label: "Any OEM", options: oems.filter((o) => o.oem).map((o) => ({ value: o.oem as string, label: `${o.oem} (${o._count})` })) },
          { name: "published", label: "Published and drafts", options: [{ value: "yes", label: "Published only" }, { value: "no", label: "Unpublished only" }] },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={Package} title="No products match" body="Try a different search or clear the filters." action={canEdit ? <Button asChild><Link href="/hq/catalog?new=1"><Plus /> New product</Link></Button> : undefined} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => {
            const purchase = p.purchasePrice === null ? null : Number(p.purchasePrice);
            const monthly = p.monthlyPrice === null ? null : Number(p.monthlyPrice);
            const cost = canSeeCost && p.internalCost !== null ? Number(p.internalCost) : null;
            const margin = cost !== null && purchase ? Math.round(((purchase - cost) / purchase) * 100) : null;
            return (
              <li key={p.id} className={cn("flex gap-4 rounded-xl border border-line bg-surface p-4 shadow-sm transition-shadow hover:shadow-md", !p.published && "opacity-80")}>
                <Thumb src={p.imageUrl} name={p.name} size={72} className="bg-surface-2" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-[14.5px] font-semibold text-ink">{p.name}</h3>
                      <p className="truncate text-xs text-muted">{[p.oem, p.category, p.sku].filter(Boolean).join(" · ")}</p>
                    </div>
                    {canEdit ? <PublishToggle id={p.id} published={p.published} name={p.name} /> : <Badge variant={p.published ? "ok" : "default"}>{p.published ? "Published" : "Draft"}</Badge>}
                  </div>
                  <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span className="font-display text-[15px] font-bold tabular text-ink">{purchase === null ? <span className="text-sm font-medium text-faint">No purchase price</span> : <>{p.priceDisplayPrefix ? <span className="text-xs font-medium text-muted">{p.priceDisplayPrefix} </span> : null}{money(purchase)}</>}</span>
                    {monthly !== null ? (
                      <span className="text-sm font-semibold tabular text-brand">
                        {money(monthly)}
                        <span className="text-xs font-medium text-muted">/mo</span>
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted">
                    <span>
                      {cost !== null ? (
                        <span className="text-warn">
                          Cost {money(cost)}
                          {margin !== null ? ` · ${margin}% margin` : ""}
                        </span>
                      ) : (
                        [p.warrantyMonths ? `${p.warrantyMonths} mo warranty` : null, p.leadTimeDays ? `${p.leadTimeDays} day lead` : null].filter(Boolean).join(" · ")
                      )}
                    </span>
                    {canEdit ? (
                      <Link href={`/hq/catalog?edit=${p.id}`} className="flex items-center gap-1 font-medium text-ink-2 hover:text-brand">
                        <Pencil className="size-3" /> Edit
                      </Link>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {canEdit ? <ProductSheetFromUrl initial={initial} categories={categoryList} oems={oemList} canSeeCost={canSeeCost} isOwner={user.tier === "OWNER"} /> : null}
    </div>
  );
}
