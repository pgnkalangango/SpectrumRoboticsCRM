import { requireStaff } from "@/lib/session";

export const CONTACT_IMPORT_HEADERS = ["first_name", "last_name", "email", "phone", "company", "title", "type", "source", "city", "state", "tags", "notes"];

// A starter CSV with the column names the importer recognizes and one example row.
export async function GET() {
  await requireStaff();
  const example = ["Alex", "Rivera", "alex@grandcasino.com", "(630) 555 0142", "Grand Casino Aurora", "General Manager", "LEAD", "linkedin", "Aurora", "IL", "casino;hospitality", "Met at the hospitality expo"];
  const csv = [CONTACT_IMPORT_HEADERS.join(","), example.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")].join("\n") + "\n";
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="spectrum-contacts-template.csv"' } });
}
