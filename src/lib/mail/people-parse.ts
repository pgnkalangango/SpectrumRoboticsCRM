// Pure helpers for reading people out of mail. No database access here so they are easy to test.

export const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "hotmail.com", "outlook.com", "live.com", "msn.com", "aol.com",
  "icloud.com", "me.com", "mac.com", "protonmail.com", "proton.me", "comcast.net", "att.net", "sbcglobal.net", "verizon.net",
  "mail.com", "zoho.com", "gmx.com", "yandex.com", "fastmail.com", "hey.com",
]);

const AUTOMATED_LOCAL = /^(no-?reply|do-?not-?reply|noreply|notifications?|notify|alerts?|newsletter|news|updates?|digest|mailer-daemon|postmaster|bounce|support|help|info|billing|invoices?|receipts?|marketing|hello|team|admin|system|automated|calendar|calendar-notification|feedback|jobs|careers|security|accounts?|orders?|shipping)(\+.*|[-_.].*)?$/i;
const AUTOMATED_DOMAIN = /(^|\.)(mailchimp|sendgrid|hubspot|salesforce|linkedin|facebookmail|calendly|zoom|docusign|intuit|quickbooks|stripe|paypal|amazon|amazonses|google|accounts\.google|microsoft|azure|github|atlassian|slack|notion|dropbox|zendesk|freshdesk|constantcontact|substack|medium|eventbrite|indeed|glassdoor|shopify|squarespace|wix|godaddy)\.(com|net|io|co)$/i;

export function isAutomatedAddress(email: string, name?: string | null): boolean {
  const [local, domain = ""] = email.toLowerCase().split("@");
  if (AUTOMATED_LOCAL.test(local)) return true;
  if (AUTOMATED_DOMAIN.test(domain)) return true;
  if (/^(mail|email|e|em|bounce|bounces|notifications?|reply|replies|smtp|mailer)\./i.test(domain)) return true;
  if (name && /\b(no ?reply|notifications?|newsletter|team|support|automated|via )/i.test(name) && !/\s[a-z]+$/i.test(name.trim().replace(/\bvia\b.*$/i, ""))) return true;
  return false;
}

export function isBusinessDomain(domain: string | null | undefined): boolean {
  if (!domain) return false;
  return !FREE_MAIL_DOMAINS.has(domain.toLowerCase());
}

