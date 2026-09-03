import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    ...authConfig.providers,
    Credentials({
      name: "Email and password",
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash) return null;
        if (user.status === "INACTIVE") return null;
        const ok = await compare(password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  events: {
    async signIn({ user }) {
      if (!user?.id) return;
      await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date(), status: "ACTIVE", emailVerified: new Date() } }).catch(() => null);
      await prisma.auditLog.create({ data: { actorId: user.id, actorEmail: user.email ?? undefined, action: "login", entityType: "User", entityId: user.id } }).catch(() => null);
    },
  },
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      // Password sign in is validated in authorize(). OAuth sign in is allowed only for people who
      // already exist (invited staff, approved clients) so nobody can create an account by signing in.
      if (account?.provider === "credentials") return true;
      const email = user.email?.toLowerCase();
      if (!email) return false;
      const existing = await prisma.user.findUnique({ where: { email } });
      if (!existing) return "/request-access?reason=no-account";
      if (existing.status === "INACTIVE") return "/login?error=inactive";
      return true;
    },
    async jwt({ token, user, trigger }) {
      const email = (user?.email ?? token.email)?.toLowerCase();
      if (user || trigger === "update" || !token.uid) {
        if (email) {
          const u = await prisma.user.findUnique({
            where: { email },
            select: { id: true, name: true, kind: true, tier: true, permissions: true, companyId: true, departmentId: true, image: true },
          });
          if (u) {
            token.uid = u.id;
            token.name = u.name;
            token.kind = u.kind;
            token.tier = u.tier;
            token.permissions = u.permissions;
            token.companyId = u.companyId;
            token.departmentId = u.departmentId;
            token.picture = u.image ?? token.picture;
          }
        }
      }
      return token;
    },
  },
});
