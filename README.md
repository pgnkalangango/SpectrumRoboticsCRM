# Spectrum HQ

The company system for Spectrum Robotics. One sign in for owners, leadership and employees at `/hq`, and a separate client portal at `/portal` where customers review quotes, pay invoices, see their robots and open support tickets.

What is inside:

- **CRM**: contacts, companies, deals on a kanban, tasks, one timeline per customer
- **Quote to cash**: catalog driven quotes with purchase or monthly pricing, owner only discounts, online acceptance, invoices with Stripe payment links, QuickBooks sync
- **Service and fleet**: sites, deployed robots, maintenance schedules, support tickets with SLA timers
- **Marketing**: content calendar, LinkedIn, Facebook and Instagram publishing with posting rights, Canva designs
- **SOP library**: every procedure searchable by task, with acknowledgments, versions and per screen help
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
