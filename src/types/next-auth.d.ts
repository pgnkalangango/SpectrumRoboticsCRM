import type { DefaultSession } from "next-auth";
import type { Tier, UserKind } from "@/generated/prisma/enums";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      kind: UserKind;
      tier: Tier;
      permissions: string[];
      companyId: string | null;
      departmentId: string | null;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
    kind?: UserKind;
    tier?: Tier;
    permissions?: string[];
    companyId?: string | null;
    departmentId?: string | null;
  }
}
