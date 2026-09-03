import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getAllSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui/empty-state";
import { SettingsTabs, type SettingsValues } from "@/components/hq/settings/settings-tabs";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireStaff();
  if (!can(user, "settings.manage")) redirect("/hq?denied=1");
  const [settings, stages, departments, staff] = await Promise.all([
    getAllSettings(),
    prisma.pipelineStage.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.department.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { users: true, sops: true } } } }),
    prisma.user.findMany({ where: { kind: "STAFF", status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
  ]);
  // Settings are plain JSON already; loosen the readonly seed types for the client forms.
  const values = JSON.parse(JSON.stringify(settings)) as SettingsValues;
  return (
    <div>
      <PageHeader title="Company settings" subtitle="Company rules live here, not in code: numbering, pricing language, SLAs, assistant rules and who gets what by default." />
      <SettingsTabs
        values={values}
        stages={stages.map((s) => ({ key: s.key, label: s.label, probability: s.probability, color: s.color ?? "", sortOrder: s.sortOrder, isWon: s.isWon, isLost: s.isLost }))}
        departments={departments.map((d) => ({ id: d.id, slug: d.slug, name: d.name, description: d.description, color: d.color, leadId: d.leadId, userCount: d._count.users, sopCount: d._count.sops }))}
        staff={staff}
      />
    </div>
  );
}
