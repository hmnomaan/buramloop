# BuramLoop roadmap

This roadmap reflects repository inspection as of 2026-11-03. A route, model,
screen, script, or prior AI summary is evidence of implementation only; it is
not proof that its workflow is complete. Mark work done only after its
acceptance checks pass. The current handoff prompt is
[BURAMLOOP_MASTER_PROMPT.md](./BURAMLOOP_MASTER_PROMPT.md).

## Verified foundation

- [x] pnpm monorepo has shared TypeScript/Zod, Express/Mongoose API, and
  React/Vite client packages.
- [x] Workspace `pnpm typecheck` and `pnpm build` pass; latest server tests
  pass (14 suites, 52 tests), including in-memory replica-set workflows for
  sourcing-to-receipt and receipt-to-trace/export.
- [x] API has login, cookie/JWT authentication, `/auth/me`, logout, RBAC
  middleware, audited mutations, reason middleware, and mounted feature
  routers.
- [x] API and client can be run locally; Docker API/MongoDB health was
  previously verified.
- [x] Client has the branded landing/login gateway and an authentication
  check on startup; server-provided session identity/permissions are used.
- [x] Nextcloud and local storage providers exist; recent Nextcloud path and
  HTTP handling changes have focused tests.
- [x] Barcode lookup and ZPL generation service code, an integrity job,
  backup script, and acceptance script exist.

These are foundation checks, not a declaration that all R1-R16 workflows are
complete. The server Jest suite has 14 suites and 52 tests at the latest
verified run, including receipt-to-trace and sourcing-to-receipt workflows
against an in-memory MongoDB replica set. Live deployment database, browser,
and Postman acceptance remain outstanding.

## P0 — Agree and implement flexible product/inventory model

**Status: Phase 1 and package-aware kg/L/piece receipt with exact total-weight
distribution integrated. Kg-based supplier leads, offer normalization,
contracts and shipped-contract receipt linkage are integrated. Non-kg
sourcing/pricing, multi-line lots, adjustments, and live API/browser/Postman
acceptance remain open; the transaction-backed sourcing/receipt workflow is
covered by an in-memory replica-set test.**

- [x] Confirmed initial product setup: Admin-managed materials/categories
  before sourcing; category labels remain extensible; units are `kg`, `l`,
  and `piece` with no automatic cross-unit conversion.
- [x] Material setup now allows non-kg units without a required drum weight,
  records optional package type and allergen status, validates the shared API
  contract, and prevents changing a material's unit after creation.
- [x] Legacy kg-based sourcing rejects non-kg materials explicitly. Receipt
  supports configured kg/L/piece units, and batch feasibility accepts only
  active HONEY materials measured in kg.
- [x] Batch feasibility allocates actual kg from drums and supported kg
  IBC/DRUM/BUCKET_TRAY stock packages without assuming a fixed drum weight;
  optionally selected eligible rework leftovers are blended before warehouse
  stock. All origin slices must satisfy the customer's country policy.
- [x] Batch origin composition uses exact allocated kg and source prices to
  calculate normalized weight (`pct`) and cost (`costSharePct`) distributions,
  retaining lot, package/drum, and rework provenance on the batch and inputs.
- [x] Batch and process controller responses mask price/cost shares from
  roles other than Admin and Management.
- [ ] Extend sourcing/contracts/prices beyond kg-priced materials; current
  sourcing normalizes kg/ton offers and package counts but does not support
  L/piece pricing or sourcing.
- [x] Record a configured material's package count/type, quantity and unit on
  an incoming lot; preserve the kg drum flow and do not generate drums for
  non-kg goods.
- [x] Receive kg packages from an exact total weight in kg or tonnes, calculate
  nominal per-package kg, and preserve the exact distributed package weights.
  Optional source-price entry is Admin/Management-only and enforced by the API.
- [x] Create non-drum package records and append-only quantity/unit ledger
  movements; apply QA rejection and supplier-return deltas in the same unit.
- [ ] Extend lots to multiple product lines/handling units, then add safe
  migration/backfill for existing lot and package records.
- [x] Capture sourcing material, package type/count, expected kg quantity and
  normalized per-package weight; carry contract terms through shipped-contract
  receipt linkage.
- [ ] Extend sourcing to non-kg categories and multi-line offers/lots.
- [ ] Complete batch allocation acceptance against persisted records,
  including partial rework consumption, concurrent reservation conflicts,
  persisted batch-input origin snapshots, and subsequent processing/rework
  traceability. Non-kg materials remain ineligible.
