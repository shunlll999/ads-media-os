# Media OS Gateway

Standalone NestJS service using Prisma and PostgreSQL for projects, inventory, creatives, campaigns, screens, playback, programmatic records and commercial workflows.

## Local startup

From the workspace root:

```bash
npm run gateway:setup
npm run gateway:up
```

The gateway listens on `http://127.0.0.1:4000`; PostgreSQL uses local port `5433`. Setup generates private local credentials without publishing them. Uploaded media and database records use persistent Docker volumes.

## Authentication

Administrative APIs require JWT authentication and role guards. Supported roles are admin, editor, operator, commercial and viewer. Screen player APIs use pairing tokens. Retrieve the generated local administrator credentials with `npm run account:admin` from the workspace root.

## Data

The public seed contains fictional projects and sample inventory. A local ignored `data/seed.json` overrides `data/seed.example.json`. Use `SEED_DEMO=false` to disable demo record seeding. Existing database records are preserved.

Public metadata synchronization only permits hosts configured through `PROJECT_PUBLIC_HOSTS`. Real SSP/DSP integrations require vendor-specific adapters; the bundled adapter is explicitly mock.

## Tests and shutdown

From the workspace root:

```bash
npm run gateway:test
npm run gateway:down
```

Shutdown preserves database and upload volumes. No private deployment configuration or operational notes are included in the public repository.
