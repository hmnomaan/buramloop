

*Last documentation sync: 2026-11-02*

This is the concise project index and handoff pointer. For full verified
implementation status, requirements, decisions to confirm, and the next-step
register, use the [BuramLoop master prompt](./BURAMLOOP_MASTER_PROMPT.md).

## Repository

BuramLoop is a pnpm monorepo with a TypeScript/Express/Mongoose API, a
React/Vite client, shared TypeScript/Zod schemas, MongoDB replica-set
transactions, and local/Nextcloud storage adapters. Docker Compose provides
the database and supporting services.

## Commands

- `pnpm dev` — start local client and API (supporting containers must be up).
- `pnpm typecheck` — typecheck shared, server, and client.
- `pnpm -r build` — build workspace packages.
- `pnpm --filter @buramloop/server test` — run server tests.
- `docker compose up -d --build` — build and start the container stack.

Use the [environment guide](./ENVIRONMENT_SETUP.md) for environment setup,
seed command, health checks, and stop procedures. Never commit `.env` values.

## Current status summary

The latest workspace typecheck, production build, and server test run passed;
the server suite currently has nine suites and 32 tests. Receiving accepts
exact total kg/ton mass and displays the computed average package weight;
source price entry is optional, Admin/Management-only in the UI, and enforced
at the API. Batch planning is API-backed and supports selected available
rework. Authentication/session restoration and logout exist. Many business
flows still lack integration/acceptance tests.

Important unfinished scope:

- Admin material setup now records independent `kg`, `l`, or `piece` units,
  optional package type and allergen status; units cannot be changed after
  creation. No automatic unit conversion is allowed. Existing sourcing and
  kg drum receipt remain compatible; package-aware kg/L/piece receipt creates
  quantity-aware packages and append-only unit ledger records. Batch
  feasibility accepts active kg honey only and now blends eligible actual-
  weight drums and kg IBC/DRUM/BUCKET_TRAY packages with explicitly selected
  available rework. Batch origins preserve source lot/package/rework,
  normalized weight and cost percentages. Process-generated leftover rework
  also retains origin slices, source references, unit prices, cost values, and
  cost shares; shared derivation scales from exact parent slice weights.
  Batch and process serialization masks prices for non-Admin/Management roles.
  Generic sourcing/contracts/pricing, adjustments/partial use, and live
  receipt/batch/process acceptance remain open.