export function companyFromDomain(domain: string | null | undefined): string | null {
  if (!isBusinessDomain(domain)) return null;
  const root = domain!.toLowerCase().replace(/^(mail|email|corp|www)\./, "").split(".")[0];
  if (!root || root.length < 2) return null;
  return root
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

export function splitName(name: string | null | undefined, email: string): { firstName: string; lastName: string | null; display: string } {
  let raw = (name ?? "").trim().replace(/^["']+|["']+$/g, "");
  if (raw && raw.toLowerCase() === email.toLowerCase()) raw = "";
  if (raw.includes(",") && !/\s(inc|llc|ltd|co)\b/i.test(raw)) {
    const [last, first] = raw.split(",").map((x) => x.trim());
    if (first && last) raw = `${first} ${last}`;
  }
  raw = raw.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
  if (!raw) {
    const local = email.split("@")[0];
    const parts = local.split(/[._-]+/).filter((p) => p && !/^\d+$/.test(p));
    const cap = (w: string) => w[0].toUpperCase() + w.slice(1).toLowerCase();
    if (parts.length >= 2) return { firstName: cap(parts[0]), lastName: cap(parts[parts.length - 1]), display: `${cap(parts[0])} ${cap(parts[parts.length - 1])}` };
    return { firstName: parts[0] ? cap(parts[0]) : local, lastName: null, display: parts[0] ? cap(parts[0]) : local };
  }
  const parts = raw.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: null, display: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" "), display: raw };
}

const TITLE_WORDS = /\b(ceo|cfo|coo|cto|cmo|cio|chief|president|vice president|vp|svp|evp|director|head of|manager|lead|founder|co-founder|owner|partner|principal|engineer|architect|analyst|specialist|coordinator|consultant|executive|officer|associate|administrator|assistant|supervisor|buyer|purchasing|procurement|operations|sales|account|general manager|gm|controller|treasurer|chair|dean|professor|superintendent|facilities|maintenance|it |technician|nurse|physician|attorney|counsel|recruiter|editor|producer|strategist|representative|rep\b|agent|broker|realtor|advisor)\b/i;
const PHONE_RE = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(\s*(x|ext\.?|extension)\s*\d{1,6})?/gi;
const PHONE_LABEL = /\b(mobile|cell|m|c|tel|t|phone|p|office|o|direct|d|work|w)\b\s*[:.]?/i;
const URL_RE = /\b(https?:\/\/|www\.)[^\s]+/i;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const ADDRESS_RE = /\b(\d{1,6}\s+[\w.\s]+(street|st|avenue|ave|road|rd|drive|dr|blvd|boulevard|suite|ste|lane|ln|way|court|ct|plaza|parkway|pkwy|floor|fl)\b|\b[A-Z]{2}\s+\d{5}(-\d{4})?\b)/i;
const CLOSING_RE = /^(thanks|thank you|best|regards|kind regards|warm regards|best regards|sincerely|cheers|talk soon|all the best|many thanks|respectfully|take care|warmly)[,!. ]*$/i;

export type SignatureDetails = { phone: string | null; jobTitle: string | null; company: string | null; linkedinUrl: string | null; signature: string | null };

// Cuts quoted history off a reply so the signature we read belongs to the sender, not the person they quoted.
export function stripQuotedHistory(body: string): string {
  const lines = body.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^(-{2,}\s*(original|forwarded) message\s*-{2,}|_{5,}|from:\s.+|on .{6,120} wrote:$|le .{6,120} a écrit\s*:$)/i.test(t)) break;
    if (t.startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n");
}

function cleanPhone(raw: string): string {
  const digits = raw.replace(/[^\d+x]/gi, "");
  const m = raw.match(/(\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})(\s*(?:x|ext\.?|extension)\s*(\d{1,6}))?/i);
  if (!m) return digits;
  return `(${m[2]}) ${m[3]}-${m[4]}${m[6] ? ` x${m[6]}` : ""}`;
}

