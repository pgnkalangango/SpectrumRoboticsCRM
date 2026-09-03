import { NextResponse } from "next/server";
import { authenticateKey, handleJsonRpc, PROTOCOL_VERSION } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";

const headers = { "Content-Type": "application/json", "MCP-Protocol-Version": PROTOCOL_VERSION };

export async function POST(req: Request) {
  const auth = await authenticateKey(req.headers.get("authorization"));
  if (!auth) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized. Send a personal access key as a Bearer token; create one under HQ > MCP." } }, { status: 401, headers: { ...headers, "WWW-Authenticate": "Bearer" } });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers });
  }
  const requests = Array.isArray(body) ? body : [body];
  const responses = [];
  for (const r of requests) {
    if (!r || typeof r !== "object" || (r as { jsonrpc?: string }).jsonrpc !== "2.0" || typeof (r as { method?: string }).method !== "string") {
      responses.push({ jsonrpc: "2.0", id: (r as { id?: string | number })?.id ?? null, error: { code: -32600, message: "Invalid request" } });
      continue;
    }
    const res = await handleJsonRpc(r as Parameters<typeof handleJsonRpc>[0], auth.ctx);
    if (res) responses.push(res);
  }
  if (responses.length === 0) return new NextResponse(null, { status: 202, headers });
  return NextResponse.json(Array.isArray(body) ? responses : responses[0], { headers });
}

// No server initiated stream in stateless mode. Clients that probe with GET get a plain answer.
export async function GET() {
  return NextResponse.json({ name: "spectrum-hq", transport: "streamable-http", protocolVersion: PROTOCOL_VERSION, hint: "POST JSON-RPC with Authorization: Bearer <personal key>" }, { headers });
}

export async function DELETE() {
  return new NextResponse(null, { status: 200, headers });
}