- [ ] Define honey-process constraints: unit conversion, stock ledger
  precision, losses, yields, origin composition, warm-room eligibility, and
  whether non-honey items can enter any batch/process stage.
- [ ] Add safe schema migration/backfill, preserving existing incoming lots,
  drum history, ledger totals, and traceability.

**Acceptance:** test receipt, partial use, adjustment/return, batch allocation,
and traceability for at least one drum-based honey product and one non-drum
product. Batch tests must verify mixed actual-weight drums/packages and
selected rework, country-policy enforcement, kg conservation, weight and cost
percentages, atomic reservation, and saved provenance. Units must remain
explicit; unapproved cross-unit conversions must be rejected, and the stock
ledger must reconcile without fabricating containers.

**Remaining decisions:** unit conversion remains disabled. The current model
does not yet define unit-aware prices/contracts or package-level barcode
identity. The confirmed initial rule is batchable kg honey only; current
allocation supports kg drums, kg IBC/DRUM/BUCKET_TRAY packages, and explicitly
selected available rework whose origin countries are allowed for the customer.
Do not infer conversions or eligibility for other package types.

## P1 — Complete accounts, profiles, and permission-driven access

**Status: Core self-service and account-creation slice implemented; broader
management and authorization acceptance remains open.**

- [x] Add an Admin-facing user directory and audited user-creation form,
  including assignment of an existing role and secondary Admin creation.
- [x] Add contextual account guidance, a permission summary, password
  confirmation, avatar preview, and an audited-reason confirmation dialog.
- [x] Add authenticated self-service password change with current-password
  verification, a 10-character minimum, forced first-use change for
  admin-created accounts, and token-version session invalidation.
- [x] Add self-service name and profile-image upload using the existing
  `StorageProvider`; validate image format/size and associate the attachment
  only with the authenticated user's account.
- [ ] Explicitly test an Admin creating another Admin; do not infer this only
  from the existence of an Admin-only user endpoint.
- [x] Complete Admin user update/deactivation UI and align all existing master
  user routes to the same validated API contract.
- [x] Filter sidebar and breadcrumb destinations through a shared UI access
  policy based on session roles and permissions.
- [ ] Continue permission-aware action visibility and authorization tests;
  client filtering is only a usability layer, and server RBAC remains the
  security boundary.
- [ ] Complete role-appropriate dashboards and work queues. The Operations
  Dashboard now has role-specific summaries and permission-aware shortcuts;
  remaining metrics, full server synchronization, and role-specific workflow
  acceptance are still open.
- [ ] Align the shared user schemas with the actual master controller/service
  payloads and validate all user-management routes.

**Acceptance:** Admin can create a regular user and another Admin with an
audited reason; each user can change their own password; unauthorized users
cannot discover or invoke restricted operations; profile picture upload and
deactivation behave consistently. The current build/typecheck pass, but
account endpoint integration, authorization and browser acceptance are still
required.

## P2 — Deliver receiving and warehouse barcode flow

**Status: Partial. Camera/manual capture, local OCR review, and API-backed
kg/L/piece package receipt are integrated. Kg-based shipped-contract links are
integrated; non-kg sourcing, duplicate barcode validation, and live
device/API acceptance remain open.**

- [x] Receive configured materials with supplier, quantity, unit, package
  count/type and optional barcode/OCR metadata through the live API; kg/L/piece
  quantities remain separate and only kg stock creates kg ledger balances.
- [x] Link kg-priced incoming receipts to shipped contracts, inherit the
  contract source price, and enforce cumulative kg/package receipt balances.
- [ ] Extend sourcing and contracts to non-kg units and multi-line product
  support.
- [x] Provide browser camera barcode scanning on supported devices, with a
  manual/keyboard-wedge fallback.
- [x] Add browser-side label OCR with editable operator review before applying
  extracted values; the label image is retained for upload after receipt.
- [x] Persist reviewed barcode/OCR fields as optional incoming-lot `labelData`,
  submit receipt to the real API, map the returned lot into the UI, and show
  API errors instead of fabricating receipt success.
- [x] Upload the captured label image as an incoming-lot attachment after
  successful receipt; retain an explicit retry action if upload fails.
- [ ] Add duplicate barcode validation and formal server barcode identity/
  uniqueness rules. Barcode currently remains descriptive metadata, not a
  unique lot/package identifier.
- [ ] Keep Zebra ZPL label generation where appropriate; add barcode field
  rules that prevent unsafe label content.
