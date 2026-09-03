import type { NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Google from "next-auth/providers/google";

// Provider and callback config shared by the proxy (edge safe) and the full auth module.
const providers: NextAuthConfig["providers"] = [];

if (process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET) {
  providers.push(
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

export const authConfig = {
  providers,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  pages: { signIn: "/login", error: "/login" },
  trustHost: true,
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const user = auth?.user;
      const staffArea = pathname.startsWith("/hq") || pathname.startsWith("/api/hq");
      const clientArea = pathname.startsWith("/portal") || pathname.startsWith("/api/portal");
      if (staffArea) return !!user && user.kind === "STAFF";
      if (clientArea) return !!user;
      return true;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.uid as string;
        session.user.kind = token.kind as "STAFF" | "CLIENT";
        session.user.tier = token.tier as "OWNER" | "LEADERSHIP" | "EMPLOYEE" | "CLIENT";
        session.user.permissions = (token.permissions as string[]) ?? [];
        session.user.companyId = (token.companyId as string | null) ?? null;
        session.user.departmentId = (token.departmentId as string | null) ?? null;
        session.user.name = (token.name as string) ?? session.user.name;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export const oauthProvidersEnabled = {
  microsoft: providers.some((p) => (typeof p === "function" ? p({}).id : p.id) === "microsoft-entra-id"),
  google: providers.some((p) => (typeof p === "function" ? p({}).id : p.id) === "google"),
};
