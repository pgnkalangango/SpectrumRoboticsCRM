import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { verifyEmail } from "@/server/actions/auth";

export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await verifyEmail(token);
  return (
    <div className="text-center">
      {result.ok ? <CheckCircle2 className="mx-auto mb-3 size-10 text-ok" /> : <XCircle className="mx-auto mb-3 size-10 text-bad" />}
      <h1 className="font-display text-2xl font-bold">{result.ok ? "Email confirmed" : "Link not valid"}</h1>
      <p className="mt-2 text-sm text-muted">{result.ok ? result.message : result.error}</p>
      <Button asChild className="mt-6">
        <Link href="/login?as=client">Sign in</Link>
      </Button>
    </div>
  );
}
