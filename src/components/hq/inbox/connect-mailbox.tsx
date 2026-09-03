import Link from "next/link";
import { Mail, CalendarDays, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ConnectMailbox({ canConnect, error, isOwner }: { canConnect: { microsoft: boolean; google: boolean }; error?: string; isOwner: boolean }) {
  const none = !canConnect.microsoft && !canConnect.google;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="rounded-xl border border-line bg-surface p-6 shadow-sm">
        <h2 className="font-display text-lg font-bold">Connect your mailbox and calendar</h2>
        <p className="mt-1 max-w-xl text-sm text-muted">Your email stays yours. HQ reads it only for you: to match conversations to customers, to answer your questions about your inbox, and to draft replies in your voice. Nothing is sent without you pressing Send.</p>
        {error ? <p className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error === "state" ? "The sign in did not complete. Try again." : error.replace(/-/g, " ")}</p> : null}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" disabled={!canConnect.microsoft} className={!canConnect.microsoft ? "pointer-events-none opacity-50" : ""}>
            <Link href="/api/oauth/microsoft/start">
              <Mail /> Connect Microsoft 365
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary" disabled={!canConnect.google} className={!canConnect.google ? "pointer-events-none opacity-50" : ""}>
            <Link href="/api/oauth/google/start">
              <Mail /> Connect Google Workspace
            </Link>
          </Button>
        </div>
        {none ? (
          <div className="mt-5 rounded-lg border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-warn">
            {isOwner ? (
              <>
                Mailbox sign in is not configured yet. Register an app in Microsoft Entra (and optionally Google Cloud), then set <code className="font-mono text-xs">MICROSOFT_GRAPH_CLIENT_ID</code> and <code className="font-mono text-xs">MICROSOFT_GRAPH_CLIENT_SECRET</code> (or the Google pair) in the server environment. The redirect URL is <code className="font-mono text-xs">/api/oauth/microsoft/callback</code>. Details are on the <Link href="/hq/integrations" className="underline">Integrations</Link> page.
              </>
            ) : (
              "Mailbox sign in is not set up yet. Ask an owner to finish the Microsoft 365 setup under Integrations."
            )}
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-3">
        {[
          { icon: Mail, title: "One timeline", body: "Emails with a known contact appear on their record automatically, so anyone covering for you sees the history." },
          { icon: Sparkles, title: "Ask your inbox", body: "Who is waiting on me? How many replies did I get this month? Draft a follow up to Joe. The assistant answers from your own mail." },
          { icon: CalendarDays, title: "Calendar in context", body: "Upcoming meetings show here with a one click brief on the person you are meeting." },
          { icon: ShieldCheck, title: "Private by design", body: "Owners cannot read your inbox through HQ. Tokens are encrypted. Disconnect any time." },
        ].map((x) => (
          <div key={x.title} className="flex gap-3 rounded-xl border border-line bg-surface p-4">
            <x.icon className="mt-0.5 size-4 shrink-0 text-brand" />
            <div>
              <div className="text-sm font-semibold">{x.title}</div>
              <p className="text-xs text-muted">{x.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