- [ ] Add tests for camera-unavailable, permission-denied, malformed,
  duplicate, unknown, and valid scan outcomes.

**Acceptance:** Warehouse staff can receive and identify supported package
types on mobile, without a desktop-only workflow or fabricated fallback
success.

The current UI uses ZXing browser decoding and Tesseract.js OCR in the
browser. Operators can review/edit extracted values before applying them.
For kg/L/piece receipts, the API stores barcode and extracted fields as
optional lot metadata, then the client uploads the captured image as an
incoming-lot attachment after receipt. Failed receipt is not reported as
success; photo-upload failure is shown separately with a retry action.
Barcode uniqueness/identity is not defined. Non-kg sourcing, inventory
adjustments, partial-use workflows outside shipped-contract balance tracking,
and live device/API acceptance remain open.
The Warehouse role's effective `stock:read` and `stock:write` permissions
expose the intake module, receiving controls, and scanner, including when
existing stored role grants are incomplete. QA access remains
read/review-oriented and does not expose the receive form.

## P3 — Finish coherent and usable UI workflows

**Status: Shell and pages exist; route coverage and polish are incomplete.**

- [x] Add the account/profile workspace with an Admin-only user directory and
  user creation.
- [x] Mount the Admin master-data workspace and connect its material and
  counter views/create-material action to the API, with visible load/write
  failures instead of demo data or optimistic fake success.
- [x] Mount the existing task-flow breadcrumb in the authenticated shell.
- [ ] Review all navigation destinations against their rendered content;
  separate warm-room from batch planning where they are distinct workflows.
- [ ] Expand breadcrumb coverage and permission filtering to every actionable
  module; the current flow breadcrumb is a first integrated slice.
- [ ] Add concise, consistent info/help controls for unfamiliar fields,
  permissions, status transitions, and units.
- [x] Replace process and shipment screen mock/static mutations with live API
  reads, audited writes, refreshes, and surfaced errors. Process loads batches
  plus tanks/fill lines; shipment loads lots, completed batches and customers.
- [x] Replace the fixture sourcing board with API-backed lead, offer, gate,
  contract, and shipping operations with visible errors and audit reasons.
- [ ] Review remaining offline-preview `catch` blocks that make failed
  mutations look successful. Dashboard warm-room checkout and
  process/shipment workflows report API failures; other
  operational screens still need the same review.
- [ ] Use MongoDB/API data as the source of truth; identify and remove or
  clearly label remaining static demo fixtures. Dashboard lot, warm-room,
  batch, and sourcing reads are API-backed; Admin costs and trace/audit now
  use live APIs. Stock movements and notifications are not synchronized and
  other standalone workspaces still need review for fixtures.
- [ ] Establish shared loading, empty, validation, error, success, and
  confirmation patterns.
- [ ] Review all screens at phone, tablet, and desktop breakpoints, especially
  warehouse receiving, barcode scan, forms, tables, dialogs, and navigation.
- [ ] Add accessible focus/keyboard behavior, semantic labels, and tests for
  critical user flows.

**Acceptance:** each role sees only permitted destinations/actions; a user
can follow breadcrumbs through an agreed workflow; every mutation reports its
real server outcome; responsive and accessibility checks pass at target sizes.

## P4 — Verify business API workflows and data integrity

**Status: Targeted and transaction-backed workflows are tested; broader API
and live-environment acceptance remains open.**

- [x] Test sourcing lead registration, offer normalization, Management/sample/
  QA gates, contract and shipment transitions, linked partial receipts,
  inherited pricing, ledger/origin entries, and kg/package over-receipt
  rejection in one `MongoMemoryReplSet` workflow. Seven offer-normalization
  tests also cover kg/ton and price bases. Live API/browser/Postman acceptance
  remains open.
- [ ] Test drum stock and append-only ledger sign rules, warm-room movements,
  batch feasibility/reservation, processing mass balance, rework, QA release,
  and shipment creation. Focused tests cover cost source-price provenance and
  shipment R9 masking. Batch service tests cover mocked-query feasibility with
  71 variable-weight drums, a package and rework, plus country-policy
  rejection. Process/origin unit tests cover leftover slice preservation and
  multi-origin blending. A MongoMemoryReplSet test verifies receipt, QA, batch
  reservation, processing/rework, re-blending, shipment, costing, and
  trace/export role behavior as one transaction-backed workflow; live
  deployment database and browser/Postman acceptance remain required.
- [ ] Test permission denial, reason enforcement, state-transition rejection,
  transaction rollback, duplicate requests, and concurrency.
