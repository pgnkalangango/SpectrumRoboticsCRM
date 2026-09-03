import Link from "next/link";
import { SpectrumWordmark } from "@/components/brand/logo";

// Two column entrance: brand panel on the left, the form on the right. Collapses to one column on phones.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-sidebar px-12 py-10 text-sidebar-ink">
        <div className="absolute inset-0 opacity-[0.18]" aria-hidden>
          <svg viewBox="0 0 800 800" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="g" cx="30%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#29B8BA" />
                <stop offset="100%" stopColor="#0f1c22" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="800" height="800" fill="url(#g)" />
            {Array.from({ length: 9 }).map((_, i) => (
              <ellipse key={i} cx="400" cy="420" rx={120 + i * 55} ry={40 + i * 22} fill="none" stroke="#29B8BA" strokeWidth="1" opacity={0.9 - i * 0.09} />
            ))}
          </svg>
        </div>
        <div className="relative">
          <SpectrumWordmark className="h-14" color="#4DD0D2" subColor="#B9C6C9" />
        </div>
        <div className="relative max-w-md">
          <p className="font-display text-3xl font-bold leading-tight text-white text-balance">One place for the whole company and every client.</p>
          <p className="mt-4 text-[15px] leading-relaxed text-sidebar-ink/80">
            Pipeline, quotes, installs, service and support, all on one timeline. Staff sign in with their Spectrum Robotics account. Clients see their own quotes, invoices, robots and tickets.
          </p>
        </div>
        <div className="relative text-xs text-sidebar-muted">Spectrum Robotics · 1795 Commerce Drive, Elk Grove Village, IL 60007</div>
      </aside>
      <main className="flex flex-col items-center justify-center px-5 py-10">
        <div className="mb-8 lg:hidden">
          <Link href="/">
            <SpectrumWordmark className="h-12" />
          </Link>
        </div>
        <div className="w-full max-w-[420px] animate-slide-up">{children}</div>
      </main>
    </div>
  );
}
