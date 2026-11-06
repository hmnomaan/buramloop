

*Last documentation sync: 2026-11-06*

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
the server suite currently has 15 suites and 57 tests, including in-memory
replica-set workflows for sourcing-to-receipt and receipt-to-trace/export.
Receiving accepts exact total kg/ton mass and displays computed package weights;
source price entry is optional, Admin/Management-only in the UI, and enforced
at the API. Batch planning is API-backed and supports selected available
rework. Authentication/session restoration and logout exist.

Recent major milestones delivered and verified:
- **German DIN 1333 & DIN 5008 Typographic Standardization (`shared/src/schemas/formatters-de.ts`):**
  German tabular decimal comma formatting (`6.704,0 kg`, `68,7 %`, `8,2 mg/kg`), DIN 5008 dates (`DD.MM.YYYY`), and 24-hour Berlin time (`DD.MM.YYYY · HH:mm Uhr MEZ`).
- **Multi-Language Regulatory Traceability (DE | TR | EN | BN):**
  Four-language support across all headings, badges, and inspection labels (*Amtssprache Deutsch* per VwVfG § 23, Turkish *Türkçe*, English, and Bangla *বাংলা*).
- **HonigV Anlage 2 Physicochemical Parameter Surfacing:**
  Joined from `LabReportModel` onto every traced `IncomingLot` (moisture % <= 20,0%, HMF <= 40 mg/kg, diastase >= 8 DN, C4 sugar, and NMR authenticity).
- **IFS Food v8 Clause 4.18.2 Instant Regulatory Hold (`POST /api/v1/trace/:code/regulatory-hold`):**
  Atomically locks unconsumed drums (`status: 'Quarantine'`), transitions non-shipped downstream shipment lots to `QA_HOLD`, appends stock movement records, emits critical notifications, and records immutable audit logs inside an ACID transaction.
- **Decoupled Admin Audit & Compliance Center (`AdminAuditAndComplianceWorkspace.tsx`):**
  Completely separated from product traceability (`activeModule === 'AUDIT_DOCS'`). Four-tab governance architecture (`Audit trail`, `Stock ledger`, `Export history`, `Documents`), multi-parameter filter panel with quick date presets, side-by-side Visual Key Diff modal, live Nextcloud WebDAV health monitor, and direct CSV export download.
- **In-App & PWA Native Push Notifications:**
  Role-targeted push alerts with Web Audio synthesized chimes, bottom 2s auto-fading toasts, notification bell hover preview + click-to-pin open, and PWA Service Worker push routing (`sw.js`, `manifest.json`).
- **Dynamic Data Binding & Resilient Envelope Unwrapping:**
  Guaranteed dynamic data delivery across all endpoints with dual-envelope parsing for `{ ok, data }` and raw arrays.
- **Dual Traceability Route Model & Admin Route RBAC Gate (`BL-057`, `BL-058`):**
  5-step sequence stepper (1: Lots, 2: Drums, 3: Batch, 4: Route/Stations, 5: Certificate Preview), Operational Station Telemetry Strip (Dock WE -> CAB-01/02 -> FLT-01 -> MIX-01 -> Packaging -> OUT Dock), and deep Operational Route Step Inspector Modal for Staff/Admin. Government Inspectors and unauthorized roles are strictly locked to masked regulatory route via backend enforcement in `TraceController.lookup`.
- **Dynamic Dashboard Sidebar & Live Telemetry Badges (`BL-059`):**
  Role-gated sidebar navigation restricting `Audit, Nextcloud & Exports` to authorized roles with live Nextcloud WebDAV status chip (`LIVE` / `SYNC`), and real-time operational badges (pending QA lots, warm cabinet occupancy, active batches, active processes, and active shipments).
- **Dynamic Roles & Authorized Module Permissions Matrix (`BL-060`):**
  Dynamic role customization panel in `UserAndProfileWorkspace.tsx` mapping 25 system permissions across 6 module categories. Enables Admin to create custom dynamic roles, adjust permissions on existing roles with GoBD reasons, and provision users with any role featuring real-time permission preview chips.

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
- **R15 — Inspection Trace Dual Graph & Product Journey Decoupling (Admin vs. Government):**
  - **Domain Separation:** Product Traceability strictly tracks the physical, chemical, and operational journey of the honey (`Intake ➔ Drum Stock ➔ Warm Cabinets ➔ Filtration ➔ Blending/Rework ➔ Resting Tanks ➔ Packaging Line ➔ Customer Dispatch`). Financial KPI bars, blend costs, margins, and selling prices are strictly decoupled from product trace views and preserved for the dedicated "Costs, Margins & Reports" (`ADMIN_COSTS`) workspace.
  - **Admin View (Detailed Operational Route):** Features a 5-step process sequence stepper (`1: Source Lots`, `2: Drums & Containers`, `3: Production Batch`, `4: Route & Stations`, `5: Certificate Preview` + `All Steps` 6-column flow), a physical station strip (`Dock WE` ➔ `CAB-01/02` ➔ `FLT-01` ➔ `MIX-01 / TANK-01` ➔ `QUIEL_PET / CARLO_JAR` ➔ `OUT-DOCK`), and an interactive Operational Route Step Inspector Modal (`OperationalInspectionModalState`) detailing machine IDs, operator in charge, duration/dwell times, DIN 1333 mass balance (In, Out, Loss, Rework kg), and legal counterparties.
  - **Govt View (Masked Graph):** Regulatory compliance graph: `Product ↔ Batch ↔ Events (Ins/Outs only)`. Honey source country ONLY (commercial supplier identities, leads, and purchasing contracts redacted to `SUPPLIER-<country>` and `BUYER-<country>`). Full lab verification: QSI Bremen lab results (`HMF <= 40 mg/kg`, `Moisture <= 20%`, `Diastase >= 8 DN`, `C4/NMR`) and in-house lab analysis. Strictly NO price or commercial financial data. Clicking records filters the GoBD stock movement ledger without exposing proprietary plant telemetry. Official compliance contacts included.
- **R16 — Decoupled System Governance (Audit, Nextcloud & Exports vs. Traceability):**
  - **Traceability** is strictly dedicated to the product lifecycle graph (Admin full provenance graph vs. Govt masked regulatory graph).
  - **Audit, Nextcloud & Exports** is an independent, cross-cutting system governance domain.
  - **Universal Immutable Audit Trail:** Spans the system end-to-end across every module (`SOURCING`, `INCOMING_QA`, `WAREHOUSE_STOCK`, `WARM_CABINETS`, `BATCH_PLANNING`, `PROCESSING`, `SHIPMENTS`, `MASTER_DATA`, `AUTH`, `STORAGE`, and `EXPORTS`). Every state mutation records immutable actor attribution, CET timestamps, required operator reasons, and before/after change snapshots.
  - **Nextcloud & Compliance Exports:** Handles tamper-proof document archiving (QSI certificates, intake photos, batch log sheets) and compliance data dumps independently of product trace visualizers.
