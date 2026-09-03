import type { Connection } from "@/generated/prisma/client";
import { getAccessToken } from "@/lib/mail/oauth";
import { htmlToText, type CalendarEventDto, type CreateEventInput, type MailAddress, type MailMessageDto, type MailProvider, type SendMailInput } from "@/lib/mail/types";

const BASE = "https://graph.microsoft.com/v1.0";
const SELECT = "id,conversationId,subject,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,hasAttachments,webLink,internetMessageId";

type GraphRecipient = { emailAddress?: { name?: string; address?: string } };
type GraphMessage = {
  id: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  receivedDateTime?: string;
  sentDateTime?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  webLink?: string;
  internetMessageId?: string;
};

function addr(r?: GraphRecipient | null): MailAddress | null {
  const a = r?.emailAddress?.address;
  return a ? { name: r?.emailAddress?.name ?? null, email: a.toLowerCase() } : null;
}

export class GraphProvider implements MailProvider {
  readonly kind = "microsoft" as const;
  constructor(private conn: Connection) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getAccessToken(this.conn);
    const r = await fetch(path.startsWith("http") ? path : `${BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: 'outlook.body-content-type="html"', ...(init.headers ?? {}) },
    });
    if (r.status === 204 || r.status === 202) return undefined as T;
    const text = await r.text();
    const json = text ? JSON.parse(text) : {};
    if (!r.ok) throw new Error(json?.error?.message || `Microsoft Graph error ${r.status}`);
    return json as T;
  }

  private toDto(m: GraphMessage, direction: "INBOUND" | "OUTBOUND"): MailMessageDto {
    return {
      id: m.id,
      threadId: m.conversationId ?? null,
      subject: m.subject ?? null,
      from: addr(m.from),
      to: (m.toRecipients ?? []).map(addr).filter((a): a is MailAddress => !!a),
      cc: (m.ccRecipients ?? []).map(addr).filter((a): a is MailAddress => !!a),
      snippet: m.bodyPreview ?? null,
      bodyHtml: m.body?.contentType?.toLowerCase() === "html" ? m.body?.content ?? null : null,
      bodyText: m.body ? (m.body.contentType?.toLowerCase() === "html" ? htmlToText(m.body.content) : m.body.content ?? null) : null,
      receivedAt: m.receivedDateTime ?? m.sentDateTime ?? new Date().toISOString(),
      isRead: m.isRead ?? true,
      hasAttachments: m.hasAttachments ?? false,
      webLink: m.webLink ?? null,
      direction,
    };
  }

  async listMessages({ folder, sinceDays = 30, top = 50, query }: { folder: "inbox" | "sent"; sinceDays?: number; top?: number; query?: string }) {
    const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
    const f = folder === "inbox" ? "inbox" : "sentitems";
    const params = query
      ? `$search="${query.replace(/"/g, '\\"')}"&$top=${top}&$select=${SELECT}`
      : `$filter=receivedDateTime ge ${since}&$orderby=receivedDateTime desc&$top=${top}&$select=${SELECT}`;
    const j = await this.call<{ value: GraphMessage[] }>(`/me/mailFolders/${f}/messages?${params}`);
    return (j.value ?? []).map((m) => this.toDto(m, folder === "inbox" ? "INBOUND" : "OUTBOUND"));
  }

  async getMessage(id: string) {
    const m = await this.call<GraphMessage>(`/me/messages/${encodeURIComponent(id)}?$select=${SELECT},body`);
    if (!m) return null;
    const me = this.conn.accountEmail?.toLowerCase();
    return this.toDto(m, addr(m.from)?.email === me ? "OUTBOUND" : "INBOUND");
  }

  async getThread(threadId: string) {
    const j = await this.call<{ value: GraphMessage[] }>(`/me/messages?$filter=conversationId eq '${threadId.replace(/'/g, "''")}'&$orderby=receivedDateTime asc&$top=50&$select=${SELECT},body`);
    const me = this.conn.accountEmail?.toLowerCase();
    return (j.value ?? []).map((m) => this.toDto(m, addr(m.from)?.email === me ? "OUTBOUND" : "INBOUND"));
  }

  async sendMail(input: SendMailInput) {
    const recipients = (list: MailAddress[]) => list.map((a) => ({ emailAddress: { address: a.email, name: a.name ?? undefined } }));
    if (input.replyTo?.externalId) {
      // createReply keeps the conversation threaded, then we set our own body and send.
      const draft = await this.call<GraphMessage>(`/me/messages/${encodeURIComponent(input.replyTo.externalId)}/createReply`, { method: "POST", body: JSON.stringify({}) });
      await this.call(`/me/messages/${encodeURIComponent(draft.id)}`, { method: "PATCH", body: JSON.stringify({ subject: input.subject, body: { contentType: "HTML", content: input.html }, toRecipients: recipients(input.to), ccRecipients: recipients(input.cc ?? []) }) });
      await this.call(`/me/messages/${encodeURIComponent(draft.id)}/send`, { method: "POST" });
      return { id: draft.id };
    }
    await this.call(`/me/sendMail`, {
      method: "POST",
      body: JSON.stringify({ message: { subject: input.subject, body: { contentType: "HTML", content: input.html }, toRecipients: recipients(input.to), ccRecipients: recipients(input.cc ?? []) }, saveToSentItems: true }),
    });
    return { id: null };
  }

  async listEvents({ from, to }: { from: string; to: string }) {
    type GraphEvent = { id: string; subject?: string; start?: { dateTime: string; timeZone?: string }; end?: { dateTime: string }; isAllDay?: boolean; location?: { displayName?: string }; webLink?: string; onlineMeeting?: { joinUrl?: string }; attendees?: { emailAddress?: { name?: string; address?: string } }[]; organizer?: GraphRecipient };
    const j = await this.call<{ value: GraphEvent[] }>(`/me/calendarView?startDateTime=${encodeURIComponent(from)}&endDateTime=${encodeURIComponent(to)}&$orderby=start/dateTime&$top=50&$select=id,subject,start,end,isAllDay,location,webLink,onlineMeeting,attendees,organizer`, { headers: { Prefer: 'outlook.timezone="UTC"' } });
    return (j.value ?? []).map<CalendarEventDto>((e) => ({
      id: e.id,
      title: e.subject ?? "(no title)",
      start: e.start?.dateTime ? new Date(e.start.dateTime + (e.start.dateTime.endsWith("Z") ? "" : "Z")).toISOString() : from,
      end: e.end?.dateTime ? new Date(e.end.dateTime + (e.end.dateTime.endsWith("Z") ? "" : "Z")).toISOString() : to,
      allDay: !!e.isAllDay,
      location: e.location?.displayName ?? null,
      link: e.onlineMeeting?.joinUrl ?? e.webLink ?? null,
      attendees: (e.attendees ?? []).map((a) => addr(a)).filter((a): a is MailAddress => !!a),
      organizer: addr(e.organizer),
    }));
  }

  async createEvent(input: CreateEventInput) {
    const e = await this.call<{ id: string; webLink?: string; onlineMeeting?: { joinUrl?: string } }>(`/me/events`, {
      method: "POST",
      body: JSON.stringify({
        subject: input.title,
        start: { dateTime: input.start, timeZone: "UTC" },
        end: { dateTime: input.end, timeZone: "UTC" },
        location: input.location ? { displayName: input.location } : undefined,
        body: input.description ? { contentType: "Text", content: input.description } : undefined,
        attendees: (input.attendees ?? []).map((a) => ({ emailAddress: { address: a.email, name: a.name ?? undefined }, type: "required" })),
        isOnlineMeeting: !!input.onlineMeeting,
        onlineMeetingProvider: input.onlineMeeting ? "teamsForBusiness" : undefined,
      }),
    });
    return { id: e.id, link: e.onlineMeeting?.joinUrl ?? e.webLink ?? null };
  }
}
