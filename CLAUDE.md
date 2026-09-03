# Spectrum HQ

The Spectrum Robotics company system: CRM, quote to cash, service and fleet, marketing, SOP library, assistant and MCP, with a staff app at `/hq` and a client portal at `/portal`. Built to plug into spectrumrobotics.ai.

## Stack
- Next.js 16 (App Router, Turbopack, `src/proxy.ts` gate) + React 19 + TypeScript
- Tailwind 4 with design tokens in `src/app/globals.css` (brand turquoise `#149CA0`)
- Prisma 7 + PostgreSQL (`prisma/schema.prisma`, client generated to `src/generated/prisma`)
- Auth.js v5: email + password, Microsoft 365, Google. JWT sessions carry `kind`, `tier`, `permissions`, `companyId`.
- Anthropic SDK for the assistant (`claude-opus-5`, adaptive thinking). MCP SDK for the gateway and the HQ MCP server.

## Access model (never rely on the UI to protect data)
- `User.kind`: STAFF or CLIENT. `User.tier`: OWNER, LEADERSHIP, EMPLOYEE, CLIENT.
- `src/lib/permissions.ts` defines permission keys with tier defaults; owners grant or deny per person via `User.permissions` (`-key` denies).
- Server components call `requireStaff(tier)` / `requireClient()`; server actions call `actionStaff()` / `actionCan(key)` from `src/lib/session.ts`.
- Every portal query goes through `portalScope()` in `src/lib/portal.ts` and is filtered by the client's `companyId`. Internal notes, costs and margins are never sent to clients.
- OAuth tokens are encrypted with `TOKEN_ENCRYPTION_KEY` (`src/lib/crypto.ts`). Secrets never live in the database in plain text.

## Conventions
- Data access lives in server components and server actions under `src/server/actions/*`. Client components never touch Prisma.
- Every write that matters calls `logActivity()` (timeline) and, for sensitive changes, `audit()` from `src/lib/audit.ts`.
- Numbers (quotes, invoices, tickets) come from `nextNumber()` in `src/lib/settings.ts`. Totals are computed server side.
- Company rules live in Settings (`DEFAULT_SETTINGS`), not in code: pricing language, discount policy, SLAs, assistant rules.
- Plain language for people who are not technical. Buttons say what happens. One primary action per screen. No em dashes in copy.
- UI primitives are in `src/components/ui`. Use `StatusBadge` for any enum, `PageHeader` for page titles, `EmptyState` for empty lists.
- Migrations: `npm run db:migrate`. Seed: `npm run db:seed` (idempotent; migrates products, companies, quotes and SOPs).

## Local development
```
cp .env.example .env            # fill DATABASE_URL, AUTH_SECRET, TOKEN_ENCRYPTION_KEY
npm install
npm run db:migrate && npm run db:seed
npm run dev
```
Owner accounts are seeded for pg@spectrumrobotics.ai, pgnkalangango@gmail.com and djenkins@spectrumrobotics.ai (password from `SEED_OWNER_PASSWORD`).

## Checks before pushing
`npm run typecheck`, `npm run lint`, `npm run build`, `npm test`.
