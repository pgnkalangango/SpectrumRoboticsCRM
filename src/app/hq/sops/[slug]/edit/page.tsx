import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/permissions";
import { SopEditor } from "@/components/hq/sops/sop-editor";
import { parseQuiz, parseSteps } from "@/components/hq/sops/constants";

export const metadata = { title: "Edit SOP" };

export default async function EditSopPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireStaff();
  const { slug } = await params;
  if (!can(user, "sops.edit")) redirect(`/hq/sops/${slug}`);
  const [sop, departments] = await Promise.all([prisma.sop.findUnique({ where: { slug } }), prisma.department.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, color: true } })]);
  if (!sop) notFound();
  return (
    <SopEditor
      departments={departments}
      initial={{
        id: sop.id,
        slug: sop.slug,
        title: sop.title,
        code: sop.code,
        departmentId: sop.departmentId,
        category: sop.category,
        scope: sop.scope,
        status: sop.status,
        version: sop.version,
        summary: sop.summary,
        body: sop.body,
        steps: parseSteps(sop.steps),
        keywords: sop.keywords,
        tags: sop.tags,
        appliesTo: sop.appliesTo,
        requiresAcknowledgment: sop.requiresAcknowledgment,
        enforcedBySystem: sop.enforcedBySystem,
        reviewDate: sop.reviewDate?.toISOString() ?? null,
        quiz: parseQuiz(sop.quiz),
      }}
    />
  );
}
