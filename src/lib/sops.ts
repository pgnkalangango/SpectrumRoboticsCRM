import { prisma } from "@/lib/prisma";

// Plain server helper (no "use server" boundary) so the assistant and other server code can import it directly.
// Splits each published SOP into passages and scores them by keyword overlap with the query.

export type SopPassage = {
  sopId: string;
  slug: string;
  code: string | null;
  title: string;
  department: string | null;
  heading: string | null;
  passage: string;
  score: number;
  url: string;
};

const STOP = new Set(["the", "and", "for", "with", "that", "this", "from", "what", "how", "when", "should", "does", "have", "into", "about", "our", "your", "are", "was", "were", "you", "can", "not", "but", "all", "any", "out", "get", "who", "why", "will", "would", "there", "their", "they", "them", "then", "than", "also", "just", "some", "more", "most", "very", "much", "one", "two", "per"]);

export function tokenize(text: string): string[] {
  return Array.from(new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w))));
}

function stem(w: string): string {
  return w.replace(/(ies|es|s|ing|ed)$/i, "");
}

export function splitPassages(body: string): { heading: string | null; text: string }[] {
  const out: { heading: string | null; text: string }[] = [];
  let heading: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    const text = buf.join("\n").trim();
    if (text.length >= 30) out.push({ heading, text });
    buf = [];
  };
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const h = /^#{1,6}\s+(.+)$/.exec(line);
    if (h) {
      flush();
      heading = h[1].replace(/[*_`]/g, "").trim();
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    buf.push(line);
  }
  flush();
  return out;
}

export async function searchSops(query: string, limit = 6): Promise<SopPassage[]> {
  const terms = tokenize(query).map(stem);
  if (terms.length === 0) return [];
  const sops = await prisma.sop.findMany({
    where: { status: "PUBLISHED" },
    select: { id: true, slug: true, code: true, title: true, summary: true, body: true, keywords: true, tags: true, department: { select: { name: true } } },
  });
  const scored: SopPassage[] = [];
  for (const s of sops) {
    const meta = stem(`${s.title} ${s.summary ?? ""} ${s.keywords.join(" ")} ${s.tags.join(" ")}`.toLowerCase());
    const metaHits = terms.filter((t) => meta.includes(t)).length;
    const passages = splitPassages(s.body);
    if (s.summary) passages.unshift({ heading: "Summary", text: s.summary });
    for (const p of passages) {
      const hay = stem(p.text.toLowerCase());
      const hits = terms.filter((t) => hay.includes(t)).length;
      if (hits === 0 && metaHits === 0) continue;
      const score = hits * 3 + metaHits + (p.heading && terms.some((t) => stem(p.heading!.toLowerCase()).includes(t)) ? 2 : 0);
      if (score < 2) continue;
      scored.push({ sopId: s.id, slug: s.slug, code: s.code, title: s.title, department: s.department?.name ?? null, heading: p.heading, passage: p.text.slice(0, 900), score, url: `/hq/sops/${s.slug}` });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  // At most two passages per SOP so one long document does not crowd out the rest.
  const perSop = new Map<string, number>();
  const out: SopPassage[] = [];
  for (const p of scored) {
    const n = perSop.get(p.sopId) ?? 0;
    if (n >= 2) continue;
    perSop.set(p.sopId, n + 1);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}
