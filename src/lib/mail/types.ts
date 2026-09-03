export type MailAddress = { name?: string | null; email: string };

export type MailMessageDto = {
  id: string;
  threadId: string | null;
  subject: string | null;
  from: MailAddress | null;
  to: MailAddress[];
  cc: MailAddress[];
  snippet: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  receivedAt: string; // ISO
  isRead: boolean;
  hasAttachments: boolean;
  webLink: string | null;
  direction: "INBOUND" | "OUTBOUND";
};

export type CalendarEventDto = {
  id: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
  location: string | null;
  link: string | null;
  attendees: MailAddress[];
  organizer: MailAddress | null;
};

export type SendMailInput = {
  to: MailAddress[];
  cc?: MailAddress[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: { externalId: string; threadId?: string | null; messageIdHeader?: string | null } | null;
};

export type CreateEventInput = {
  title: string;
  start: string; // ISO
  end: string; // ISO
  attendees?: MailAddress[];
  location?: string;
  description?: string;
  onlineMeeting?: boolean;
};

export interface MailProvider {
  readonly kind: "microsoft" | "google";
  listMessages(opts: { folder: "inbox" | "sent"; sinceDays?: number; top?: number; query?: string }): Promise<MailMessageDto[]>;
  getMessage(id: string): Promise<MailMessageDto | null>;
  getThread(threadId: string): Promise<MailMessageDto[]>;
  sendMail(input: SendMailInput): Promise<{ id: string | null }>;
  listEvents(opts: { from: string; to: string }): Promise<CalendarEventDto[]>;
  createEvent(input: CreateEventInput): Promise<{ id: string; link: string | null }>;
}

export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseAddress(raw: string | null | undefined): MailAddress | null {
  if (!raw) return null;
  const m = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() };
  const email = raw.trim().replace(/^<|>$/g, "").toLowerCase();
  return email.includes("@") ? { name: null, email } : null;
}

export function parseAddressList(raw: string | null | undefined): MailAddress[] {
  if (!raw) return [];
  return raw
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((s) => parseAddress(s))
    .filter((a): a is MailAddress => !!a);
}
