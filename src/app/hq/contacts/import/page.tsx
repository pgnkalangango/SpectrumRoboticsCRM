import { requireStaff } from "@/lib/session";
import { PageHeader } from "@/components/ui/empty-state";
import { Breadcrumbs } from "@/components/hq/record";
import { ImportWizard } from "./import-wizard";

export const metadata = { title: "Import contacts" };

export default async function ImportContactsPage() {
  await requireStaff();
  return (
    <div>
      <Breadcrumbs items={[{ label: "Contacts", href: "/hq/contacts" }, { label: "Import" }]} />
      <PageHeader title="Import contacts" subtitle="Bring in a spreadsheet of people. Matching is by email, companies link by name, and you become the owner of anything new." />
      <ImportWizard />
    </div>
  );
}