- Self-service password change, profile name/avatar upload, first-login
  password-change enforcement, session revocation, and Admin user
  directory/create are implemented. Admin update/deactivation UI, account
  endpoint integration tests, and browser acceptance remain open
  ([BL-027](./ISSUES_AND_FIXES.md#resolved)).
- Barcode lookup service code exists; duplicate barcode identity/uniqueness
  and complete traceability acceptance remain open. Camera/manual scanning
  and reviewed OCR metadata are integrated into warehouse intake.
- Master data is mounted as an Admin-only destination and loads material and
  counter records from the API; material creation uses the audited API and
  exposes unit/package/allergen configuration. The active receiving screen
  is the package-aware `client/src/pages` workspace; the tagged
  `client/client/src/pages` copy is not mounted. The task-flow breadcrumb and
  role/permission filtering are present, though coverage and responsive
  acceptance remain incomplete. The Operations Dashboard has role-specific
  summaries and permission-aware shortcuts, but some metrics are not
  synchronized.
- Operational pages contain static/demo data and some offline catch-and-
  continue behavior that can imply fake success.

The batch feature includes `includeReworkIds` on simulation and reservation:
selected rework must be available, non-void, unreserved, material-compatible,
and compliant with the customer's country policy. The reservation consumes
rework and reserves stock transactionally in code; tests currently mock
database queries, so live MongoDB transaction acceptance remains outstanding.

The avatar download is `GET /auth/profile/avatar`; upload remains
`POST /auth/profile/avatar`. See the [Postman API testing guide](./POSTMAN_API_TESTING.md)
for the route inventory and safe test sequence. Do not treat implementation as
production acceptance. See the [roadmap](./ROADMAP.md), [issue register](./ISSUES_AND_FIXES.md),
[daily log](./DAILY_LOG.md), and [project tracker](./PROJECT_TRACKER.md).

## Seed safety

`pnpm seed` writes roles and sample/master data. Review
[`server/src/seeds/seed.ts`](../server/src/seeds/seed.ts), set
`SEED_ADMIN_PASSWORD` only when creating the initial admin, and confirm the
target database first. On Windows, host-run commands must override
Compose-only `mongodb` DNS with the documented published-port URI. The seed
has not yet been successfully verified against a database.

## Operational & architectural notes (preserved from client UI)

To keep the operator client UI uncluttered, the following internal rule codes,
storage paths, and domain equations are maintained here in documentation rather
than displayed inline on screen headers and labels:

- **R1 — Gated Sourcing Pipeline:** `OFFER → EXTERNAL_ANALYSIS → SAMPLE → INHOUSE_QSI → CONTRACT → SHIPPED → LOT`. Offers normalize mass to `kg` per package and price to `EUR/kg`; external analysis requires `management:approve`.
- **R2 — Master Data & Sequence Counters:** Materials define an immutable unit (`kg`, `l`, or `piece`), optional default package type, and allergen flag. Only active `kg` `HONEY` materials count toward batch origin composition.
- **R3 & R4 — Warehouse Intake, Unit-Aware Packages & Append-Only Ledger:** Incoming lots enter `UNDER_REVIEW` (`Quarantine`) until QA passes QSI review (`POST /stock/lots/:id/review`). Every stock state change writes an immutable row to `stockMovements` (`1 standard drum = 290.0 kg`, though variable-weight drums and `IBC`/`DRUM`/`BUCKET_TRAY` packages are supported). Units (`kg`, `l`, `piece`) never auto-convert.
- **R5 — Dedicated Warm Room (2 × 17 Cabinets, `CAB-01` & `CAB-02`):** 34 physical drum slots (max `9,860 kg` at `290 kg`/drum). Supports one-by-one barcode/label scanning, batch assignment, warming presets (`6h, 12h, 18h, 24h, 30h, 36h, 42h, 48h`, or custom `1–120h`), target chamber temperature (`40–45°C`), and a sensor-ready thermal telemetry model (`20°C` ambient → target `°C`) ready to bind hardware IoT room/cabinet temperature probes.
- **R6 — Batch Feasibility & Multi-Origin Blending:** `Batch No === Process No`. Blends selected available rework (`RW-YY-NNNN`) first, then allocates compatible stock packages/drums (`6,000 kg` planned input with `9,000–9,500 kg` admin buffer).
- **R7 — 7-Stage Process Execution & Rework Serialization:** Stages progress through `RESERVED → WARMING_IN → WARMING_OUT → FILTERING → BLENDING → RESTING_TANK (TANK-01 / TANK-02) → FILLING (QUIEL_PET / CARLO_JAR / HAND) → COMPLETED`. Every stage enforces strict mass conservation (`inKg = outKg + lossKg + reworkOutKg`, tolerance `±0.001 kg`). Positive `reworkOutKg` auto-serializes a `ReworkStock` (`RW-YY-NNNN`) and warehouse drum (`DR-RW-YY-NNNN`) preserving 100% inherited `originComposition[]`. Stage logs archive under Nextcloud path `BuramLoop/Batches/{processNo}/{stage}_LOG`.
- **R8 — Outbound Shipment LOT Compliance:** Enforces customer 1–3 allowed origin countries and blocks prohibited origins before releasing a completed batch (`DONE`) into a `ShipmentLot`.
- **R9 — Commercial Cost & Price Masking:** Supplier prices, weighted EUR/kg blend costs, and margin reports (`/costs`) are restricted to `Admin` and `Management` roles and stripped by server-side serializers for other roles.
- **R10 & R14 — Deviations, RBAC & Immutable Audit Trail:** Process loss exceeding `2.5%` of `inKg` or early warm-room checkout emits a `WARNING` notification. Every state-mutating action requires an operator reason (`min 5 chars`) persisted to `auditLogs` (hard deletes and overwrites are blocked by Mongoose pre-hooks).
