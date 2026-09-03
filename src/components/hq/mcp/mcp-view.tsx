"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plug, Plus, RefreshCw, KeyRound, Copy, Check, Trash2, Play, ShieldCheck, Activity } from "lucide-react";
import { cn, relTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Checkbox, Switch } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormSheet } from "@/components/hq/form-sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { createApiKey, deleteMcpServer, revokeApiKey, runMcpToolNow, saveMcpServer, testMcpServer, type McpServerInput } from "@/server/actions/mcp";

type Server = { id: string; name: string; slug: string; url: string; transport: string; authType: string; secretEnvName: string | null; hasSecret: boolean; headersJson: string; allowedTools: string[]; enabledForTiers: string[]; enabled: boolean; status: string; lastError: string | null; description: string | null; tools: { name: string; description: string }[]; toolsCachedAt: string | null };
type Key = { id: string; name: string; prefix: string; scopes: string[]; owner: string; lastUsedAt: string | null; expiresAt: string | null; revokedAt: string | null; createdAt: string };
type Call = { id: string; server: string; tool: string; user: string | null; ok: boolean; error: string | null; summary: string | null; ms: number | null; at: string };

const PRESETS: { name: string; url: string; description: string; authType: "BEARER" | "NONE" | "OAUTH"; secretEnvName?: string }[] = [
  { name: "Canva", url: "https://mcp.canva.com/mcp", description: "Search, create and export Canva designs and brand kits.", authType: "OAUTH" },
  { name: "Higgsfield", url: "https://mcp.higgsfield.ai/mcp", description: "Generate images and video for social and ads.", authType: "BEARER", secretEnvName: "HIGGSFIELD_MCP_TOKEN" },
  { name: "Creatify", url: "https://mcp.creatify.ai/mcp", description: "AI video ads and avatars.", authType: "BEARER", secretEnvName: "CREATIFY_MCP_TOKEN" },
  { name: "OpenArt", url: "https://mcp.openart.ai/mcp", description: "Image generation.", authType: "BEARER", secretEnvName: "OPENART_MCP_TOKEN" },
];

