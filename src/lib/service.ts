// Service and fleet helpers that need company settings. Server only (imports settings, which touches the database).
import { getSetting } from "@/lib/settings";
import type { TicketPriority } from "@/generated/prisma/enums";
import { addDaysTo, computeNextMaintenance, humanizeHours } from "@/components/hq/service/constants";

export * from "@/components/hq/service/constants";

export async function slaHoursFor(priority: TicketPriority): Promise<number> {
  const s = await getSetting("service");
  const hours = s.slaHours as Record<string, number>;
  return hours[priority] ?? hours.NORMAL ?? 72;
}

// When we owe the customer a first response, based on the SLA table in Settings.
export async function slaDueFor(priority: TicketPriority, from: Date = new Date()): Promise<Date> {
  const hours = await slaHoursFor(priority);
  return new Date(from.getTime() + hours * 3600000);
}

// "We respond to high priority requests within 24 hours." Plain words for the portal.
export async function slaPromise(priority: TicketPriority): Promise<string> {
  const hours = await slaHoursFor(priority);
  const word = priority === "CRITICAL" ? "critical" : priority.toLowerCase();
  return `We respond to ${word} priority requests within ${humanizeHours(hours)}.`;
}

export async function defaultMaintenanceInterval(): Promise<number> {
  const s = await getSetting("service");
  return s.maintenanceIntervalDays ?? 90;
}

export async function renewalAlertDays(): Promise<number> {
  const s = await getSetting("service");
  return s.renewalAlertDays ?? 60;
}

// Next maintenance from the last service (or the install) plus the unit's interval, falling back to the company default.
export async function maintenanceNextDate(lastMaintenance: Date | null | undefined, installDate: Date | null | undefined, intervalDays?: number | null): Promise<Date | null> {
  const interval = intervalDays ?? (await defaultMaintenanceInterval());
  return computeNextMaintenance(lastMaintenance, installDate, interval);
}

export function certificateExpiry(issuedAt: Date): Date {
  return addDaysTo(issuedAt, 365);
}
