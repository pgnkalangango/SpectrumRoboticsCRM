import type { Connection } from "@/generated/prisma/client";
import { getAccessToken } from "@/lib/mail/oauth";
import { htmlToText, parseAddress, parseAddressList, type CalendarEventDto, type CreateEventInput, type MailAddress, type MailMessageDto, type MailProvider, type SendMailInput } from "@/lib/mail/types";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const CAL = "https://www.googleapis.com/calendar/v3";

type GmailPart = { mimeType?: string; body?: { data?: string; size?: number }; parts?: GmailPart[]; headers?: { name: string; value: string }[] };
type GmailMessage = { id: string; threadId?: string; labelIds?: string[]; snippet?: string; internalDate?: string; payload?: GmailPart };

function b64decode(s: string) {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}
function b64url(s: string) {
  return Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function header(p: GmailPart | undefined, name: string): string | null {
  return p?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}
function findBody(p: GmailPart | undefined, mime: string): string | null {
  if (!p) return null;
  if (p.mimeType === mime && p.body?.data) return b64decode(p.body.data);
  for (const c of p.parts ?? []) {
    const r = findBody(c, mime);
    if (r) return r;
  }
  return null;
}

export class GmailProvider implements MailProvider {
  readonly kind = "google" as const;
  constructor(private conn: Connection) {}

  private async call<T>(url: string, init: RequestInit = {}): Promise<T> {
    const token = await getAccessToken(this.conn);
    const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
    const text = await r.text();
    const json = text ? JSON.parse(text) : {};
    if (!r.ok) throw new Error(json?.error?.message || `Google API error ${r.status}`);
    return json as T;
  }

  private toDto(m: GmailMessage): MailMessageDto {
    const p = m.payload;
    const me = this.conn.accountEmail?.toLowerCase();
    const from = parseAddress(header(p, "From"));
    const html = findBody(p, "text/html");
    const text = findBody(p, "text/plain");
    return {
      id: m.id,
      threadId: m.threadId ?? null,
      subject: header(p, "Subject"),
      from,
      to: parseAddressList(header(p, "To")),
      cc: parseAddressList(header(p, "Cc")),
      snippet: m.snippet ?? null,
      bodyHtml: html,
      bodyText: text ?? (html ? htmlToText(html) : null),
      receivedAt: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : new Date().toISOString(),
      isRead: !(m.labelIds ?? []).includes("UNREAD"),
      hasAttachments: JSON.stringify(p ?? {}).includes('"filename":"') && /"filename":"[^"]+"/.test(JSON.stringify(p ?? {})),
      webLink: `https://mail.google.com/mail/u/0/#all/${m.id}`,
      direction: from?.email === me || (m.labelIds ?? []).includes("SENT") ? "OUTBOUND" : "INBOUND",
    };
  }

  private async fetchMany(ids: string[], format: "metadata" | "full") {
    const out: MailMessageDto[] = [];
    for (const id of ids) {
      const m = await this.call<GmailMessage>(`${GMAIL}/messages/${id}?format=${format}${format === "metadata" ? "&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Message-ID" : ""}`);
      out.push(this.toDto(m));
    }
    return out;
  }

  async listMessages({ folder, sinceDays = 30, top = 50, query }: { folder: "inbox" | "sent"; sinceDays?: number; top?: number; query?: string }) {
    const q = query ? `${query} newer_than:${sinceDays}d` : `${folder === "inbox" ? "in:inbox" : "in:sent"} newer_than:${sinceDays}d`;
    const j = await this.call<{ messages?: { id: string }[] }>(`${GMAIL}/messages?q=${encodeURIComponent(q)}&maxResults=${top}`);
    return this.fetchMany((j.messages ?? []).map((m) => m.id), "metadata");
  }

  async getMessage(id: string) {
    const m = await this.call<GmailMessage>(`${GMAIL}/messages/${id}?format=full`);
    return m ? this.toDto(m) : null;
  }

  async getThread(threadId: string) {
    const t = await this.call<{ messages?: GmailMessage[] }>(`${GMAIL}/threads/${threadId}?format=full`);
    return (t.messages ?? []).map((m) => this.toDto(m));
  }

  async sendMail(input: SendMailInput) {
    const fmt = (a: MailAddress) => (a.name ? `"${a.name.replace(/"/g, "")}" <${a.email}>` : a.email);
    const lines = [
      `From: ${this.conn.accountName ? `"${this.conn.accountName}" <${this.conn.accountEmail}>` : this.conn.accountEmail}`,
      `To: ${input.to.map(fmt).join(", ")}`,
      ...(input.cc?.length ? [`Cc: ${input.cc.map(fmt).join(", ")}`] : []),
      `Subject: ${input.subject}`,
      ...(input.replyTo?.messageIdHeader ? [`In-Reply-To: ${input.replyTo.messageIdHeader}`, `References: ${input.replyTo.messageIdHeader}`] : []),
      "MIME-Version: 1.0",
      'Content-Type: text/html; charset="UTF-8"',
      "",
      input.html,
    ];
    const j = await this.call<{ id: string }>(`${GMAIL}/messages/send`, { method: "POST", body: JSON.stringify({ raw: b64url(lines.join("\r\n")), threadId: input.replyTo?.threadId ?? undefined }) });
    return { id: j.id ?? null };
  }

  async listEvents({ from, to }: { from: string; to: string }) {
    type GEvent = { id: string; summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; location?: string; htmlLink?: string; hangoutLink?: string; attendees?: { email: string; displayName?: string }[]; organizer?: { email?: string; displayName?: string } };
    const j = await this.call<{ items?: GEvent[] }>(`${CAL}/calendars/primary/events?timeMin=${encodeURIComponent(from)}&timeMax=${encodeURIComponent(to)}&singleEvents=true&orderBy=startTime&maxResults=50`);
    return (j.items ?? []).map<CalendarEventDto>((e) => ({
      id: e.id,
      title: e.summary ?? "(no title)",
      start: e.start?.dateTime ?? (e.start?.date ? new Date(e.start.date).toISOString() : from),
      end: e.end?.dateTime ?? (e.end?.date ? new Date(e.end.date).toISOString() : to),
      allDay: !e.start?.dateTime,
      location: e.location ?? null,
      link: e.hangoutLink ?? e.htmlLink ?? null,
      attendees: (e.attendees ?? []).map((a) => ({ email: a.email.toLowerCase(), name: a.displayName ?? null })),
      organizer: e.organizer?.email ? { email: e.organizer.email.toLowerCase(), name: e.organizer.displayName ?? null } : null,
    }));
  }

  async createEvent(input: CreateEventInput) {
    const j = await this.call<{ id: string; htmlLink?: string; hangoutLink?: string }>(`${CAL}/calendars/primary/events?conferenceDataVersion=${input.onlineMeeting ? 1 : 0}`, {
      method: "POST",
      body: JSON.stringify({
        summary: input.title,
        start: { dateTime: input.start },
        end: { dateTime: input.end },
        location: input.location,
        description: input.description,
        attendees: (input.attendees ?? []).map((a) => ({ email: a.email, displayName: a.name ?? undefined })),
        conferenceData: input.onlineMeeting ? { createRequest: { requestId: `hq-${Date.now()}`, conferenceSolutionKey: { type: "hangoutsMeet" } } } : undefined,
      }),
    });
    return { id: j.id, link: j.hangoutLink ?? j.htmlLink ?? null };
  }
}
