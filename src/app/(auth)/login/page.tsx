import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { oauthProvidersEnabled } from "@/auth.config";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (user) redirect(user.kind === "STAFF" ? "/hq" : "/portal");
  const asClient = sp.as === "client";
  return (
    <div>
      <div className="mb-6">
        <div className="eyebrow mb-2">{asClient ? "Client portal" : "Spectrum HQ"}</div>
        <h1 className="font-display text-[26px] font-bold text-ink">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">{asClient ? "Sign in to see your quotes, invoices, robots and support tickets." : "Sign in with your Spectrum Robotics account."}</p>
      </div>
      {sp.reset ? <p className="mb-4 rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">Password updated. Sign in below.</p> : null}
      {sp.error === "inactive" ? <p className="mb-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">This account is deactivated.</p> : null}
      <LoginForm next={sp.next} providers={oauthProvidersEnabled} asClient={asClient} />
      <div className="mt-6 flex flex-col gap-2 text-sm text-muted">
        {asClient ? (
          <p>
            New client?{" "}
            <Link href="/signup" className="font-semibold text-brand hover:underline">
              Create your portal account
            </Link>
          </p>
        ) : (
          <p>
            Need an account?{" "}
            <Link href="/request-access" className="font-semibold text-brand hover:underline">
              Request access
            </Link>
          </p>
        )}
        <p>
          <Link href={asClient ? "/login" : "/login?as=client"} className="hover:underline">
            {asClient ? "Team member? Sign in to HQ" : "Client? Sign in to the portal"}
          </Link>
        </p>
      </div>
    </div>
  );
}
