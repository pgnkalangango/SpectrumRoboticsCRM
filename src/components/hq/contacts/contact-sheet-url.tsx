"use client";

import { useUrlSheet } from "@/components/hq/form-sheet";
import { ContactSheet, type ContactFormValues } from "@/components/hq/contacts/contact-form";
import type { PickerValue } from "@/components/hq/entity-picker";

// Opens the contact form from ?new=1 (create) or ?edit=1 (edit the given record).
export function ContactSheetFromUrl({ initial, defaultCompany }: { initial?: Partial<ContactFormValues>; defaultCompany?: PickerValue }) {
  const create = useUrlSheet("new");
  const edit = useUrlSheet("edit");
  if (edit.open && initial) return <ContactSheet open onClose={edit.close} initial={initial} />;
  return <ContactSheet open={create.open} onClose={create.close} defaultCompany={defaultCompany} />;
}
