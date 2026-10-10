# Ads Media OS

An independent portfolio prototype for out-of-home campaign planning, programmatic operations, screen playback and commercial workflows. All bundled projects and inventory are illustrative examples. No company affiliation or real advertising purchases are implied.

## Stack

- Next.js App Router, React, TypeScript and SCSS
- Leaflet maps with a configurable tile provider
- NestJS gateway, Prisma ORM and PostgreSQL
- Docker Compose with persistent database and upload volumes
- JWT sessions and role-based API guards

## Workspace

| Area | Features |
|---|---|
| Planning | Overview, inventory map, media planner and campaigns |
| Programmatic | Deals, transactions, SSP/DSP configuration and delivery monitoring |
| Operations | Creatives, screens, onboarding, approvals and issues |
| Data | Audience segments, catalog import/export, source configuration and analytics |
| Commercial | Proposals, revenue, invoices and saved reports |
| Administration | CMS, accounts, settings and audit history |

Deal and campaign lifecycle rules protect active records. Mock transactions support correction and removal; imported partner transactions preserve their history. Historical records may be archived instead of physically deleted.

## Run locally

Requirements: Node.js 22.12 or newer, npm, Docker and Docker Compose.

```bash
npm install
npm run gateway:setup
npm run gateway:up
npm run dev
```

Open `http://localhost:3000`. The gateway runs at `http://127.0.0.1:4000`; PostgreSQL uses local port `5433`.

Setup generates credentials in ignored local environment files. Retrieve your local administrator login with:

```bash
npm run account:admin
```

For a fully containerized stack:

```bash
npm run local:up
```

Open `http://127.0.0.1:3001`. To stop containers while preserving their data:

```bash
npm run local:down
```

For the gateway-only stack, use `npm run gateway:down`. These commands retain data volumes.

## Roles

| Role | Write permissions |
|---|---|
| admin | All resources, users and settings |
| editor | Projects, inventory, creatives, audience and data sources |
| operator | Campaigns, deals, mock transactions, screens, partner configuration and issues |
| commercial | Proposals, invoices, revenue targets and reports |
| viewer | Read-only access to permitted pages |

## Example data and customization

The public repository includes fictional examples in `media-os-gateway/data/seed.example.json` and `media-os-gateway/data/import.example.json`. A private local `seed.json`, when present, takes precedence over the example seed. Existing database records are preserved; setting `SEED_DEMO=false` disables demo record seeding.

Owner-specific presentation values can be supplied through `.env.local`; optional public presentation variables are listed in `.env.example`. Values prefixed with `NEXT_PUBLIC_` are visible in browser bundles and must never contain secrets.

Project metadata sync is restricted by the `PROJECT_PUBLIC_HOSTS` allowlist. Uploaded files, owner-specific project images, private data, local deployment settings, database backups and operational notes are excluded from version control.

## Validation

```bash
npm run lint
npx tsc --noEmit
npm run build:webpack
npm run gateway:test
```

## Prototype boundaries

- SSP/DSP synchronization uses mock adapters; real providers require an authorized vendor adapter and credentials.
- Player telemetry records browser playback, not independently verified audience reach.
- Audience estimates are explicitly sourced metadata, not a connected measurement service.
- Paid status is a manual workflow record, not bank settlement.
- Saved reports are snapshots calculated from persisted source records.

Area-photo attribution and licenses are retained in `public/areas/CREDITS.txt` and displayed where applicable.