export function extractSignature(bodyText: string | null | undefined, sender: { name?: string | null; email: string }): SignatureDetails {
  const empty: SignatureDetails = { phone: null, jobTitle: null, company: null, linkedinUrl: null, signature: null };
  if (!bodyText) return empty;
  const text = stripQuotedHistory(bodyText);
  const lines = text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length > 0 && l.length < 120);
  if (!lines.length) return empty;
  const tail = lines.slice(-14);
  const { firstName, lastName } = splitName(sender.name, sender.email);
  const nameRe = new RegExp(`^${escapeRe(firstName)}(\\s+\\w\\.?)?(\\s+${escapeRe(lastName ?? "")})?\\s*[,|]?\\s*[A-Za-z., ]*$`, "i");
  let start = -1;
  for (let i = tail.length - 1; i >= 0; i--) {
    const l = tail[i];
    if (l.length <= 60 && nameRe.test(l) && (lastName ? new RegExp(escapeRe(lastName), "i").test(l) : true)) { start = i; break; }
  }
  if (start === -1) {
    for (let i = tail.length - 1; i >= 0; i--) if (CLOSING_RE.test(tail[i])) { start = i + 1; break; }
  }
  if (start === -1) start = Math.max(0, tail.length - 6);
  const sig = tail.slice(start).filter((l) => !CLOSING_RE.test(l)).slice(0, 10);
  if (!sig.length) return empty;

  let phone: string | null = null;
  let linkedinUrl: string | null = null;
  const textual: string[] = [];
  const phoneLines = sig.filter((l) => l.match(PHONE_RE));
  const preferred = phoneLines.find((l) => /\b(mobile|cell|m|c)\b\s*[:.]/i.test(l)) ?? phoneLines.find((l) => /\b(direct|d|tel|t|phone|p)\b\s*[:.]/i.test(l)) ?? phoneLines[0];
  if (preferred) {
    const m = preferred.match(PHONE_RE);
    if (m) phone = cleanPhone(m[0]);
  }
  for (const l of sig) {
    const li = l.match(/linkedin\.com\/in\/[\w%-]+/i);
    if (li && !linkedinUrl) linkedinUrl = `https://www.${li[0].replace(/^www\./, "")}`;
  }
  for (const l of sig) {
    if (l.match(PHONE_RE) && PHONE_LABEL.test(l.replace(PHONE_RE, ""))) continue;
    if (l.match(PHONE_RE) && l.replace(PHONE_RE, "").trim().length < 4) continue;
    if (EMAIL_RE.test(l) || URL_RE.test(l) || ADDRESS_RE.test(l)) continue;
    if (/^(mobile|cell|tel|phone|office|direct|fax|m|c|t|p|o|d|f)\s*[:.]/i.test(l)) continue;
    textual.push(l.replace(PHONE_RE, "").replace(/\s*[|·]\s*$/, "").trim());
  }
  // First textual line is usually the name. What follows is title, then company.
  const afterName = textual.slice(start === -1 ? 0 : textual[0] && nameRe.test(textual[0]) ? 1 : 0).filter(Boolean);
  let jobTitle: string | null = null;
  let company: string | null = null;
  for (const l of afterName) {
    const pieces = l.split(/\s*(?:\||·|,|\s-\s|\s–\s|\s@\s|\sat\s)\s*/i).map((p) => p.trim()).filter(Boolean);
    if (!jobTitle) {
      const t = pieces.find((p) => TITLE_WORDS.test(p) && p.length <= 70);
      if (t) {
        jobTitle = t;
        const rest = pieces.filter((p) => p !== t);
        if (rest[0] && !TITLE_WORDS.test(rest[0]) && rest[0].length <= 60) company = rest[0];
        continue;
      }
    }
    if (jobTitle && !company && !TITLE_WORDS.test(l) && l.length <= 60 && !/^\d/.test(l)) { company = pieces[0]; break; }
  }
  if (!company && jobTitle) {
    const idx = afterName.findIndex((l) => l.includes(jobTitle!));
    const next = afterName[idx + 1];
    if (next && next.length <= 60 && !TITLE_WORDS.test(next) && !/^\d/.test(next)) company = next;
  }
  if (company && /\b(inc|llc|ltd|corp|co)\b\.?$/i.test(company)) company = company.replace(/\s*,?\s*(inc|llc|ltd|corp|co)\b\.?$/i, (m) => ` ${m.trim().replace(/^,\s*/, "")}`).trim();
  return { phone, jobTitle, company, linkedinUrl, signature: sig.join("\n").slice(0, 600) };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// How much this looks like a real business relationship, 0 to 100.
export function relationshipScore(p: { messagesIn: number; messagesOut: number; threads: number; lastSeenAt: Date | null; business: boolean; automated: boolean; internal: boolean }): number {
  if (p.automated || p.internal) return 0;
  let s = 0;
  const twoWay = Math.min(p.messagesIn, p.messagesOut);
  s += Math.min(40, twoWay * 12);
  s += Math.min(20, p.messagesIn * 3);
  s += Math.min(15, p.messagesOut * 3);
  s += Math.min(10, p.threads * 2);
  if (p.business) s += 10;
  if (p.lastSeenAt) {
    const days = (Date.now() - p.lastSeenAt.getTime()) / 86400000;
    if (days <= 14) s += 5;
    else if (days > 180) s -= 10;
  }
  return Math.max(0, Math.min(100, Math.round(s)));
}

export const daysBetween = (a: Date, b: Date) => Math.floor(Math.abs(a.getTime() - b.getTime()) / 86400000);
