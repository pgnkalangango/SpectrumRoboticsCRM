# Spectrum HQ

The company system for Spectrum Robotics. One sign in for owners, leadership and employees at `/hq`, and a separate client portal at `/portal` where customers review quotes, pay invoices, see their robots and open support tickets.

What is inside:

- **CRM**: contacts, companies, deals on a kanban, tasks, one timeline per customer
- **Quote to cash**: catalog driven quotes with purchase or monthly pricing, owner only discounts, online acceptance, invoices with Stripe payment links, QuickBooks sync
- **Service and fleet**: sites, deployed robots, maintenance schedules, support tickets with SLA timers
- **Marketing**: content calendar, LinkedIn, Facebook and Instagram publishing with posting rights, Canva designs
- **SOP library**: every procedure searchable by task, with acknowledgments, versions and per screen help
- **Mailbox intelligence**: once someone connects Outlook or Gmail, HQ reads their history, finds everyone they talk to, fills in title, company and phone from signatures, keeps last contact dates current, and flags emails waiting on a reply, people who went quiet and possible leads not yet in the CRM, with one click reminders
- **Assistant**: reads the CRM, the SOPs, and each person's own mailbox and calendar; drafts in their voice, never sends without them
- **MCP**: connect outside tools (Canva, media tools, accounting) to the assistant, and expose HQ itself to Claude Desktop and Claude Code with personal keys
- **Client portal**: self service sign up matched to the customer's company, or invitation by the team

## Run it locally

```bash
cp .env.example .env     # set DATABASE_URL, AUTH_SECRET, TOKEN_ENCRYPTION_KEY
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000. Sign in with one of the seeded owner accounts (see `prisma/seed.ts`).

## Deploy

Any Node host with PostgreSQL works (Vercel + Neon, Railway, Render, Fly). Set the variables from `.env.example`, run `npm run db:deploy` once, then `npm run build && npm start`. Point `hq.spectrumrobotics.ai` (or the path of your choice on the main site) at the deployment.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` / `npm run lint` | Static checks |
| `npm test` / `npm run test:e2e` | Unit and browser tests |
| `npm run db:migrate` / `db:deploy` / `db:seed` / `db:studio` | Database |

## Roles

| Tier | Who | What they see |
|---|---|---|
| Owner | Founders | Everything, including finance, settings, integrations, MCP, audit and team management. Owners decide who can post to social and who can discount. |
| Leadership | Department heads | Reports, approvals, SOP editing, client accounts, automations. No settings or finance unless granted. |
| Employee | Everyone else | Their own work: contacts, deals, tasks, tickets, SOPs, assistant, their own mailbox. |
| Client | Customers | The portal only: quotes, invoices, robots, support, documents, training. |

Owners grant or remove any single permission per person from **Team**. Defaults come from the tier, so a new hire is useful on day one and nothing sensitive is open by accident.

## Connect the outside world

Each integration is optional. Leave its variables empty and the related screen explains what is missing instead of failing.

| Service | Variables | Redirect or webhook URL to register |
|---|---|---|
| Microsoft 365 sign in | `AUTH_MICROSOFT_ENTRA_ID_*` | `https://<host>/api/auth/callback/microsoft-entra-id` |
| Google sign in | `AUTH_GOOGLE_*` | `https://<host>/api/auth/callback/google` |
| Outlook mail and calendar | `MICROSOFT_GRAPH_*` | `https://<host>/api/oauth/microsoft/callback` |
| Gmail and Google Calendar | `GOOGLE_WORKSPACE_*` | `https://<host>/api/oauth/google/callback` |
| QuickBooks | `QUICKBOOKS_*` | `https://<host>/api/oauth/quickbooks/callback` |
| LinkedIn | `LINKEDIN_*` | `https://<host>/api/oauth/linkedin/callback` |
| Facebook and Instagram | `META_*` | OAuth `https://<host>/api/oauth/meta/callback`, webhook `https://<host>/api/webhooks/meta` |
| Stripe | `STRIPE_*` | Webhook `https://<host>/api/webhooks/stripe` |
| Assistant | `ANTHROPIC_API_KEY` | none |
| System email | `SMTP_*` | none |

Microsoft Graph scopes used: `offline_access User.Read Mail.ReadWrite Mail.Send Calendars.ReadWrite`. Google scopes: Gmail modify and send, Calendar events. Tokens are encrypted at rest with `TOKEN_ENCRYPTION_KEY` and each person connects their own mailbox from **Inbox**.

### Scheduler

Point your host's cron (Vercel Cron, a GitHub Action, or any scheduler) at this every 5 to 15 minutes:

```
GET https://<host>/api/cron/automations
Authorization: Bearer <CRON_SECRET>
```

It runs time based automations, publishes scheduled social posts, sends digests, and once an hour syncs every connected mailbox to refresh people and follow up reminders (add `?mail=1` to force that part).

### MCP

**Outside tools into HQ.** Owners register any Streamable HTTP or SSE MCP server on the **MCP** page (Canva, Higgsfield, Creatify, OpenArt, or a QuickBooks bridge). Discovered tools are allow listed per server and limited by tier, then appear to the assistant automatically.

**HQ into Claude Desktop or Claude Code.** Anyone with the `mcp.keys` permission creates a personal key on the **MCP** page. The key carries that person's own permissions, so a client or employee key can never reach owner only data.

```json
{
  "mcpServers": {
    "spectrum-hq": {
      "type": "http",
      "url": "https://<host>/api/mcp",
      "headers": { "Authorization": "Bearer shq_..." }
    }
  }
}
```

## Where things live

```
prisma/           schema, migrations, seed data (products, SOPs, live CRM records)
src/app/(auth)    sign in, sign up, invites, password reset
src/app/hq        staff workspace, one folder per module
src/app/portal    client portal
src/app/api       OAuth callbacks, webhooks, cron, the HQ MCP endpoint
src/server/actions  server actions, one file per module, all return { ok, data | error }
src/lib           permissions, settings, mail providers, assistant tools, MCP gateway and server
src/components    ui primitives, hq and portal components
docs/             builder brief for module work
```