- [x] Exercise trace forward/backward lineage, Inspector masking, export
  logging, and append-only audit/export records in the MongoMemoryReplSet
  workflow test.
- [ ] Verify trace, export, and log behavior against live operational records
  and through browser/Postman acceptance.
- [ ] Test notifications and scheduled integrity checks, including visible
  reporting when the job detects inconsistencies.
- [ ] Resolve the host-versus-Compose Mongo URI for the seed command, then
  verify repeatable seed behavior against an explicitly disposable database.
- [ ] Verify `/api/v1/health/full`, startup/shutdown, replica-set transactions,
  Nextcloud/local storage and attachment failure compensation.

**Acceptance:** automated tests cover success and failure for each critical
business transition; seed is repeatable and verified on a disposable DB;
health and integrity checks report actual status.

## P5 — Release and operations

**Status: Artifacts exist; operational readiness remains unverified.**

- [ ] Run clean install and all tests/builds on a clean checkout and CI.
- [ ] Review cookie flags, secrets, CORS, uploads, rate limits, audit privacy,
  production RBAC, Admin bootstrap, and rotation/revocation behavior.
- [ ] Verify coordinated MongoDB + Nextcloud data + Nextcloud database backup
  and restore; backup scripts must be tested, not merely present.
- [ ] Document deployment, migrations, incident response, retention, restore,
  and acceptance procedures.
- [ ] Conduct warehouse and business-owner acceptance testing.

**Acceptance:** clean CI and restore drill pass, deployment configuration has
no development credentials, and business owners sign off the workflows.

## Current status versus supplied ctx-v31 prompt (reconciled 2026-11-02)

- API route files and services exist, but existence is not equivalent to
  tested completion. The previous “all routers/workflows DONE” claim needs
  route-level authorization and workflow test evidence.
- Barcode lookup (GET /api/v1/stock/barcode/:code) and Zebra ZPL generation (GET /api/v1/stock/drums/:id/zpl-label) are mounted in the stock router. The mobile camera barcode scanner and OCR are integrated with warehouse intake.


- The app has 11 distinct sidebar destinations with separated Warm Cabinets and Batch Planning workspaces, a 5-tab Master Data workspace, an Admin user management directory with update/deactivation/password-reset UI, and live notification and stock movement feeds.

  Admin costs and trace/audit are API-backed following ctx-v53; the sourcing
  board is API-backed following ctx-v54, while other
  standalone views still need review for static fixtures and offline fallback.
- Authentication/session restoration and logout are wired. Self-service
  password change, profile update/avatar upload, an Admin user directory and
  audited user creation now exist, including first-password-change gating.
  Admin update/deactivation, endpoint integration tests and live browser
  acceptance remain outstanding. Process and shipment UI work is API-backed,
  but has not yet been accepted in a live browser/database workflow.
- Incoming-lot receipt supports package-level kg/L/piece quantities; only
  active kg honey is batch-eligible. Kg receipts accept total mass in kg or
  tonnes and calculate exact package weights and nominal average weight.
  Optional source prices are Admin/Management-only and enforced by the API.
  Batch allocation supports actual weights from eligible kg drums and
  IBC/DRUM/BUCKET_TRAY packages, plus explicitly selected available rework,
  with combined origin weight/cost percentages. Batch/process response price
  fields are masked for other roles. One receipt-to-trace/export workflow now
  runs transactionally against MongoMemoryReplSet; live deployment database
  acceptance remains outstanding, and non-kg stock remains ineligible.
- A role-personalized Operations Dashboard summary and permission-aware
  shortcuts are implemented, and camera barcode/OCR capture is integrated
  with warehouse intake. Remaining dashboard work includes synchronized
  movement/notification metrics and role-specific work queues. A consistent
  info/help pattern and responsive acceptance tests remain outstanding.
- Latest observed checks: `pnpm build`, `pnpm typecheck`, and `pnpm test`
  passed (9 suites, 32 tests). No comprehensive production workflow, live
  camera, or end-to-end authorization acceptance was run.

## Prioritization rule

Resolve the product/unit data model before extending receiving or batch UI;
those decisions affect schemas, ledgers, sourcing, contracts, labels, and
traceability. In parallel, stabilize account/session requirements. Then
deliver role-based warehouse and sourcing workflows vertically, with tests
before marking them done. Record scope changes and evidence in the
[project tracker](./PROJECT_TRACKER.md), [issue register](./ISSUES_AND_FIXES.md),
and [daily log](./DAILY_LOG.md).