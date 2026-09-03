import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime, relTime } from "@/lib/utils";
import { slaTone } from "@/components/hq/service/constants";
import type { TicketStatus } from "@/generated/prisma/enums";

// SLA due badge: breached is bad, due within 4 hours is warn, otherwise muted. Closed tickets show when they were resolved.
export function SlaBadge({ slaDueAt, status, firstResponseAt, resolvedAt }: { slaDueAt: Date | string | null; status: TicketStatus; firstResponseAt?: Date | string | null; resolvedAt?: Date | string | null }) {
  if (status === "RESOLVED" || status === "CLOSED") {
    return <span className="text-xs text-muted">{resolvedAt ? `Resolved ${relTime(resolvedAt)}` : "Done"}</span>;
  }
  if (firstResponseAt) {
    return (
      <span className="text-xs text-muted" title={`First response ${fmtDateTime(firstResponseAt)}`}>
        Responded {relTime(firstResponseAt)}
      </span>
    );
  }
  if (!slaDueAt) return <span className="text-xs text-faint">No SLA</span>;
  const tone = slaTone(slaDueAt, status);
  if (tone === "bad") {
    return (
      <Badge variant="bad" title={fmtDateTime(slaDueAt)}>
        <Clock className="size-3" /> Breached {relTime(slaDueAt)}
      </Badge>
    );
  }
  if (tone === "warn") {
    return (
      <Badge variant="warn" title={fmtDateTime(slaDueAt)}>
        <Clock className="size-3" /> Due {relTime(slaDueAt)}
      </Badge>
    );
  }
  return (
    <span className="text-xs text-muted" title={fmtDateTime(slaDueAt)}>
      Due {relTime(slaDueAt)}
    </span>
  );
}