export function McpView({ canManage, endpoint, servers, keys, calls, tier }: { canManage: boolean; endpoint: string; servers: Server[]; keys: Key[]; calls: Call[]; tier: string }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<Partial<Server> | null>(null);
  const [testing, setTesting] = React.useState<string | null>(null);
  const [runOpen, setRunOpen] = React.useState<{ server: Server; tool: string } | null>(null);

  const test = async (id: string) => {
    setTesting(id);
    const r = await testMcpServer(id);
    setTesting(null);
    if (r.ok && r.data) toast.success(`Connected. ${r.data.tools.length} tool${r.data.tools.length === 1 ? "" : "s"} found.`);
    else if (!r.ok) toast.error(r.error);
    router.refresh();
  };

  return (
    <Tabs defaultValue="keys">
      <TabsList>
        <TabsTrigger value="keys">
          <KeyRound className="size-4" /> Connect Claude to HQ
        </TabsTrigger>
        <TabsTrigger value="servers">
          <Plug className="size-4" /> Outside tools ({servers.length})
        </TabsTrigger>
        <TabsTrigger value="activity">
          <Activity className="size-4" /> Activity
        </TabsTrigger>
      </TabsList>

      <TabsContent value="keys">
        <KeysPanel keys={keys} endpoint={endpoint} tier={tier} />
      </TabsContent>

      <TabsContent value="servers">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-2xl text-sm text-muted">Any MCP server with a Streamable HTTP endpoint can be added here. Its tools become available to the assistant for the tiers you allow, and every call is logged.</p>
          {canManage ? (
            <Button onClick={() => setEditing({})}>
              <Plus /> Add server
            </Button>
          ) : null}
        </div>
        {canManage && servers.length === 0 ? (
          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {PRESETS.map((p) => (
              <button key={p.name} onClick={() => setEditing({ name: p.name, url: p.url, description: p.description, authType: p.authType, secretEnvName: p.secretEnvName ?? null })} className="rounded-lg border border-dashed border-line bg-surface p-3 text-left text-sm hover:border-brand">
                <div className="font-semibold">{p.name}</div>
                <div className="text-xs text-muted">{p.description}</div>
              </button>
            ))}
          </div>
        ) : null}
        {servers.length === 0 ? (
          <EmptyState icon={Plug} title="No outside tools yet" body={canManage ? "Add Canva or a media tool to start. You need the server URL and a token or OAuth details from the vendor." : "An owner can add tools here."} />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {servers.map((s) => (
              <div key={s.id} className={cn("rounded-xl border border-line bg-surface p-4 shadow-sm", !s.enabled && "opacity-60")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-semibold">{s.name}</span>
                      <StatusBadge value={s.status === "healthy" ? "CONNECTED" : s.status === "error" ? "ERROR" : "NOT_CONFIGURED"} labelOverride={s.status === "healthy" ? "Healthy" : s.status === "error" ? "Error" : "Not tested"} />
                      {!s.enabled ? <Badge>Disabled</Badge> : null}
                    </div>
                    <div className="truncate text-xs text-muted">{s.url}</div>
                    {s.description ? <p className="mt-1 text-sm text-ink-2">{s.description}</p> : null}
                  </div>
                  {canManage ? (
                    <div className="flex shrink-0 gap-1">
                      <Button variant="secondary" size="sm" loading={testing === s.id} onClick={() => test(s.id)}>
                        <RefreshCw /> Test
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(s)}>
                        Edit
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-muted">
                  <span>Auth: {s.authType === "BEARER" ? (s.secretEnvName ? `env ${s.secretEnvName}` : s.hasSecret ? "stored token" : "no token yet") : s.authType.toLowerCase()}</span>
                  <span>· For: {s.enabledForTiers.map((t) => t.toLowerCase()).join(", ")}</span>
                  {s.toolsCachedAt ? <span>· tools refreshed {relTime(s.toolsCachedAt)}</span> : null}
                </div>
                {s.lastError ? <p className="mt-2 rounded bg-bad-soft px-2 py-1 text-xs text-bad">{s.lastError}</p> : null}
                {s.tools.length ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-ink-2">{s.tools.length} tool{s.tools.length === 1 ? "" : "s"}{s.allowedTools.length ? ` (${s.allowedTools.length} allowed)` : ""}</summary>
                    <ul className="mt-1 max-h-48 divide-y divide-line overflow-y-auto rounded-md border border-line text-xs">
                      {s.tools.map((t) => (
                        <li key={t.name} className={cn("flex items-center gap-2 px-2 py-1.5", s.allowedTools.length && !s.allowedTools.includes(t.name) && "opacity-50")}>
                          <span className="font-mono font-medium">{t.name}</span>
                          <span className="min-w-0 flex-1 truncate text-muted">{t.description}</span>
                          {canManage ? (
                            <button className="text-muted hover:text-brand" title="Run now" onClick={() => setRunOpen({ server: s, tool: t.name })}>
                              <Play className="size-3.5" />
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            ))}
          </div>
        )}
        {editing ? <ServerSheet initial={editing} onClose={() => setEditing(null)} /> : null}
        {runOpen ? <RunToolDialog server={runOpen.server} tool={runOpen.tool} onClose={() => setRunOpen(null)} /> : null}
      </TabsContent>

      <TabsContent value="activity">
        {calls.length === 0 ? (
          <EmptyState icon={Activity} title="No tool calls yet" body="Every MCP call by the assistant or an outside client shows here, with who ran it and how long it took." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-2/80 text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2 text-left">When</th>
                  <th className="px-3 py-2 text-left">Server</th>
                  <th className="px-3 py-2 text-left">Tool</th>
                  <th className="px-3 py-2 text-left">Person</th>
                  <th className="px-3 py-2 text-left">Result</th>
                  <th className="px-3 py-2 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {calls.map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2 text-xs text-muted">{relTime(c.at)}</td>
                    <td className="px-3 py-2">{c.server}</td>
                    <td className="px-3 py-2 font-mono text-xs">{c.tool}</td>
                    <td className="px-3 py-2">{c.user ?? "–"}</td>
                    <td className={cn("max-w-md truncate px-3 py-2 text-xs", c.ok ? "text-muted" : "text-bad")}>{c.ok ? c.summary : c.error}</td>
                    <td className="px-3 py-2 text-right text-xs tabular text-muted">{c.ms ?? "–"} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

function KeysPanel({ keys, endpoint, tier }: { keys: Key[]; endpoint: string; tier: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("Claude Desktop");
  const [scopes, setScopes] = React.useState<("read" | "draft" | "write")[]>(["read", "draft"]);
  const [created, setCreated] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const active = keys.filter((k) => !k.revokedAt);

  const desktopConfig = JSON.stringify({ mcpServers: { "spectrum-hq": { type: "http", url: endpoint, headers: { Authorization: `Bearer ${created ?? "<your key>"}` } } } }, null, 2);
  const codeCmd = `claude mcp add --transport http spectrum-hq ${endpoint} --header "Authorization: Bearer ${created ?? "<your key>"}"`;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-display font-semibold">Your access keys</h2>
            <p className="text-sm text-muted">A key lets an MCP client act as you: same records, same mailbox, same limits. Revoke it if a device is lost.</p>
          </div>
          <Button onClick={() => { setCreated(null); setOpen(true); }}>
            <Plus /> New key
          </Button>
        </div>
        {active.length === 0 ? (
          <EmptyState icon={KeyRound} title="No keys yet" body="Create a key, paste it into Claude Desktop or Claude Code, and ask Claude about your pipeline from anywhere." compact />
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {active.map((k) => (
              <li key={k.id} className="flex items-center gap-3 px-4 py-3">
                <KeyRound className="size-4 text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {k.name} <span className="font-mono text-xs text-muted">{k.prefix}…</span>
                  </div>
                  <div className="text-xs text-muted">
                    {tier === "OWNER" ? `${k.owner} · ` : ""}
                    {k.scopes.join(", ")} · created {relTime(k.createdAt)}
                    {k.lastUsedAt ? ` · last used ${relTime(k.lastUsedAt)}` : " · never used"}
                    {k.expiresAt ? ` · expires ${relTime(k.expiresAt)}` : ""}
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="text-bad hover:bg-bad-soft" onClick={() => revokeApiKey(k.id).then(() => { toast.success("Key revoked"); router.refresh(); })}>
                  <Trash2 /> Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
        {keys.some((k) => k.revokedAt) ? <p className="mt-2 text-xs text-muted">{keys.filter((k) => k.revokedAt).length} revoked key{keys.filter((k) => k.revokedAt).length === 1 ? "" : "s"} not shown.</p> : null}
      </div>
      <div className="rounded-xl border border-line bg-surface p-4 text-sm">
        <div className="mb-1 flex items-center gap-2 font-display font-semibold">
          <ShieldCheck className="size-4 text-brand" /> How to connect
        </div>
        <p className="text-xs text-muted">Endpoint: <span className="font-mono">{endpoint}</span></p>
        <div className="mt-3 text-xs font-semibold">Claude Desktop (claude_desktop_config.json)</div>
        <CopyBlock text={desktopConfig} />
        <div className="mt-3 text-xs font-semibold">Claude Code</div>
        <CopyBlock text={codeCmd} />
        <p className="mt-3 text-xs text-muted">Then ask things like “What is waiting on me this week?”, “Summarize Hollywood Casino Aurora”, or “Create a task to call Joe tomorrow”.</p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{created ? "Copy your key now" : "New access key"}</DialogTitle>
            <DialogDescription>{created ? "This is the only time the full key is shown." : "Name the device or app this key is for."}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            {created ? (
              <CopyBlock text={created} />
            ) : (
              <>
                <Field label="Name">
                  <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                </Field>
                <Field label="What it may do">
                  <div className="flex flex-col gap-2 text-sm">
                    {(["read", "draft", "write"] as const).map((s) => (
                      <label key={s} className={cn("flex items-start gap-2", s === "write" && tier === "EMPLOYEE" && "opacity-50")}>
                        <Checkbox checked={scopes.includes(s)} disabled={s === "write" && tier === "EMPLOYEE"} onCheckedChange={(v) => setScopes((sc) => (v ? [...sc, s] : sc.filter((x) => x !== s)))} />
                        <span>
                          <span className="font-medium capitalize">{s}</span>
                          <span className="block text-xs text-muted">{s === "read" ? "Search and read records, SOPs, your mail and calendar." : s === "draft" ? "Draft emails and text (never sends)." : "Create tasks, log notes, create calendar events."}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </Field>
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {created ? "Done" : "Cancel"}
            </Button>
            {!created ? (
              <Button
                loading={pending}
                onClick={() =>
                  start(async () => {
                    const r = await createApiKey({ name, scopes, expiresDays: 365 });
                    if (r.ok && r.data) {
                      setCreated(r.data.key);
                      router.refresh();
                    } else if (!r.ok) toast.error(r.error);
                  })
                }
              >
                Create key
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="relative mt-1">
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-surface-2 p-3 font-mono text-[11.5px] leading-relaxed">{text}</pre>
      <button
        className="absolute right-2 top-2 flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-[11px] text-muted shadow-sm hover:text-ink"
        onClick={() => {
          navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="size-3 text-ok" /> : <Copy className="size-3" />} {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function ServerSheet({ initial, onClose }: { initial: Partial<Server>; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [form, setForm] = React.useState<McpServerInput & { id?: string }>({
    id: initial.id,
    name: initial.name ?? "",
    url: initial.url ?? "",
    transport: (initial.transport as "streamable_http" | "sse") ?? "streamable_http",
    authType: (initial.authType as "NONE" | "BEARER" | "OAUTH") ?? "BEARER",
    secretEnvName: initial.secretEnvName ?? "",
    secretValue: "",
    headersJson: initial.headersJson ?? "",
    allowedTools: initial.allowedTools ?? [],
    enabledForTiers: (initial.enabledForTiers as ("OWNER" | "LEADERSHIP" | "EMPLOYEE")[]) ?? ["OWNER", "LEADERSHIP"],
    enabled: initial.enabled ?? true,
    description: initial.description ?? "",
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const tools = initial.tools ?? [];
  return (
    <FormSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial.id ? `Edit ${initial.name}` : "Add an MCP server"}
      description="Tools on this server become available to the assistant for the tiers you choose."
      formId="mcp-server-form"
      pending={pending}
      onDelete={initial.id ? () => { if (confirm("Remove this server?")) deleteMcpServer(initial.id!).then(() => { onClose(); router.refresh(); }); } : undefined}
      deleteLabel="Remove"
    >
      <form
        id="mcp-server-form"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await saveMcpServer(form);
            if (r.ok) {
              toast.success("Saved. Press Test to discover its tools.");
              onClose();
              router.refresh();
            } else toast.error(r.error);
          });
        }}
      >
        <Field label="Name" required>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
        </Field>
        <Field label="Server URL" required hint="The Streamable HTTP endpoint from the vendor's MCP documentation.">
          <Input value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://mcp.example.com/mcp" required />
        </Field>
        <Field label="What it is for">
          <Input value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Transport">
            <NativeSelect value={form.transport} onChange={(e) => set("transport", e.target.value as "streamable_http" | "sse")}>
              <option value="streamable_http">Streamable HTTP (recommended)</option>
              <option value="sse">SSE (older servers)</option>
            </NativeSelect>
          </Field>
          <Field label="Authentication">
            <NativeSelect value={form.authType} onChange={(e) => set("authType", e.target.value as "NONE" | "BEARER" | "OAUTH")}>
              <option value="BEARER">Bearer token</option>
              <option value="NONE">None</option>
              <option value="OAUTH">OAuth (paste an access token below for now)</option>
            </NativeSelect>
          </Field>
        </div>
        {form.authType !== "NONE" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Token from environment variable" hint="Preferred. Name of the server env var holding the token.">
              <Input value={form.secretEnvName ?? ""} onChange={(e) => set("secretEnvName", e.target.value)} placeholder="CANVA_MCP_TOKEN" />
            </Field>
            <Field label="Or paste a token" hint={initial.hasSecret ? "A token is stored (encrypted). Leave blank to keep it." : "Stored encrypted."}>
              <Input value={form.secretValue ?? ""} onChange={(e) => set("secretValue", e.target.value)} type="password" placeholder="••••••" />
            </Field>
          </div>
        ) : null}
        <Field label="Extra headers (JSON)">
          <Textarea rows={2} value={form.headersJson ?? ""} onChange={(e) => set("headersJson", e.target.value)} placeholder='{"X-Api-Key": "..."}' />
        </Field>
        <Field label="Who can use it">
          <div className="flex gap-4 text-sm">
            {(["OWNER", "LEADERSHIP", "EMPLOYEE"] as const).map((t) => (
              <label key={t} className="flex items-center gap-1.5">
                <Checkbox checked={form.enabledForTiers?.includes(t)} onCheckedChange={(v) => set("enabledForTiers", v ? [...(form.enabledForTiers ?? []), t] : (form.enabledForTiers ?? []).filter((x) => x !== t))} /> {t === "OWNER" ? "Owners" : t === "LEADERSHIP" ? "Leadership" : "Employees"}
              </label>
            ))}
          </div>
        </Field>
        {tools.length ? (
          <Field label="Allowed tools" hint="Leave all unchecked to allow every tool.">
            <div className="max-h-48 overflow-y-auto rounded-md border border-line p-2 text-sm">
              {tools.map((t) => (
                <label key={t.name} className="flex items-start gap-2 py-1">
                  <Checkbox checked={form.allowedTools?.includes(t.name)} onCheckedChange={(v) => set("allowedTools", v ? [...(form.allowedTools ?? []), t.name] : (form.allowedTools ?? []).filter((x) => x !== t.name))} />
                  <span>
                    <span className="font-mono text-xs">{t.name}</span>
                    <span className="block text-xs text-muted">{t.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </Field>
        ) : null}
        <label className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
          <span className="font-medium">Enabled</span>
          <Switch checked={!!form.enabled} onCheckedChange={(v) => set("enabled", v)} />
        </label>
      </form>
    </FormSheet>
  );
}

function RunToolDialog({ server, tool, onClose }: { server: Server; tool: string; onClose: () => void }) {
  const [args, setArgs] = React.useState("{}");
  const [out, setOut] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            Run {tool} on {server.name}
          </DialogTitle>
          <DialogDescription>Arguments as JSON. Useful to check a tool before letting the assistant use it.</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <Textarea rows={4} value={args} onChange={(e) => setArgs(e.target.value)} className="font-mono text-xs" />
          {out !== null ? <pre className="max-h-72 overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-[11.5px]">{out}</pre> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button loading={pending} onClick={() => start(async () => { const r = await runMcpToolNow(server.id, tool, args); setOut(r.ok && r.data ? r.data.result : r.ok ? "" : `Error: ${r.error}`); })}>
            <Play /> Run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
