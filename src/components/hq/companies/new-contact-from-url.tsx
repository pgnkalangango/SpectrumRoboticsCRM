"use client";

import { useUrlSheet } from "@/components/hq/form-sheet";
import { ContactSheet } from "@/components/hq/contacts/contact-form";

export function NewContactFromUrl({ companyId, companyName }: { companyId: string; companyName: string }) {
  const s = useUrlSheet("newContact");
  return <ContactSheet open={s.open} onClose={s.close} defaultCompany={{ id: companyId, label: companyName }} />;
}
