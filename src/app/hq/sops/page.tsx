import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { SopLibrary, type LibrarySop } from "@/components/hq/sops/sop-library";
import { parseSteps, parseQuiz } from "@/components/hq/sops/constants";

export const metadata = { title: "SOPs" };

export default async function SopsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const canEdit = can(user, "sops.edit");
  const [rows, departments] = await Promise.all([
    prisma.sop.findMany({
      where: canEdit ? {} : { status: "PUBLISHED" },
      orderBy: [{ code: "asc" }, { title: "asc" }],
      include: { department: { select: { id: true, name: true, color: true } }, acknowledgments: { where: { userId: user.id }, orderBy: { version: "desc" }, take: 1, select: { version: true } } },
    }),
    prisma.department.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, color: true } }),
  ]);
  const sops: LibrarySop[] = rows.map((s) => ({
    id: s.id,
    slug: s.slug,
    code: s.code,
    title: s.title,
    summary: s.summary,
    category: s.category,
    scope: s.scope,
    status: s.status,
    version: s.version,
    keywords: s.keywords,
    tags: s.tags,
    appliesTo: s.appliesTo,
    requiresAcknowledgment: s.requiresAcknowledgment,
    reviewDate: s.reviewDate?.toISOString() ?? null,
    updatedAt: s.updatedAt.toISOString(),
    department: s.department,
    stepCount: parseSteps(s.steps).length,
    hasQuiz: parseQuiz(s.quiz).length > 0,
    acknowledgedVersion: s.acknowledgments[0]?.version ?? null,
  }));

  return (
    <div>
      <PageHeader
        title="SOP library"
        subtitle="How we do things at Spectrum Robotics. Search by task, read the steps, and acknowledge the ones that apply to you."
        actions={
          canEdit ? (
            <Button asChild>
              <Link href="/hq/sops/new">
                <Plus /> New SOP
              </Link>
            </Button>
          ) : undefined
        }
      />
      <SopLibrary sops={sops} departments={departments} canEdit={canEdit} initialQuery={sp.q ?? ""} initialDept={sp.dept ?? ""} initialFilter={sp.filter ?? ""} />
    </div>
  );
}
