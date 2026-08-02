# PayRail

Subscription billing orchestration with plans, invoices, and a simulated payment-provider webhook.

## Stack

- **Fastify + TypeScript** — compact billing API
- **Prisma + PostgreSQL** — customers, plans, subscriptions, invoices
- **Zod** — request validation
- **Vitest** — subscription state machine and proration helpers
- **Docker Compose** — api + Postgres

## What was built

- Seeded plans (`free`, `pro`, `enterprise`) with amounts in cents
- Customer creation and subscription start (opens an invoice)
- Invoice listing and subscription detail
- Provider webhook (`POST /webhooks/provider`) that applies success/failure transitions
- Dunning path: `ACTIVE` → `PAST_DUE` → `CANCELED` after repeated failures
- Minimal HTML console to mark invoices paid or failed

## Run locally

```bash
cp .env.example .env
docker compose up -d db
pnpm install
pnpm db:push
pnpm db:seed
pnpm dev
```

- App: http://localhost:3003
- Postgres host port: **5435**

Seed prints `customerId`, `subscriptionId`, and `providerRef` (`inv_demo_open`).

### Docker

```bash
docker compose up --build
```

### Tests

```bash
pnpm test
```

## Design notes

Money is stored as integer cents to avoid floating-point drift. Webhook handling is idempotent enough for demos via unique `providerRef`. Production would add signature verification, outbox events, and a real retry worker.
