# Builder brief for Spectrum HQ modules

Read `CLAUDE.md` first. Then study these files, because every module must match them:

- `src/app/hq/contacts/page.tsx` and `src/app/hq/contacts/[id]/page.tsx` (list page and record page patterns)
- `src/app/hq/deals/page.tsx`, `src/components/hq/deals/*` (board, forms, stage bar)
- `src/server/actions/crm.ts` and `src/server/actions/tasks.ts` (server action pattern with `Result`, zod, `actionStaff`, `logActivity`, `audit`, `notify`)
- `src/components/hq/form-sheet.tsx`, `src/components/hq/entity-picker.tsx`, `src/components/hq/filter-bar.tsx`, `src/components/hq/record.tsx`, `src/components/hq/timeline.tsx`
- `src/components/ui/*` (Button, Input/Field/NativeSelect/Textarea, Card/Stat, Badge/StatusBadge, Avatar, Dialog, Sheet, Tabs, Table, Tooltip, misc: Switch/Checkbox/Popover/Progress/Skeleton/Kbd, EmptyState/PageHeader/SectionTitle, Command)
- `src/lib/session.ts` (requireStaff, requireClient, actionStaff, actionCan), `src/lib/permissions.ts`, `src/lib/settings.ts` (getSetting, setSetting, nextNumber), `src/lib/audit.ts`, `src/lib/utils.ts` (money, fmtDate, relTime, label, fullName), `src/lib/options.ts`, `src/lib/nav.ts` (the routes you must implement, exactly these paths), `src/lib/portal.ts`
- `prisma/schema.prisma` (the data model; it is complete for your module)

## Hard rules
1. Do not edit `prisma/schema.prisma`, `src/lib/nav.ts`, `package.json`, `src/app/globals.css`, `src/components/ui/*`, `src/auth*.ts`, `src/proxy.ts`, or any file outside your module's directories unless your brief says so. If you believe a schema change is essential, do not make it; describe it in your final report.
2. Do not install packages. Installed and available: prisma, next-auth, zod (v4), react-hook-form + @hookform/resolvers, @tanstack/react-query, lucide-react (no brand icons), date-fns, recharts, class-variance-authority, clsx, tailwind-merge, radix primitives, cmdk, sonner, pdf-lib, nodemailer, stripe, @dnd-kit, driver.js, nanoid, papaparse, react-markdown, remark-gfm, @anthropic-ai/sdk, @modelcontextprotocol/sdk, bcryptjs.
3. Do not run `next build`, `next dev`, `next start`, `prisma migrate`, or `prisma db push`. Do not commit or push. Verify with `npx tsc --noEmit` (must pass with zero errors in your files) and, when useful, small `npx tsx` scripts against the local database (`DATABASE_URL` is in `.env`, already migrated and seeded).
4. Security: every page calls `requireStaff()` (or `requireClient()` for `/portal`), every server action calls `actionStaff()` / `actionCan(key)` / `actionUser()`. Portal data is always filtered by the client's `companyId` from `portalScope()`. Never send `internalNotes`, `internalCost`, staff only ticket comments, or other companies' data to a client. Totals, numbers and status transitions are computed on the server.
5. Every write that matters calls `logActivity()` (timeline) and important changes call `audit()`. Notify people with `notify()` / `notifyTier()` when someone else needs to act.
6. Copy: plain language, buttons say what happens, one primary action per screen, helpful empty states, loading and error states. No em dashes anywhere (use commas, periods or colons). Money via `money()`. Dates via `fmtDate` / `fmtDateTime` / `relTime`.
7. Server components fetch with Prisma directly; client components (`"use client"`) never import Prisma. Convert `Decimal` with `Number()` and dates with `toISOString()` before passing to client components.
8. Lists: `PageHeader` + `FilterBar` (URL params) + `Table` or grouped lists + `EmptyState` + `Pagination` when more than 50 rows. Records: `Breadcrumbs` + `RecordHeader` + left `Panel`s + right `Tabs` with a `Timeline`.
9. Forms: `FormSheet` opened from URL flags via `useUrlSheet` (`?new=1`, `?edit=1`, `?open=<id>`), `react-hook-form`, `EntityPicker` for related records, server action returns `Result`. Show `toast.success` / `toast.error` and `router.refresh()`.
10. Use existing enums from `@/generated/prisma/enums` and `StatusBadge` for any status or priority.
11. Keep files focused; put client components under `src/components/hq/<module>/` (or `src/components/portal/<module>/`) and server actions in `src/server/actions/<module>.ts`.

## Finishing
End with a short report: files created, what works, what you could not finish, any schema or dependency changes you recommend, and exact URLs to smoke test.
