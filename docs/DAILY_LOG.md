# Daily work log

Record work by local date. Keep this log concise and include verified outcomes
as well as remaining blockers; do not treat an attempted command as a passing
check.

## 2026-10-26

- Investigated `pnpm install` failing during workspace discovery because
  `client/package.json` was empty.
- Added a valid private client package manifest.
- Confirmed pnpm could list `@buramloop/client` in the workspace.
- Install then reached pnpm 12's approval gate for `argon2` and `esbuild`
  scripts; see [BL-008](./ISSUES_AND_FIXES.md#resolved).

## 2026-10-27

- Fixed server environment loading so root `.env` works when launched through
  the server package; added local-secret ignore protection and setup docs.
- Fixed shared package resolution/build order for the server development
  command.
- Investigated the captured 57-error workspace typecheck report. Implemented
  missing Mongoose models and reconciled audit/error helper, stock threshold,
  and sourcing schema/API validation contracts.
- Fixed duplicate MongoDB connection and moved storage initialization ahead
  of HTTP listen; made login explicitly select the password hash.
- Removed duplicate auth/master router registrations in the app setup and
  recorded the fix.
- Recorded incomplete feature areas as follow-up items rather than
  representing them as resolved.
- Validation passed: `pnpm typecheck`, `pnpm -r build`, model-registry and
  sourcing-schema runtime smoke checks, and `git diff --check`.
- Still unverified: full API startup with live MongoDB/storage and
  end-to-end workflows.

## 2026-10-28

- Investigated `pnpm --filter @buramloop/client typecheck` failing with
  `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`.
- Root cause: the client package had no `typecheck` script and no complete
  TypeScript/React type configuration.
- Added client typecheck configuration and required React, icon, Vite, and
  TypeScript package metadata; refreshed the workspace lockfile.
- Validation passed: `pnpm --filter @buramloop/client typecheck`.
- The workspace check exposed seven batch errors, followed by a server build
  report with 10 errors across batch/process/shipment; tracked together as
  [BL-014](./ISSUES_AND_FIXES.md#resolved).
- Reconciled those module contracts with the current auth, model, transaction,
  and audit APIs; added the drum batch-reservation reference and corrected
  process/shipment audit and route typing.
- Validation passed: `pnpm --filter @buramloop/server build`, `pnpm typecheck`,
  `pnpm -r build`, and `git diff --check`.
- Fixed the server Jest failure caused by an empty integration test file;
  configured TypeScript transformation and added API error-response tests
  ([BL-015](./ISSUES_AND_FIXES.md#resolved)).
- Validation passed: `pnpm --filter @buramloop/server test` (2 tests),
  `pnpm typecheck`, and `git diff --check`.
- Started the API/client locally. The API was already running; MongoDB and
  local storage health checks passed. Added the missing client HTML/React entry,
  Vite API proxy, and Tailwind/PostCSS processing; added workspace dev scripts
  so `pnpm dev` starts both API and client ([BL-016](./ISSUES_AND_FIXES.md#resolved)).
- Validation passed: client build and typecheck; browser rendered the dashboard;
  `http://127.0.0.1:5173/` returned HTTP 200 and the proxied API health endpoint
  reported `dbState: connected`.
- Follow-up remains: the client has a dashboard shell, but most screens
  are incomplete ([BL-010](./ISSUES_AND_FIXES.md#open--needs-follow-up)).
- Added a PowerShell command reference for dependency startup, running the
  app, health checks, build/typecheck/tests, preview, and optional seeding in
  [the environment guide](./ENVIRONMENT_SETUP.md).
- Documented how to stop both local apps together or individually with
  Ctrl+C, how to stop a verified listener PID if its terminal is gone, and
  how to stop Compose dependencies separately.
- Fixed the Docker build failure where compiling `@buramloop/shared` could not
  resolve `zod`; excluded host pnpm junctions from image contexts, aligned
  pnpm versions, and made both image builds fail explicitly on package errors
  ([BL-017](./ISSUES_AND_FIXES.md#resolved)).
- Verified `docker compose build server client` produced both images and
  `docker compose config --quiet` passed.
- Follow-up remains: the containerized API had not yet been started and
  validated against MongoDB at the time of this entry.

## 2026-10-29

- Reviewed the proposed seed implementation against current models and route
  permissions. Found invalid/mismatched model fields and unsafe default admin
  password behavior ([BL-019](./ISSUES_AND_FIXES.md#resolved)).
- Updated the seed script to validate environment, add supplier/customer
  sample records, use actual schema fields, preserve existing admin/master
  activation state, and always close its database connection. Added docs for
  safe initial admin seeding.
- Fixed the `UserModel.create` single-document return type found by the first
  typecheck and removed unused seeded permission names. Server tests passed
  (1 suite, 2 tests); server typecheck and build passed on rerun.
- Populated the project context doc with verified setup/status and links to the
  issue register, daily log, roadmap, and environment guide. Did not run the
  seed against the configured database because it writes master data.
- The user's seed attempt then failed before connecting: a host-run pnpm
  process used Compose-only MongoDB DNS (`mongodb`), yielding
  `getaddrinfo ENOTFOUND mongodb`. Documented the host-published Mongo URI
  override for PowerShell and tracked the pending successful rerun as
  [BL-020](./ISSUES_AND_FIXES.md#open--needs-follow-up).
- Fixed the client workspace typecheck failure on shared `.ts` import suffixes
  by enabling `allowImportingTsExtensions` in the client no-emit TypeScript
  config ([BL-021](./ISSUES_AND_FIXES.md#resolved)).
- Validation passed: `pnpm typecheck`, `pnpm -r build`, and `git diff --check`.
- Investigated Docker server restarting after each failed startup attempt.
- Fixed the emitted entrypoint path and copied pnpm package-local dependency
  links into the production image.
- Corrected the MongoDB replica-set advertisement from container-inaccessible
  `127.0.0.1:27017` to the Compose hostname `mongodb:27017`, including the
  persistent replica-set config and Compose healthcheck; documented a direct
  connection URI for host-run development ([BL-018](./ISSUES_AND_FIXES.md#resolved)).
- Verified the server container is running with zero restarts, MongoDB is
  healthy, API health returns HTTP 200 with a connected database, and the
  client reverse proxy also returns the healthy API response.
- Selectively adopted the Nextcloud provider update: checked `MKCOL` statuses,
  made root-prefixed paths consistent, rejected traversal segments, retained
  recursive folder creation and safe health output, and made `statObject`
  distinguish 404 from provider errors. Added focused provider tests
  ([BL-022](./ISSUES_AND_FIXES.md#resolved)).
- Validation passed: server typecheck/build, server tests (2 suites, 5 tests),
  and `git diff --check`.
- Added client session restoration via `/auth/me`, gated the ERP behind an
  authenticated server session, mapped roles/permissions from the backend,
  and added sign-out. Removed local offline login acceptance and baked-in
  preset passwords ([BL-023](./ISSUES_AND_FIXES.md#resolved)).
- Validation passed: client typecheck/build and `git diff --check`.
- Compared the repository with the supplied ctx-v31 completion summary and
  user's expanded product, account, mobile receiving, and UX requirements.
  Recorded the verified gaps in [BL-024 through BL-026](./ISSUES_AND_FIXES.md)
  and reordered the roadmap with product/unit modeling first.
- Created the reusable [ctx-v32 master prompt](./BURAMLOOP_MASTER_PROMPT.md)
  and updated project context, tracker, and context history. Key unresolved
  business decisions (unit conversions and which products can enter honey
  processing) are explicitly marked for confirmation; no schema migration
  or database mutation was performed.
- Implemented the account/profile slice tracked by [BL-027](./ISSUES_AND_FIXES.md#resolved):
  self-service password changes with current-password verification and
  10-character minimum, token-version session invalidation, enforced first-use
  password changes, validated name/profile-image updates using the storage
  provider, and an Admin user directory/create-user form that supports creating
  another Admin with an audited reason. Updated the User schema, auth
  middleware/service, attachment types, client session state, and navigation.
- Aligned existing master user creation/password reset with temporary-password
  and session-revocation behavior. No database migration or live data change
  was run; the added User fields have defaults for existing records.
- Validation passed: `pnpm -r build`, `pnpm typecheck`, and
  `pnpm --filter @buramloop/server test` (2 suites, 5 tests). The suite is
  still the existing baseline and does not directly exercise these new auth
  endpoints. Whitespace scan found no trailing whitespace. Browser and
  MongoDB integration acceptance remain open.
- Compared the read-only pasted account workspace against the current
  API-backed implementation. Adopted its useful UI patterns: contextual
  account guidance, role/permission display, avatar preview, password
  confirmation, clear role badges, and an audited-reason confirmation dialog.
  Kept the API's 10-character password policy, real user-directory data,
  StorageProvider image upload, and explicit error behavior. Rejected its
  hardcoded users/password, arbitrary data-URL avatars, 8-character policy,
  and offline catch-and-report-success mutations.
- Validation passed: `pnpm --filter @buramloop/client typecheck` and
  `pnpm --filter @buramloop/client build`. No backend behavior or database
  state was changed in this comparison.
- Integrated the authenticated task-flow breadcrumb into the app shell and
  mounted an Admin-only Master Data destination. Reworked its previous static
  demo content into server-loaded materials/counters and audited API material
  creation; failures remain visible and do not produce fake success. The page
  notes that current inventory schema still assumes drum weight.
- Validation passed: client typecheck and production build. Camera scanning
  remains unmounted because the current lot-receive API does not accept or
  persist the scanner modal's package barcode values. Empty legacy page files
  and workflows that are not safely wired still need separate integration.
- Improved account/profile responsiveness: compact mobile shell/card spacing,
  touch-sized full-width actions, wrapping long content, and stacked Admin
  directory cards on phones while preserving the desktop table. Removed
  narrow-viewport global font-size shrinking that made text unreadable.
- Validation passed: `pnpm --filter @buramloop/client typecheck`,
  `pnpm --filter @buramloop/client build`, and `git diff --check`.
  Device/browser acceptance was not run; other workspaces still need review.
- Added the mobile header hamburger and slide-in primary navigation drawer.
  It dismisses on backdrop click, Escape, or selecting a module; the desktop
  sidebar remains unchanged. Client typecheck/build and `git diff --check`
  passed; no browser/device test was run.
- Fixed Admin user creation sending an empty role. Role is now required,
  starts at a disabled "Select a role" placeholder, and the create button/form
  guard prevent opening the audited dialog or submitting without a valid
  selection. Client typecheck/build and `git diff --check` passed.
- Began the agreed product/inventory integration (Phase 1). Admin material
  setup now validates independent kg/L/piece units, optional package-type and
  allergen metadata, and does not require drum weight for non-kg materials.
  Unit changes are blocked to preserve historical quantity meaning. Legacy
  kg/drum sourcing and receiving reject non-kg materials; batch feasibility
  only accepts active kg honey. Master Data now explains that non-kg
  sourcing/receipt is not enabled yet.
- Implemented against the active `client/src/pages/IncomingStockWorkspace.tsx`
  integration path; the tagged `client/client/src/pages` copy is a standalone
  duplicate and is not rendered by the app.
- Fixed the duplicate `UserSession` type declaration that blocked client
  verification, aligning permissions/avatar fields with current API sessions.
- Validation passed: `pnpm typecheck`, `pnpm -r build`, existing server tests
  (2 suites, 5 tests), and manual schema checks for kg/L/piece plus invalid
  piece-with-drum-weight. No database migration or live data mutation.
- Still pending: unit-aware sourcing/contracts/pricing, generic package
  receiving and append-only quantity ledger, generic QA/return handling,
  wiring the active receiving UI, and persistent barcode identity/scanning.

## 2026-10-29

- **Completed:** Added role/permission-aware shell navigation and breadcrumb
  selection, plus camera/manual barcode capture into the active receiving
  form. Preserved the responsive navigation drawer and authenticated profile
  behavior.
- **Issues/fixes:** Captured supplier-lot barcode is currently transient; the
  drum receipt API does not persist it. The scanner is gated to users with
  stock-write permission; server RBAC remains authoritative.
- **Validation:** `pnpm --filter @buramloop/client typecheck` and
  `pnpm --filter @buramloop/client build` passed.
- **Open/blockers:** Define barcode identity/uniqueness and extend the
  API-backed receiving workflow to persist and validate scanned values;
  browser/mobile acceptance remains outstanding.
- **Follow-up:** Restricted receive controls and scanner to Warehouse/Admin
  with stock-write access; confirmed QA-only access does not expose receiving.
  Warehouse seeded permissions include both stock read and write.
- Replaced experimental `BarcodeDetector` with dynamically loaded ZXing camera
  decoding; added a camera button beside the receive field and improved camera
  permission/unavailable messages. Camera and client type checks/build passed;
  physical camera/handheld scanning and API barcode persistence are unverified.
- Integrated reviewed label OCR into warehouse intake using Tesseract.js in
  the browser. The active form loads real suppliers/materials, persists
  optional barcode/OCR metadata through the kg/drum receipt API, maps its
  response without offline fake success, and uploads the captured label image
  after receipt with a retry action on upload failure ([BL-028](./ISSUES_AND_FIXES.md#resolved)).
- Validation passed: client typecheck/build, server typecheck/build, server
  tests (2 suites, 5 tests), and a label-parser smoke test. No live camera,
  browser, receipt API, or attachment-storage acceptance was run. Generic
  non-drum receiving and barcode uniqueness are still open.
- Diagnosed the reported `pnpm docker:build` failure: pnpm 12 blocked
  Tesseract's optional `opencollective-postinstall` under the workspace's
  strict build-script allowlist. Explicitly disabled that package build
  script in `pnpm-workspace.yaml`. `docker compose build client server`
  passed and created both images ([BL-029](./ISSUES_AND_FIXES.md#resolved)).

## 2026-10-30

- Made the Warehouse role's effective baseline permissions consistent across
  authentication, authenticated API requests, and seed behavior; QA approval
  remains a separate permission.
- Hardened authentication handling by rejecting malformed JWT subjects before
  database lookup and allowing unexpected database/programming failures to
  reach the normal error handler ([BL-030](./ISSUES_AND_FIXES.md#resolved)).
- Compared the Operations Dashboard with the supplied direction and retained
  authenticated, API-backed workflows rather than adopting demo users or
  fabricated success. Added role-specific summaries and permission-aware
  shortcuts; corrected lot, warm-room, batch, and sourcing reads; updated
  dashboard mutations to report API failures and change UI state only after
  success ([BL-031](./ISSUES_AND_FIXES.md#resolved)).
- Updated the master handoff, issue register, context history, project
  tracker, and roadmap to distinguish implemented changes from remaining
  unsynchronized metrics, standalone workspace fixtures, and workflow
  acceptance gaps.
- Validation passed: server typecheck and tests, including role-permission
  coverage; client typecheck and production build. No live API/browser
  workflow acceptance was run.

## 2026-11-02

- Implemented unit-aware incoming-lot receipt for configured kg/L/piece
  materials. Non-kg receipts create package records and append-only quantity
  ledger movements without drum fabrication; kg drum receipt remains
  compatible and batch eligibility remains active kg honey only.
- Updated QA rejection and supplier-return ledger deltas, lot/stock summaries,
  barcode resolution, exports, and the intake UI to preserve/display quantity
  and unit. Added compatibility handling for existing kg stock packages.
- Fixed Jest's shared-source ESM loading and expanded receipt/schema/model
  coverage ([BL-033](./ISSUES_AND_FIXES.md#resolved)).
- Validation at that checkpoint: `pnpm build`, `pnpm typecheck`, and
  `pnpm test` (4 suites, 14 tests). No live MongoDB receipt, browser, or
  device acceptance was run.
- Remaining: generic sourcing/contracts/pricing, multi-line lots, adjustments
  and partial use, barcode uniqueness, migration/backfill, and end-to-end
  workflow acceptance ([BL-024](./ISSUES_AND_FIXES.md#open--needs-follow-up)).

- Added [the Postman API testing guide](./POSTMAN_API_TESTING.md) with the
  actual mounted route inventory, cookie-based login steps, permission and
  audit-reason notes, and a redacted failure log template.
- Fixed the avatar route collision: `GET /auth/profile/avatar` downloads and
  `POST /auth/profile/avatar` uploads ([BL-034](./ISSUES_AND_FIXES.md#resolved)).
- Validation passed: server typecheck, server tests (4 suites, 14 tests), and
  `git diff --check`. No live Postman requests or avatar upload/download were
  run.
- Upgraded batch feasibility and reservation to blend selected available
  ReworkStock leftovers with eligible kg drums and kg IBC/DRUM/BUCKET_TRAY
  packages. Actual per-unit weights and source prices flow through the shared
  origin blender, which records normalized weight and cost percentages.
  Reservation consumes the selected rework quantity and reserves stock within
  the same transaction; batch and batch-input origin snapshots retain source
  package/rework provenance and cost fields ([BL-035](./ISSUES_AND_FIXES.md#resolved)).
- Added service tests for 71 variable-weight drums plus a package and a
  multi-origin rework slice, checking total kg, weight percentages, cost
  percentages, and country-policy rejection.
- Updated the Postman request notes for `includeReworkIds` and refreshed
  project status documentation.
- Started guided Postman progress with the user; they confirmed
  `GET /api/v1/health` passed. Authentication and the remaining routes have
  not yet been reported as tested.
- Validation passed: `pnpm typecheck`, `pnpm build`, and `pnpm test`
  (5 suites, 17 tests); `git diff --check` passed. Tests mock data queries;
  no live MongoDB transaction/reservation or Postman workflow was run.
- Improved process-generated rework provenance: process stages now derive
  leftover slices through the shared helper and retain source IDs, weight
  percentages, unit prices, cost values, and cost shares on the rework stock
  and serialized drum.
- Added invariant coverage for 72-package kg/ton distributions, supported
  package types, rework origin/cost preservation, multi-origin blending, and
  role-based price stripping. The test exposed rounding drift when the shared
  helper scaled from rounded percentages; it now derives leftover weights
  from exact parent slice kg ([BL-036](./ISSUES_AND_FIXES.md#resolved)).
- Validation passed: workspace `pnpm typecheck`, server tests (7 suites,
  23 tests), and `git diff --check`. No build or live database workflow was
  run for this change.
- Completed the ctx-v51 receipt calculator: kg materials now enter total
  weight in kg or tonnes, with a live total/average package-weight preview and
  100% initial origin attribution. IBC, DRUM and BUCKET_TRAY are supported;
  L/piece materials retain their per-package quantity entry.
- Made source price entry optional and Admin/Management-only in the UI, passed
  the role capability from the authenticated session, and rejected price
  assignment by other roles in `StockService`. Added a regression test for
  the API permission boundary.
- Connected the receiving preview to the shared distribution helper and
  refreshed the batch-planning, Postman and current-state documentation,
  including the available-rework route and total kg/ton receipt payload.
- Implemented ctx-v54/BL-040: supplier leads can be retained and updated,
  offers normalize kg/ton weights and EUR/kg, EUR/ton, or total-offer prices,
  and the sourcing API enforces the Management, sample, and in-house QSI gate
  metadata before contract creation.
- Replaced the fixture sourcing board with API-backed lead, offer, gate,
  contract, and shipping actions. Added R9 commercial masking and linked
  shipped contracts to incoming receipts, inheriting contract pricing and
  enforcing cumulative receipt kg/package balances. Receipt selection now
  prefills the remaining contract balance.
- Added offer-normalization tests for kg/ton inputs, the three price bases,
  transport costs, and invalid weights/package counts/prices.
- Fixed receipt-schema transformation that changed an omitted manual source
  price to zero, which had blocked Warehouse contract-linked receipt. Added a
  regression test verifying inherited contract price, stock-unit price, and
  cumulative contract balance update.
- Validation passed: `pnpm typecheck`, `pnpm build`, and `pnpm test`
  (13 suites, 46 tests). No live sourcing/receipt workflow, database,
  browser, or Postman acceptance was run. See
  [BL-040](./ISSUES_AND_FIXES.md#resolved); end-to-end acceptance remains open.
- Validation passed: `pnpm typecheck`, `pnpm build`, and `pnpm test`
  (9 suites, 32 tests). No live MongoDB receipt/reservation, browser, or
  Postman workflow acceptance was run.
- Expanded the Postman guide with a safe live-workflow sequence: local
  replica-set/API health, a small browser receipt, Postman persistence and
  unauthorized-price checks, QA approval, batch feasibility, and a clearly
  gated optional reservation. Includes expected exact 72-package kg
  distribution values and a sanitized per-step failure report. No live
  workflow was executed as part of documenting the procedure.
- Completed the ctx-v52 process, shipment, and cost-provenance slice
  ([BL-038](./ISSUES_AND_FIXES.md#resolved)). Process persistence now matches
  the ProcessStep/Batch models, `/step` is available with `/stage` retained
  as an alias, and the workspace reloads process data plus live tank/fill-line
  infrastructure. Shipment routes now validate the shared schema and use the
  model's `DRAFT`/`QA_HOLD`/`RELEASED`/`SHIPPED`/`VOID` state machine; the
  workspace loads server data, creates audited lots, and refreshes after
  audited transitions.
- Added shipment/process R9 masking and retained slice-level source price,
  cost, and cost-share fields in shipment persistence. Cost reports now build
  honey/rework breakdown lines from recorded origin-slice price/cost values,
  then fall back to incoming-lot or applicable source prices; report writes
  match the current CostReport model.
- Updated the Postman guide with process-step and shipment payloads,
  sequence/weight expectations, and the server's shipment status flow.
- Validation passed: `pnpm typecheck`, `pnpm build`, and `pnpm test`
  (11 suites, 37 tests). No live MongoDB transaction, browser, or Postman
  workflow was run.
- Completed the ctx-v53 traceability, costs, and audit/export slice
  ([BL-039](./ISSUES_AND_FIXES.md#resolved)). Trace responses now traverse
  source and downstream records while masking prices/costs for non-Admin/
  Management roles and redacting Inspector counterparties. Admin costs and
  trace/audit workspaces now use live APIs, display server data, and surface
  failures instead of substituting fixtures or offline success.
- Added a MongoMemoryReplSet integration workflow covering receipt, QA,
  batch reservation, process/rework, re-blending, shipment, cost generation,
  trace role masking, export logging, and append-only logs. Its failures
  exposed and fixed rework drum double allocation, schema persistence gaps,
  and cost/export model contract mismatches.
- Updated the Postman guide with ctx-v53 cost breakdown, trace price/Inspector
  redaction, and export-log checks. These remain documented steps, not tests
  reported as run against the live API.
- Validation passed: `pnpm typecheck`, `pnpm build`, and `pnpm test`
  (12 suites, 38 tests), including the focused replica-set integration test.
  This is in-memory replica-set verification; no live deployment database,
  browser, or Postman acceptance was run.

## 2026-11-03

- Added the BL-041 `MongoMemoryReplSet` integration test for supplier lead
  registration, tonnage/price normalization, Management/sample/QA gates,
  contract generation and shipment, two partial contract-linked receipts,
  inherited EUR/kg price, source-origin attribution, ledger entries, and
  remaining-balance enforcement.
- Added checks that separate package-count and kg over-receipts return HTTP
  409 with `CONTRACT_BALANCE_EXCEEDED` and do not persist extra lots or ledger
  entries. Contracting a `LEAD` supplier now promotes it to `ACTIVE_PARTNER`
  with an audit record; an `ON_HOLD` supplier is not automatically reactivated.
- Expanded the Postman guide with request URLs, role-specific Bearer
  authorization, `X-Audit-Reason`, required JSON `reason` values, payloads for
  each gate, shipment, partial receipts, and over-receipt checks. No live
  Postman requests were executed.
- Validation passed: `pnpm typecheck`, `pnpm build`, and `pnpm test`
  (14 suites, 47 tests). The workflow test uses an in-memory replica set;
  live database, browser, and Postman acceptance remain outstanding.
- See [BL-041](./ISSUES_AND_FIXES.md#resolved).

- Fixed BL-042 in the Sourcing Sample gate: `weightGrams` is now omitted from
  the request when blank and converted to a JSON number when entered. Added an
  optional sample-weight field and made the sample-to-contract progression
  visible beneath “Sourcing decisions and contracts.” Documented the numeric
  Postman payload requirement.
- Validation passed: `pnpm typecheck` and `pnpm build`.
 No live browser/API
  click-through was run. See [BL-042](./ISSUES_AND_FIXES.md#resolved).
- Fixed BL-043: incoming-lot QA pass/fail and mismatch return now call the
  audited stock endpoints and update the UI only after the API succeeds. QA
  decisions require a lab report number; mismatch returns require details.
  A passed lot stays in Warehouse as approved stock. The next step is a
  separate batch feasibility check, then audited stock reservation/batch
  creation.
- Extended the replica-set workflow to verify the lot persists as `PASSED`,
  all 72 stock drums remain `Approved` in `Warehouse`, and feasibility runs
  before batch reservation. Updated the Postman QA → Warehouse → batch steps.
- Validation passed: `pnpm typecheck`, `pnpm build`, and `pnpm test`
  (14 suites, 47 tests). No live browser/API click-through was performed.
- See [BL-043](./ISSUES_AND_FIXES.md#resolved).
- Connected Batch Planning's **Active Honey Material (kg)** selector and stock
  breakdown panel to live Warehouse stock via `GET /batches/stock-availability`
  (showing approved kg, customer-compatible kg, QA quarantine kg, and shipped
  incoming lots per material) and cleaned up stray warm-room fields from
  `BatchPlanningWorkspace.tsx`.
- Upgraded the Warm Cabinets terminal (`WarmCabinetsWorkspace.tsx`) and
  `WarmRoomService.checkInDrum` to support one-by-one drum barcode/label
  scanning, batch assignment, `6h..48h` and custom (`1–120h`) warming
  durations, real-time date/countdown and thermal telemetry (`20°C` → `45°C`
  sensor-ready simulation), target-reached alerts, check-out to Filtration or
  Warehouse, and persisted operator notes ([BL-044](./ISSUES_AND_FIXES.md#resolved)).
- Validation passed: `pnpm typecheck`, `pnpm build`, and focused
  `batch-service.test.ts` (3 tests).
- Fixed **Run Server Feasibility** (`BL-045`) in `BatchService.simulateFeasibility`,
  `listMaterialStockAvailability`, `approveAndReserveBatch`, and
  `BatchPlanningWorkspace.tsx`: added multi-pass stock allocation across
  `Approved`/`InWarehouse` units, `Quarantine` units, non-blocked origin
  countries, drumless incoming lots, and unreceived `SHIPPED`/`SIGNED`
  contracts; fixed `PriceModel` query (`isVoid: false`, `effectiveDate: -1`)
  and positive-price fallback; enabled partial-target fulfillment when
  `accumulatedKg > 0`; and auto-materialized pending shipped stock into
  Warehouse drums on batch reservation ([BL-045](./ISSUES_AND_FIXES.md#resolved)).
- Validation passed: `pnpm typecheck`, `pnpm build`, and
  `batch-service.test.ts` + `price-mask-controllers.test.ts` (2 suites, 7 tests).
- Fixed Warm Cabinet drum check-out validation error (`BL-046`:
  `WARM_OUT_TO_FILTRATION is not a valid enum value for path movementType`) by
  aligning `WarmRoomService.checkOutDrum` with `STOCK_MOVEMENT_TYPES`
  (`'WARM_OUT_FILTRATION'` / `'WARM_OUT_WAREHOUSE'`), preserving slot `batchId`
  on Filtration checkout, and appending optional operator `notes` to the
  movement ledger and audit record.
- Added a reusable Tailwind `FeedbackModal` (`SUCCESS` / `ERROR` / `WARNING`) in
  `IndustrialPrimitives.tsx` and wired modal confirmations into
  `WarmCabinetsWorkspace.tsx` (check-in, release to Filtration, return to
  Warehouse, and error alerts) and `BatchPlanningWorkspace.tsx` (batch
  reservation and error alerts) ([BL-046](./ISSUES_AND_FIXES.md#resolved)).
- Validation passed: `pnpm typecheck`, `pnpm build`, and
  `batch-service.test.ts` + `price-mask-controllers.test.ts` (2 suites, 8 tests).
- Fixed Processing & Filling `Commit FILLING Stage & Serialize Rework` validation
  error (`BL-047`: `StockMovement validation failed: country: Path 'country' is
  required., materialId: Path 'materialId' is required.`) by populating
  `materialId`, `country`, `fromStatus`, and `toStatus` on `CONSUME_BATCH` drum
  and package movements and `REWORK_CREATED` movements in
  `ProcessService.executeStage`, adding `'Warming'` to the consumed-unit status
  filter, and wiring `FeedbackModal` into `ProcessingWorkspace.tsx`
  ([BL-047](./ISSUES_AND_FIXES.md#resolved)).
- Validation passed: `pnpm typecheck`, `pnpm build`, and
  `batch-service.test.ts` + `price-mask-controllers.test.ts` (2 suites, 9 tests).
- Cleaned up unnecessary technical/specification text, roadmap phase badges
  (`STEP 5D..6I`, `R1..R14` codes, internal Nextcloud path labels, and verbose
  schema/collection explanations) across the client UI (`AppShell.tsx`,
  `IndustrialPrimitives.tsx`, `OperationsDashboard.tsx`,
  `WarmCabinetsWorkspace.tsx`, `BatchPlanningWorkspace.tsx`,
  `ProcessingWorkspace.tsx`, `ShipmentLotsWorkspace.tsx`,
  `WarehouseStockLedgerWorkspace.tsx`, `IncomingStockWorkspace.tsx`,
  `SourcingWorkspace.tsx`, `AdminCostsWorkspace.tsx`,
  `TraceabilityAuditWorkspace.tsx`, and `MasterDataWorkspace.tsx`), and
  preserved the special operational and architectural rule notes in
  [BURAMLOOP_CONTEXT.md](./BURAMLOOP_CONTEXT.md).
- Validation passed: `pnpm typecheck` and `pnpm build`.

## 2026-11-04

- **Completed:** Conducted a full read-only technical audit of the BURAMLOOP monorepo (`shared`, `server`, `client`, and infrastructure) and implemented the approved remediation plan (`BL-049`):
  - Added `'WARM_READY'`, `'DEVIATION_MISMATCH'`, and `'PROCESS_DEVIATION'` to `NOTIFICATION_TYPES` (`shared/src/schemas/outbound.ts`) so `NotificationModel.create` no longer aborts QA fail, mismatch return, early warm-out, or process-loss transactions.
  - Stopped `BatchService.approveAndReserveBatch` from mutating `Customer.allowedCountries` master data and updated `ShipmentService.createShipmentLot` to honor `batch.allowedCountries` for the batch's customer and enforce cumulative `orderedKg` limits across all non-void shipment lots of a batch.
  - Fixed `ProcessService.executeStage` so `batch.totalInputKg` records the initial stage input and `batch.totalFilledKg` records the latest stage output instead of summing across all 7 stages.
  - Mounted `GET /api/v1/stock/drums/:id/zpl-label` and `GET /api/v1/stock/barcode/:code` in `stock.routes.ts` / `stock.controller.ts`, added query-string sanitization against NoSQL operator injection, and applied `sanitizeCommercialDataForRole` on drum and package list endpoints.
  - Wired `CrossCuttingPanels.tsx` (`ExportMenu` & `AttachmentsPanel`), `SourcingWorkspace.tsx`, `IncomingStockWorkspace.tsx`, `MasterDataWorkspace.tsx`, and `App.tsx` to live backend contracts (including `/api/v1/attachments/health`, deterministic `entityId` fallback and `entityCode` filtering, valid `ATTACHMENT_DOC_TYPES`, real file streaming/upload/void error handling, and required `externalAnalysis` gate payload).
  - Added `validateBody` Zod schemas to mutating routes in `master.routes.ts`, `batch.routes.ts`, `warm-room.routes.ts`, `process.routes.ts`, `cost.routes.ts`, and `export.routes.ts`; bumped `User.tokenVersion` on role/active changes; added `StockMovement` update immutability hooks; deduplicated health routes and restricted `/api/v1/health/full` to `Admin`; masked 500 error messages in production; and deleted 18 zero-byte files plus the duplicate `client/client` directory.
  - Completed Phase 4 security, performance, and UI completeness (`BL-050`): added `loginRateLimiter` and `passwordChangeRateLimiter` in `auth.routes.ts`, removed unused `redis` dependency from `server` in `docker-compose.yml`, replaced `sessionStorage` JWT persistence with in-memory `apiClient.setBearerToken(...)` + `httpOnly` cookie, added `.limit(500)` bounds on `stock.service.ts` and `sourcing.service.ts` queries, batched `AttachmentService.verifyStorageIntegrity` in concurrent chunks of 8, configured `manualChunks` (`vendor`, `scanner`) in `client/vite.config.ts`, and expanded `MasterDataWorkspace.tsx` into a 5-tab CRUD UI (`Materials`, `Customers`, `Suppliers`, `Quality Grades`, and `Counters` override).
- Added role-targeted push notification alerts with Web Audio chimes, bottom 2-second auto-fading pop-up toasts with close button, hover-triggered and click-to-pin notification bell dropdown, PWA service worker with Web Push Notification support, and Tailwind entity detail modal dialogs for clickable records ([BL-052](./ISSUES_AND_FIXES.md#resolved)).
- Added role-targeted push notification alerts with Web Audio chimes, bottom 2-second auto-fading pop-up toasts with close button, hover-triggered notification bell dropdown, and Tailwind entity detail modal dialogs for clickable records ([BL-052](./ISSUES_AND_FIXES.md#resolved)).
- **Validation:** `tsc --noEmit` across `shared`, `server`, and `client` passed (0 errors); 11 server unit test suites (48 tests) passed. (The 3 `MongoMemoryReplSet` suites require non-sandboxed localhost TCP socket permissions in this environment.)
- **Open/blockers:** Live MongoDB/Nextcloud deployment and browser acceptance remain open.

## 2026-11-05

- **Completed:** Completed Admin user account governance and live dashboard synchronization (`BL-051`):
  - Added user account edit, role reassignment, activate/deactivate toggle, and temporary password reset in `UserAndProfileWorkspace.tsx` wired to audited `PUT /api/v1/master/users/:id`.
  - Updated `MasterService.upsertUser` to support role resolution by name or ObjectId, bump `tokenVersion` on credential/role/status change, and return updated role metadata.
  - Mounted `PATCH /api/v1/notifications/:id/read` in `notification.routes.ts`.
  - Synchronized live notifications and stock movements in `App.tsx` and `OperationsDashboard.tsx` with one-click acknowledgement.
  - Updated `ROADMAP.md` and `PROJECT_TRACKER.md` to reflect current verified capabilities.
- **Issues/fixes:** [BL-051](./ISSUES_AND_FIXES.md#resolved).
- **Validation:** `tsc --noEmit` on `shared`, `server`, and `client` passed (0 errors); client `vite build` passed; all 14 server Jest suites (52 tests, including `MongoMemoryReplSet` e2e workflows) passed.
- **Open/blockers:** Live deployment DB/browser acceptance testing remain open.

- Added header notification bell hover preview + click-to-pin open interaction with outside-click and Escape key dismissal, synthesized audio chimes, bottom 2s auto-fading toasts, and PWA native push notification infrastructure (`client/public/manifest.json`, `client/public/sw.js`) ([BL-052](./ISSUES_AND_FIXES.md#resolved)).
- Separated Government Inspection Trace from Internal Admin Audit in `TraceabilityAuditWorkspace.tsx` ([BL-053](./ISSUES_AND_FIXES.md#resolved)):
  - Added tab switcher between **Admin Audit & Data Exports** and **Government Inspection Trace**, defaulting by role.
  - Implemented multi-parameter audit query filtering on `GET /api/v1/audit` (`module`, `action`, `actorRole`, `entityType`, `startDate`-`endDate`, full-text `search`) with populated actor details.
  - Added client-side debounced audit filter bar, before/after JSON diff inspection modal, and direct CSV export download (`exportFilteredAuditToCsv`).
  - Preserved regulatory counterparty redaction and commercial price masking for the Government Trace view.
- **Issues/fixes:** [BL-052](./ISSUES_AND_FIXES.md#resolved), [BL-053](./ISSUES_AND_FIXES.md#resolved).
- **Validation:** `tsc --noEmit` on client and server passed (0 errors); client `vite build` passed in 7.29s; all 14 server Jest suites (52 tests, including `MongoMemoryReplSet` E2E workflows) passed.

- Recorded architectural specification for **R15 Dual Graph Inspection Trace** in `docs/BURAMLOOP_CONTEXT.md` and `docs/CONTEXT_HISTORY.md` (`ctx-v68`):
  - **Admin View:** Full end-to-end graph: `Product ↔ Batch ↔ Events ↔ Facilities ↔ Suppliers ↔ Customers` (full transparency, facility nodes, financial/price data, and audit records).
  - **Government View:** Masked regulatory graph: `Product ↔ Batch ↔ Events (Ins/Outs only)` (honey source country only, QSI lab results, in-house lab test results, zero price/cost data, official compliance contact details).

- Recorded architectural clarification decoupling **Audit, Nextcloud & Exports** from **Traceability** (**R16**, `ctx-v69`):
  - **Product Traceability:** Confined to the product lifecycle graph (Admin full graph vs. Government masked graph).
  - **System Audit & Exports:** Independent universal domain. Immutable audit log spans the entire ERP platform end-to-end across all operational modules with before/after state diffs and operator attribution.
  - Documented in `docs/BURAMLOOP_CONTEXT.md`, `docs/CONTEXT_HISTORY.md`, and `docs/DAILY_LOG.md`.

## 2026-11-06

- **Completed:** Integrated the German Regulatory & Industrial Standard Traceability Patch (`ctx-v70`, `BL-054`, `R11`, `R15`):
  - Created `shared/src/schemas/formatters-de.ts` enforcing German DIN 1333/5008 typographic standards and multi-language dictionary for 4 languages: **DE** (*Deutsch*), **TR** (*Türkçe*), **EN** (*English*), and **BN** (*বাংলা*).
  - Upgraded `TraceService` to join `LabReportModel` HonigV parameters (`moisturePct`, `hmfMgPerKg`, `diastaseDn`, `c4SugarPassed`, `nmrPassed`), mask commercial prices per R9, provide real database suggestions (`GET /api/v1/trace/suggestions`), and execute atomic IFS Food v8 Regulatory Holds (`POST /api/v1/trace/:code/regulatory-hold`).
  - Rebuilt `TraceabilityAuditWorkspace.tsx` with dual views: (1) 6-column step-by-step forensic chain explorer with interactive card click-filtering on movement history, and (2) Executive Origin Certificate preview with botanical origin donut/table, timeline stepper, and QSI lab report links. Added Staff vs Inspector view (Masked) toggle and IFS Hold trigger dialog.
  - Added test suite `server/src/__tests__/german-standard-trace-hold.test.ts` covering formatting and multi-language completeness.
- **Issues/fixes:** [BL-054](./ISSUES_AND_FIXES.md#resolved).
- **Validation:** `tsc --noEmit` on `shared`, `server`, and `client` passed (0 errors); client `vite build` passed in 11.97s; all 15 server Jest suites (57 tests, including `MongoMemoryReplSet` E2E workflows) passed.
- **Open/blockers:** Live container deployment and browser acceptance testing remain open.

- **Completed:** Decoupled and delivered the enterprise Admin Audit & Compliance Workspace (`ctx-v71`, `BL-055`, `R16`):
  - Decoupled module routing in `client/src/App.tsx`: `TRACEABILITY` routes exclusively to the product provenance explorer (`TraceabilityAuditWorkspace.tsx`), while `AUDIT_DOCS` routes to the universal cross-module governance center (`AdminAuditAndComplianceWorkspace.tsx`).
  - Built `client/src/pages/AdminAuditAndComplianceWorkspace.tsx` combining features from both attached user compliance and audit designs:
    - 4-tab navigation with live counts: `Audit trail`, `Stock ledger`, `Export history`, `Documents`.
    - Advanced filter panel: Search (Action/Reference/Doc), Actor (Name/Email), Module dropdown, Severity dropdown (`ALL`, `INFO`, `WARNING`, `CRITICAL`), `FROM` / `TO` date bounds, and Quick Date Presets (`Today`, `Last 24h`, `Last 7 Days`, `Last 30 Days`, `All Time`).
    - Interactive table cell click-to-filter on Actor name, Module, Entity reference, and Severity tag.
    - Selectable table view density (`25`, `50`, `100`, `250` rows per page) and previous/next page navigation.
    - Side-by-side Before/After mutation inspection modal with visual key-by-key difference tracking (`computeKeyDiffs`: Added, Removed, Modified keys with previous vs. committed values) and Raw JSON with one-click copy.
    - Direct filtered CSV export with standard column mappings.
    - Live Nextcloud WebDAV storage connection health indicator.
  - Upgraded backend query handling in `server/src/modules/audit/audit.routes.ts`: actor regex lookup via `UserModel`, date bounds, full-text `$or` search on reasons/references/actions/modules, and actor population.
- **Issues/fixes:** [BL-055](./ISSUES_AND_FIXES.md#resolved).
- **Validation:** `tsc --noEmit` on `client` and `server` passed (0 errors); client production build passed (`dist/index.html` + chunks); server unit tests passed (`german-standard-trace-hold.test.ts`); executed full `e2e-traceability-workflow.test.ts` (BL-039) against a live `MongoMemoryReplSet` verifying dynamic end-to-end receipt, QA review, batch planning, 7-stage processing, shipment, and snapshot-isolated trace lookups; updated `apiClient` response unwrapping across `AdminAuditAndComplianceWorkspace.tsx` and `TraceabilityAuditWorkspace.tsx` ensuring 100% dynamic data binding.
- **Open/blockers:** Live container deployment and browser acceptance testing remain open.

- **Completed:** Restructured Traceability Explorer header hierarchy (`ctx-v72`, `BL-056`):
  - Solved button overflow and right-edge truncation reported in user screenshots (`media_1793963666975_f5f1767a.png` & `media_1793963669503_898c2bcf.png`) by separating global page settings from contextual record actions.
  - Kept perspective toggle (`Staff view | Inspector view`) and 4-language switcher (`DE | EN | TR | BN`) in the top header.
  - Mounted a dedicated Active Trace Action Toolbar rendered when a trace record is loaded with active code badge, 6-Column Explorer / Origin Certificate switcher, and IFS Food v8 instant regulatory hold button.
- **Issues/fixes:** [BL-056](./ISSUES_AND_FIXES.md#resolved).
- **Validation:** `tsc -b && vite build` passed in 9.10s (0 errors); visual truncation and clipping eliminated.
- **Open/blockers:** Live container deployment and browser acceptance testing remain open.

- **Completed:** Implemented Dual Traceability Route Model & Station-by-Station Operational Deep Inspection (`ctx-v73`, `BL-057`):
  - Enforced strict domain boundary: decoupled financial KPI bars (costs, margins, valuation) from product traceability and documented their assignment to the upcoming dedicated "Costs, Margins & Reports" (`ADMIN_COSTS`) workspace.
  - Integrated a 5-step process sequence stepper directly above trace results: Step 1: Eingangschargen (Source Lots), Step 2: Gebinde / Fässer (Drums & Containers), Step 3: Produktionscharge (Blending Batch), Step 4: Prozesskette & Stationen (Route & Processing), Step 5: Vorschau & Zertifikat (Certificate & Shipment Preview) + All Steps (6-Column Explorer) panorama view.
  - Surfaced real physical facility route across 6 stations for Staff/Admin: Dock WE -> Warm Cabinets CAB-01/02 -> Filter Press FLT-01 -> Mixing Tank MIX-01 & Resting Tank TANK-01 -> Packaging Line QUIEL_PET/CARLO_JAR -> Outbound Shipping Dock.
  - Built interactive `OperationalRouteStepInspectorModal` providing Staff/Admin deep dive into machine telemetry, operator name, duration/dwell time, DIN 1333 mass balance (In, Out, Loss, Rework kg), and legal counterparties.
  - Preserved approved masked regulatory route for Government Inspectors (`SUPPLIER-PL`, `BUYER-DE`, QSI lab badges, zero internal machine codes, zero pricing, and GoBD stock movement ledger filtering).
  - Expanded `shared/src/schemas/formatters-de.ts` with 22 new bilingual keys across German (DE), English (EN), Turkish (TR), and Bengali (BN).
  - Conducted full responsive UI audit and hardened layout across mobile, tablet, laptop, and ultra-wide displays: added horizontal `overflow-x-auto` wrappers on Origin Certificate tables preventing mobile page blowout, enabled 6-column panoramic layout at `xl` breakpoint (`xl:grid-cols-6`), added active stage focus banner, and hardened buttons and chips with `min-w-0` and truncation.
- **Issues/fixes:** [BL-057](./ISSUES_AND_FIXES.md#resolved).
- **Validation:** Client production build passed: `tsc -b && vite build` (0 errors, 7.38s); server build passed: `tsc` (0 errors); all 15 server Jest test suites (57 tests) passed in 17.48s.
- **Open/blockers:** Live container deployment and browser acceptance testing remain open.

## Daily entry template

## YYYY-MM-DD

- **Completed:** concise work completed.
- **Issues/fixes:** link issue IDs from [the issue register](./ISSUES_AND_FIXES.md).
- **Validation:** commands/tests and their actual results.
- **Open/blockers:** remaining work, if any.