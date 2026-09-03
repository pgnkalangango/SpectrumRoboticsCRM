import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/permissions";
import { SopEditor } from "@/components/hq/sops/sop-editor";

export const metadata = { title: "New SOP" };

export default async function NewSopPage() {
  const user = await requireStaff();
  if (!can(user, "sops.edit")) redirect("/hq/sops?denied=1");
  const departments = await prisma.department.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, color: true } });
  return <SopEditor departments={departments} />;
}
