# BURAMLOOP MASTER CONTEXT (ctx-v57)

*Last documentation sync: 2026-11-03*

Use this document to continue implementation in the BuramLoop repository.
Treat checked-in code, tests, and current project docs as evidence. Historical
AI summaries and claims of completion are not acceptance evidence by
themselves. Work step by step, make surgical changes, preserve unrelated
worktree changes, run targeted checks, and update the docs when status changes.
Do not silently expand scope or redesign decisions already confirmed by the
project owner. Ask before irreversible database changes or ambiguous business
rules.

## 1. Project

BuramLoop is a pnpm monorepo for a honey company in Hennigsdorf. It uses
TypeScript/Express/Mongoose, React/Vite, shared TypeScript/Zod schemas,
MongoDB transactions, and a `StorageProvider` abstraction for Nextcloud and
local development storage.

Business coverage includes supplier sourcing, incoming goods, warehouse
inventory, warm-room operations, batch planning, processing, filling,
rework, QA release, shipment lots, cost reporting, traceability, exports,
notifications, and government inspection.

## 2. Confirmed requirements

1. Purchase flow: offer → external analysis approved by Management → sample
   → in-house sensory/QSI approved by QA → contract → shipped → receipt.
2. Admin-governed master data and sequence counters. Admin changes require an
   audit reason; important records are voided/deactivated rather than deleted.
3. Receive incoming goods with source, date, product/category, quantity, unit,
   packaging/handling, country and QA status; support pass/fail/review and
   supplier return for mismatch.
4. Maintain stock history and traceable balances. Existing drum ledger is
   append-only; do not break or fabricate drum records for non-drum goods.
5. Warm-room operations currently model two cabinets with 17 drum slots each.
6. Plan batches from compatible available inventory, enforce customer country
   restrictions, buffer/feasibility and approval, reserve inventory
   transactionally, and track rework.
7. Record processing/filling, material balance, operator, time, temperature,
   tanks, and fill lines; preserve the agreed batch/process identity.
8. Release and shipment lots obey customer/country rules.
9. Keep prices, costs and margins restricted to authorized roles.
10. Notify about low stock, feasibility, warm readiness, and deviations.
11. Support forward/backward traceability and inspector data masking.
12. Store attachments through the application using Nextcloud in production
   and local storage in development.
13. Generate exports from database-backed data, shared column definitions,
   permission-aware fields, and auditable export logs.
14. Enforce server-side RBAC, Zod validation, audited changes, transaction
   boundaries, reason requirements, and append-only logs.
15. Support warehouse barcode identification, mobile camera scanning where
   available, hardware/manual fallback, and Zebra ZPL labels where applicable.
16. Keep MongoDB as business data source of truth; coordinate backups of
   MongoDB, Nextcloud files, and Nextcloud database.
17. Admins can create/manage users and may create another Admin. Users can
   change their own passwords after creation. User identity includes name and
   role; profile picture support is required.
18. Users see only permitted modules/actions and an appropriate dashboard.
   The interface should be responsive, concise, and smooth, with contextual
   info controls and breadcrumbs showing business-flow position.
19. Incoming goods are not necessarily honey or drums. Admins need to define
   product categories/types before sourcing; sourcing, receipt, stock, and
   batch creation must preserve the correct quantity/unit. Do not assume
   everything is measured in drums or fixed 290 kg.

## 3. Current verified state

### Foundation and backend

- Shared, server, and client packages exist. Workspace typecheck/build and
  focused package checks have passed in the current work history.
- API auth includes login, `/auth/me`, logout, JWT/cookie authentication,
  permissions middleware, and audited service flows.
- API has feature router/service/model code for master data, sourcing, stock,
  warm-room, batch, process, shipment, costs, trace, export, attachments,
  notifications and audit. Their existence does not prove complete workflow
  correctness or adequate test coverage.
- Account support now includes self-service password change (current
  password, 10-character minimum), token-version session invalidation,
  first-use password change enforcement, profile name/avatar updates through
  `StorageProvider`, and an Admin-only user directory/create-user UI. The
  shared user schema enforces Inspector expiry; account creation records an
  audit reason and can assign the Admin role. These endpoints are not yet
  covered by direct integration tests or live browser acceptance.
- The account workspace includes contextual guidance, visible
  server-provided permissions, a local-only avatar preview before upload,
  password confirmation, role badges and an audited-reason confirmation
  dialog. It retains API-backed directory data and explicit request errors;
  no demo users, hardcoded passwords, data-URL persistence, or offline-success
  fallback was adopted from the compared mockup.
- Existing master user create/reset behavior now marks temporary passwords
  for forced change and increments the token version on reset. Admin update
  and deactivate UI remain outstanding.
- Nextcloud and local storage providers exist. The Nextcloud provider now
  validates MKCOL responses, normalizes root-prefixed paths, rejects traversal
  segments, preserves recursive folder creation and safe health output, and
  distinguishes missing objects from provider errors in stat calls.
- Barcode lookup and ZPL generation logic exists in a service, but is not
  mounted through stock API routes.
- The profile avatar endpoint uses `GET /auth/profile/avatar` for download
  and `POST` to the same path for multipart upload. The route collision is
  fixed; no live upload/download acceptance has been run. A
  [Postman route-testing guide](./POSTMAN_API_TESTING.md) documents the
  mounted endpoints, cookie login, role checks and safe test order.
- Integrity job, `/api/v1/health/full`, backup script and acceptance script
  exist; they still need workflow/operational verification.
- Latest server Jest coverage is 14 suites and 47 tests, including offer
  normalization, contract-price-inheritance coverage, and MongoMemoryReplSet
  workflows for sourcing-to-receipt and receipt-to-shipment/cost/trace with
  role masking, export logging, and append-only assertions. This is not live
  deployment database, browser, or Postman acceptance.
- ctx-v52 aligned process persistence with production models and exposes
  `/production/process/step` while retaining `/stage`; processing reads live
  process/infrastructure data, refreshes after mutations, and renders
  authorized origin cost shares. Shipment create/list/status now match the
  outbound schemas, enforce the model state machine and completed-batch
  customer-origin/package-weight constraints, and mask origin price fields
  for non-Admin/Management roles. Cost reports use slice-level honey/rework
  source prices and cost values, falling back only when slice pricing is
  absent. These are code-level integrations, not live DB/browser/Postman
  acceptance.
- ctx-v53 adds bidirectional trace lineage with price/cost masking and
  Inspector counterparty redaction; connects Admin costs and trace/audit pages
  to live API data and mutations; and covers receipt, QA, reservation,
  processing/rework, re-blending, shipment, costing, and trace/export in an
  in-memory replica-set workflow. That test exposed and fixed rework drum
  double-allocation/schema persistence and cost/export model-contract defects.
- ctx-v54 retains supplier source leads, normalizes kg/ton offers and
  EUR/kg/EUR/ton/total-offer pricing, enforces sequential sourcing gate data,
  carries normalized terms into contracts, and links shipped contracts to
  incoming receipt price inheritance and cumulative kg/package limits. The
  sourcing board is API-backed and commercial fields are role-masked. ctx-v55
  adds transaction-backed acceptance for the complete sourcing/receipt
  lifecycle; live database/browser/Postman acceptance remains outstanding.

### Client

- React/Vite client builds and typechecks.
- Landing/login gateway is bilingual and has role email presets, but no
  baked-in default passwords or offline login acceptance.
- App restores authenticated sessions with `/auth/me`, uses backend identity,
  role and permission claims, gates the ERP, and provides logout.
- Authentication rejects malformed JWT subjects before database lookup and
  lets unexpected database/programming errors reach the normal error handler
  rather than misreporting them as invalid credentials.
- The shell includes the account/profile workspace and Admin-only master-data
  destination. Master data now loads material/counter data from the API and
  creates materials through the audited API. Sidebar navigation and breadcrumb
  destinations now share a role/permission access policy; this client-side
  filtering supplements but does not replace server RBAC. Warm-room and batch destinations still share the
  batch-planning component; traceability and audit destinations also share a
  component.
- Dark and light themes are available from the landing/login header and
  authenticated shell. Dark mode (the original navy/amber palette) is the
  default; the selected theme is stored in browser local storage and restored
  on the next visit. Theme tokens adapt Tailwind colors, status colors,
  shadows, focus rings, and browser theme color. Typography uses professional
  Inter/system sans and IBM Plex Mono/Cascadia/standard system monospace
  fallback stacks without remote font dependencies.
- Warehouse users with `stock:read` and `stock:write` can access the intake
  module, receiving controls, and scanner; Admin retains the same capability.
  QA users without stock-write can access review/list controls but do not see
  receive controls. ZXing camera decode plus manual/keyboard-wedge entry is
  integrated with local Tesseract.js label OCR. Operators review/edit
  extracted values before applying them. The receipt form loads active
  supplier and material IDs, submits to the real API, persists reviewed
  values and barcode in optional `labelData`, and maps the returned lot into
  the client model. It supports configured kg/L/piece quantities and package
  types; non-kg receipts create package records and unit-aware ledger
  movements without drums or kg conversion. After receipt, the captured
  label image is uploaded as an `INCOMING_LOT` attachment; a failed photo
  upload is reported separately and can be retried. Barcode
  identity/uniqueness are undefined; the value is metadata, not a unique
  identifier.
- Warehouse workspaces are presented as one expandable Warehouse navigation
  group with separate Lot Intake & QA and Stock & Ledger destinations. The
  destinations retain their existing module keys and role/permission checks;
  this is a navigation grouping, not a permission expansion. The group
  auto-opens for either
  active workspace and remains usable in collapsed and mobile navigation.
  Lot Intake & QA contains the receiving and QA/mismatch actions. Stock &
  Ledger is a read-only lot-balance view with the ledger integrity check; it
  does not expose receipt or QA actions.
- The seeded Warehouse system role includes both `stock:read` and
  `stock:write`. If an existing deployment does not reflect those grants,
  server authentication now supplements the Warehouse role with its baseline
  stock, warm-room, attachment, and export permissions. The same effective
  permissions are returned on login and applied to every authenticated API
  request, so existing Warehouse users do not require a database migration.
  Stock read endpoints remain guarded by `stock:read`; receiving and
  mismatch-return endpoints require `stock:write`. QSI approve/reject remains
  a separate `qa:approve` permission, and Warehouse users do not see those QA
  actions unless that permission is explicitly granted.
- The Operations Dashboard now has role-specific summaries, permission-aware
  shortcuts, and a scanner shortcut for users authorized to receive lots.
  Incoming lots, warm-room occupancy, batches, and sourcing records are
  loaded from API-backed endpoints and mapped into dashboard data. Empty
  states are shown when these records are unavailable; hardcoded operational
  dashboard fixtures were removed. Stock movements and notifications are
  not yet loaded into the dashboard. Process counts use the API-backed
  process list. Shipment data is fetched when the shipment workspace opens;
  the dashboard count remains empty/local until that workspace has loaded it.
- Dashboard warm-room checkout and external-analysis approval call their
  mounted API routes and update local UI state only after successful
  responses. The shipment workspace also uses live audited shipment API
  mutations and explicit errors. The separate Sourcing workspace now loads
  leads, materials, and sourcing records from the API and performs audited
  offer, gate, contract, and shipping mutations with surfaced errors. Other
  operational screens still need review for fixture data and catch-and-continue
  mutation behavior.
- Account password/profile/avatar and Admin directory/create flows exist;
  Admin update/deactivation and direct endpoint tests are still missing.
  Breadcrumb coverage/authorization, consistent info/help across all modules,
  complete dashboard data synchronization, and end-to-end workflow acceptance
  remain outstanding.
- The account/profile workspace now adapts its spacing and controls for
  narrow screens, and its Admin directory uses stacked cards on phones and a
  table at desktop widths. The shared shell uses responsive content padding,
  and global media queries no longer shrink all text below readable sizes.
- The shared shell now has a mobile header hamburger that opens a slide-in
  navigation drawer with backdrop dismissal, Escape-key close, and
  auto-close on destination selection. Desktop sidebar behavior is retained.
  Other workspaces still need a systematic mobile/tablet review and acceptance
  run.
- Admin user creation requires a selected role before submitting/opening the
  audited confirmation. The role select now starts with an empty placeholder,
  and the create action is guarded so `roleName: ""` cannot be posted.
- Product setup Phase 1 is integrated: Admin material configuration supports
  kg/L/piece as distinct units, optional package type/allergen metadata, and
  no automatic conversion. Units cannot be changed after material creation.
  Sourcing remains kg-oriented. Receipt accepts the configured material unit.
  Batch eligibility is active HONEY measured in kg only; non-kg stock is not
  eligible for batch processing.

### Product, receiving and batch

- Material setup supports units `kg`, `l`, or `piece`; only kg materials have
  a default drum weight. Unit changes are immutable after material creation.
- Sourcing requires `materialId` and `offeredKg`, with optional
  `offeredDrums`; service derives drum counts from a drum-weight assumption.
- Incoming-lot receive accepts package count/type and material unit (`kg`,
  `l`, or `piece`). Kg drums keep their existing records; non-drum stock is
  represented by package records and signed quantity/unit ledger movements.
  Kg receipts now accept total mass in kg or tonnes and persist the exact
  per-package distribution with a nominal average `unitWeightKg`. The intake
  UI previews total kg, average kg/package and initial 100% origin
  attribution. Optional source-price entry is visible only to Admin and
  Management; the receiving service rejects price writes from other roles.
  QA rejection and supplier return reverse balances using the stock unit.
- The active UI's receipt operation uses actual master-data IDs and the real
  receive API; it no longer fabricates success when the API fails. Optional
  reviewed OCR/barcode metadata is saved with the lot, and its label image is
  attached after successful receipt. Stock views and exports carry quantity
  and unit alongside the legacy kg fields.
- For kg receipts, the intake UI accepts total weight in kg or tonnes and
  previews total kg, average kg/package, and the initial 100% source-country
  weight attribution. Admin/Management may optionally enter source price;
  the API denies price assignment from other roles.
- Batch feasibility accepts active HONEY materials measured in kg and uses
  actual stored weights from approved unreserved drums and kg
  IBC/DRUM/BUCKET_TRAY stock packages; it does not assume a fixed 290 kg
  package weight. Optional `includeReworkIds` selects available rework lots,
  which are allocated before warehouse stock. Selected rework must match the
  material and every origin country must satisfy the customer's allowed and
  blocked-country rules.
- Batch feasibility passes the exact scaled origin slices and source prices
  through `computeBlendedOriginComposition`. Batch and batch-input snapshots
  retain source lot/package/drum/rework links, actual kg, normalized weight
  `pct`, cost value, and cost `costSharePct`. Reservation consumes selected
  rework and reserves drums/packages within the transaction; optimistic
  conflicts abort the transaction. Existing non-kg stock remains excluded.
- Batch and process controller responses mask source price, cost, and cost
  share fields from roles other than Admin and Management. Batch planning now
  loads customers/materials/available rework and submits feasibility and
  reservation through the API rather than a local fixed-weight estimate.
- Process-generated rework derives its leftover composition with
  `deriveReworkOriginComposition()` and persists origin country, source links,
  kg, weight percentage, unit price, cost value, and cost share on ReworkStock
  and the serialized drum. The shared helper scales from exact parent slice
  kg to avoid per-origin mass drift from rounded percentages.
- Added mocked-query service coverage for 71 variable-weight drums, an
  eligible package, and multi-origin rework in one 730 kg allocation, including
  country-policy rejection and percentage/cost assertions. This does not yet
  validate live MongoDB transactions, concurrent reservations, or full
  processing-to-rework traceability.
- Added origin/rework invariant tests for 72-package ton/kg distributions,
  IBC/DRUM/BUCKET_TRAY origin attribution, leftover preservation, blending new
  origin with multi-origin rework, and role-based price masking.
- Kg-based supplier leads, normalized offers, sequential gates, contracts,
  and shipped-contract receipt linkage are implemented and covered by an
  in-memory replica-set end-to-end workflow test. Non-kg sourcing/pricing,
  multi-line lots, adjustments/partial use outside contract receipt balance
  tracking, and live API/browser/Postman acceptance remain open.
  Non-kg materials are not eligible for batch processing.
- Owner confirmed Admin-managed product setup before sourcing, distinct kg/L/
  piece quantities with no automatic conversion, and kg honey as initial
  batch-eligible inventory. Non-kg sourcing/pricing, package-level barcode
  identity, migration/backfill, and live receipt API/browser/Postman
  acceptance remain pending. The transaction-backed sourcing/receipt workflow
  is covered by the ctx-v55 replica-set test.

### Most recent validations

- As of ctx-v55 on 2026-11-03: `pnpm typecheck`, `pnpm build`, and
  `pnpm test` passed; server Jest reports 14 suites and 47 tests, including
  seven offer-normalization tests and MongoMemoryReplSet sourcing-to-receipt
  and receipt-to-trace/export workflows.
- ctx-v56 fixed Sample approval payload construction: blank optional
  `weightGrams` is omitted instead of sent as an empty string, and entered
  weights are sent as numbers. `pnpm typecheck` and `pnpm build` passed after
  the fix; live browser/API acceptance has not been run.
- ctx-v57 wires Incoming Lot QA Pass/Fail and mismatch return to audited API
  mutations. A passed lot is persisted as `PASSED`; packages remain
  `Approved` in `Warehouse`. The QA screen updates only after API success.
  Batch Planning remains a separate step: simulate feasibility, then confirm
  the audited reservation to create a batch from eligible stock.
- The ctx-v57 replica-set test verifies the persisted QA state/location and
  feasible allocation before reservation. `pnpm typecheck`, `pnpm build`,
  and `pnpm test` passed (14 suites, 47 tests); no live browser/API
  click-through was run.
- Replica-set transaction behavior was exercised against the in-memory test
  database. Live deployment MongoDB, browser, and Postman acceptance remains
  outstanding.
- `pnpm --filter @buramloop/client typecheck`
- `pnpm --filter @buramloop/client build`
- `pnpm --filter @buramloop/server typecheck`
- `pnpm --filter @buramloop/server build`
- `pnpm --filter @buramloop/server test` (2 suites, 5 tests)
- OCR parser smoke test covering supplier, origin, material, date, package
  count/type, quantity/unit, tare, and barcode.
- Live receipt, browser/camera, avatar upload/download, batch reservation, and
  attachment-storage acceptance has not been run; barcode duplicate detection
  remains open.
- Docker build failure `ERR_PNPM_IGNORED_BUILDS` was traced to Tesseract's
  optional `opencollective-postinstall`; `tesseract.js: false` is now explicit
  in workspace `allowBuilds`. `docker compose build client server` passed and
  created both images. This validates image build; Compose service startup is
  not part of this test.
- `pnpm typecheck`
- `pnpm -r build`
- `pnpm --filter @buramloop/server typecheck`
- `pnpm --filter @buramloop/server build`
- `pnpm --filter @buramloop/server test` (2 suites, 5 tests; existing tests do
  not yet exercise the new account endpoints)
- `pnpm --filter @buramloop/client typecheck`
- `pnpm --filter @buramloop/client build`
- `git diff --check`

Most recent account-feature validation in ctx-v33: `pnpm -r build`,
`pnpm typecheck`, `pnpm --filter @buramloop/server test` (2 suites, 5 tests),
and `git diff --check` passed. These checks do not prove full end-to-end
acceptance. The seed has not yet been successfully verified from Windows; see
BL-020 and the environment guide.

Most recent account UI comparison validation in ctx-v34:
`pnpm --filter @buramloop/client typecheck` and
`pnpm --filter @buramloop/client build` passed.

Most recent frontend integration validation in ctx-v35:
`pnpm --filter @buramloop/client typecheck` and
`pnpm --filter @buramloop/client build` passed.

Most recent responsive account UI validation in ctx-v36:
`pnpm --filter @buramloop/client typecheck`,
`pnpm --filter @buramloop/client build`, and `git diff --check` passed.

Most recent responsive navigation validation in ctx-v37:
`pnpm --filter @buramloop/client typecheck`,
`pnpm --filter @buramloop/client build`, and `git diff --check` passed.

Most recent account role-selection fix validation in ctx-v38:
`pnpm --filter @buramloop/client typecheck`,
`pnpm --filter @buramloop/client build`, and `git diff --check` passed.

Most recent product-unit foundation validation in ctx-v39:
`pnpm typecheck`, `pnpm -r build`, and server tests (2 suites, 5 tests)
passed. Direct Zod smoke checks accepted kg/L/piece and rejected a drum weight
on piece stock. `git diff --check` was run; this checkout reports all project
paths untracked, so Git's diff check does not inspect those files.

Most recent shell authorization and receiving scanner UI validation in ctx-v40:
`pnpm --filter @buramloop/client typecheck` and
`pnpm --filter @buramloop/client build` passed. No browser/device or live API
acceptance was run; lot barcode persistence remains unimplemented.

Most recent Warehouse receiving integration validation in ctx-v43:
client typecheck/build, server typecheck/build/tests, and an OCR parser
smoke test passed. The supported kg/drum receipt persists reviewed OCR and
barcode metadata and uploads the label image after receipt. No live
browser/device, receipt API, or attachment-storage acceptance was run.

### Decision log (ctx-v43)

- Finished the Warehouse scanner-to-intake path: ZXing decodes barcodes;
  Tesseract.js extracts printed label text in the browser; operators review
  and edit extracted fields before applying. The active intake page loads
  supplier/material master IDs and sends the receipt to the real API rather
  than reporting fake offline success. Optional label data including barcode
  and OCR text is persisted on IncomingLot. The captured image is attached
  after API receipt; upload failure is explicit and retryable. Receipt still
  supports only kg/drum stock. Generic non-drum receipt, duplicate barcode
  validation/identity, and live device/API acceptance remain open.
- Account policy: new accounts created through the Admin APIs receive a
  temporary password and must change it before using protected application
  routes. Passwords must be at least 10 characters; changing a password
  increments the user's token version, invalidating existing sessions.
- Profile images are uploaded through the authenticated API and existing
  `StorageProvider`; accepted image types are JPEG, PNG, and WebP, max 5 MiB.
  The User document stores an attachment reference, not an arbitrary URL.
  Generic attachment downloads restrict profile images to their owner or
  Admin; the account's own avatar is served through an authenticated route.
- Admin directory/create UI and backend routes are implemented. Explicit
  integration tests, update/deactivation UI, browser acceptance, and server
  endpoint validation remain open. See BL-027.
- Compared the provided account-workspace mockup and selectively adopted its
  info button, permission display, avatar preview, password confirmation,
  role badges, and reason-confirmation dialog. Kept real backend data,
  server-compatible 10-character policy, provider-backed image storage and
  visible failures. Rejected mock user rows, hardcoded temporary credentials,
  arbitrary `data:`/avatar URLs, and catch-and-pretend-success behavior.
- Mounted the Admin-only Master Data page with live materials/counters and
  audited material creation, and integrated the task-flow breadcrumb into the
  authenticated shell.
- Added a shared client navigation-access policy used by sidebar navigation,
  breadcrumb destinations, and dashboard navigation callbacks. Added a
  Warehouse/Admin intake access rule backed by `stock:read`; receive controls
  and the camera/manual scanner require `stock:write`. QA review access does
  not expose receiving controls. Replaced browser-specific barcode detection
  with ZXing browser scanning, added a camera button alongside the intake
  barcode field, and retained direct manual/keyboard-wedge entry. Captures
  populate the form's supplier-lot barcode field, but remain transient and
  are not persisted by the current receive API. Server RBAC remains
  authoritative.
- Improved account/profile responsiveness: mobile-first shell spacing,
  smaller adaptive card padding, touch-sized full-width small-screen actions,
  and a phone card layout for the Admin directory while retaining the
  desktop table. Removed global narrow-screen font-size reductions that made
  text too small. Other workspaces and device-size acceptance remain open.
- Added a mobile-only hamburger control in the shared shell header. It opens
  the navigation sidebar as a slide-in drawer, supports backdrop/Escape close,
  closes after module selection, and leaves the desktop sidebar behavior
  intact. Client typecheck/build and diff whitespace check passed; no
  real-device/browser acceptance was performed.
- Fixed Admin account creation submitting an empty role: require explicit
  selection using an empty placeholder, disable create while no role is
  selected, and guard form submission before opening the audited reason
  dialog. This keeps role values aligned with the shared enum.
- Owner confirmed separate kg/L/piece inventory units without conversion,
  Admin-managed material/category setup before sourcing, and honey-only
  batching. Integrated Phase 1 by validating unit/package/allergen material
  setup, making units immutable, rejecting non-kg in legacy kg/drum sourcing
  and receiving, and guarding batch feasibility to active kg honey. Kg-based
  supplier lead retention, normalized offer/contract pricing, the sourcing
  gate workflow, shipped-contract receipt linkage, package/lot ledger and
  receiving UI are now integrated. Non-kg sourcing/pricing, multi-line lots,
  adjustments and persisted barcode identity remain open.
- Removed a duplicate `UserSession` interface declaration and aligned its
  permission/avatar fields with current API session data so workspace
  typecheck/build could complete.

## 4. Priority step register

### P0 — Product/category/unit/inventory model (in progress)

- Phase 1 material unit configuration is complete; owner confirmed units,
  no-conversion policy, Admin setup, and kg-honey batch eligibility.
- Package-aware kg/L/piece receipt, per-unit package records and append-only
  quantity ledger movements are implemented; end-to-end non-drum receipt,
  adjustment and partial-use acceptance is still required.
- Kg receipt now accepts total weight in kg or tonnes and computes exact
  per-package weights plus a nominal average. The UI shows the total,
  average, and initial origin allocation; source price is optional and limited
  to Admin/Management by both UI and API.
- Batch feasibility/reservation now blends selected available rework with
  actual-weight kg drums and eligible kg packages, retaining normalized
  source-weight and cost shares. Unit-level service tests pass; live
  transaction, partial-consumption, concurrency, and traceability acceptance
  remains required.
- Kg-based sourcing now retains supplier leads, normalizes kg/ton offers and
  price basis to EUR/kg, captures sequential Management/sample/QA decisions,
  issues contracts from passed offers, and links shipped contracts to incoming
  receipts with inherited price and cumulative kg/package limits. The complete
  transaction-backed sourcing/receipt path is tested; non-kg sourcing/pricing,
  adjustments outside contract balances, and live API/browser/Postman
  acceptance remain open.
- Design source-of-truth product and inventory schemas across sourcing,
  contracts, lots, packages, ledger, batches, processing and traceability.
- Preserve existing drum records and ledger invariants with an explicit
  migration/backfill plan.
- Add API/schema/model tests for drum honey and at least one non-drum product.

### P1 — Accounts and authorization (in progress)

- Core account routes and frontend payloads are now validated by shared
  schemas for password/profile/create input.
- Admin user directory and audited create form are implemented, including
  creating a second Admin. Add explicit API authorization tests.
- Self-service password change, 10-character policy, temporary-password
  setup gate, token-version invalidation, and StorageProvider image upload are
  implemented; add route-level integration tests and browser acceptance.
- Add Admin update/deactivation controls and ensure resets use the same policy.
- Role/permission filtering now covers sidebar, breadcrumb and dashboard
  navigation. Add permission-aware action visibility and tests; client
  filtering is not an authorization boundary.
- Extend role-appropriate dashboards and work queues from the current
  role-personalized summary/shortcut implementation; wire remaining metrics
  to server data and add role-specific acceptance tests.

### P2 — Warehouse/mobile receiving

- The active intake now loads suppliers/materials and accepts configured
  material quantity/unit and package data through the real API. Kg receipts
  accept exact total kg/ton inputs and preview the package distribution.
  Shipped kg-based contracts now prefill remaining kg/package balances,
  inherit contract source price, and are validated against cumulative
  contract limits. Extend to non-kg sourcing and multi-line product support.
- Camera capture and keyboard/manual fallback populate the receiving form;
  reviewed barcode/OCR values are persisted as optional label metadata through
  the package-aware receipt API. Duplicate barcode validation remains open.
- Define barcode identity rules and safe ZPL field constraints.

### P3 — Workflow UI quality

- [x] Mount the Admin master-data and user-management workspaces; Admin
  update/deactivation remains open.
- [x] Replace the fixture sourcing board with API-backed supplier lead,
  normalized offer, gate, contract and shipping actions; errors are visible
  and mutations require audit reasons.
- Ensure all destinations render distinct intended modules and do not claim
  unimplemented content is live.
- Add business-process breadcrumbs and concise contextual info/help.
- Review remaining success-shaped catches and fake offline mutations; the
  Operations Dashboard's audited mutations now update only after server
  success and present errors.
- Replace/label remaining demo fixtures, then implement loading, empty,
  validation, error, and success states.
- Test accessibility and responsiveness at phone, tablet and desktop sizes.

### P4 — API integration and operational acceptance

- Test all critical state transitions, permissions, reasons, rollback,
  concurrency, audit, trace, export and notification behavior. Offer
  normalization is covered for kg/ton and all three price bases. A ctx-v55
  MongoMemoryReplSet test covers sourcing gates, contract transition, shipment,
  linked partial receipts and overage rejection; the ctx-v53 test covers an
  inventory-to-trace/export workflow. Broader live database and
  browser/Postman acceptance remains.
- Verify API startup, replica-set transactions, storage health/compensation,
  full health endpoint, and integrity schedules.
- Verify repeatable seed against a disposable database using a host-appropriate
  Mongo URI.
- Run clean install/build/test in CI; execute backup and restore drills.

## 5. Non-negotiable engineering rules

- MongoDB is source of truth; client role labels are not authorization.
- Validate all external input at the API boundary. Do not weaken existing
  reason minimums or permission checks for UI convenience.
- Keep audit/stock/export ledgers append-only; use transactions for related
  state changes; void/deactivate instead of hard delete.
- Preserve existing data; schema changes require a migration and verification.
- Do not silently swallow errors or report fake success. Surface actionable
  failures to operators.
- Do not expose secrets, default credentials, password hashes, or unnecessary
  sensitive detail in logs or documentation.
- Do not run seeding or migrations on a live database without explicit
  confirmation and a verified backup.
- Update `ROADMAP.md`, `ISSUES_AND_FIXES.md`, `DAILY_LOG.md`,
  `PROJECT_TRACKER.md`, and this prompt when status changes. Record only
  verified completion.

## 6. Decisions and remaining questions

Confirmed product/inventory baseline:

1. Admins configure materials/categories before sourcing; category labels
    remain extensible.
2. Stock units are `kg`, `l`, and `piece`, tracked separately with no
    automatic conversion.
3. Initial batch eligibility is honey measured in kg only. Current allocation
    supports actual-weight drums, kg IBC/DRUM/BUCKET_TRAY packages, and
    explicitly selected available rework with compliant origins. Do not treat
    other units or package types as kg/batchable.

Still to decide/design:

1. Should barcodes identify a product lot, individual package, drum, or more
    than one of these?
2. What pricing approach applies to L/piece materials? Existing sourcing and
    cost reports are kg-priced and currently reject non-kg sourcing.
3. Which non-honey products may eventually be additives versus independently
    received goods, and which QA checks apply to each class?
4. Admin password-reset authorization/UX and whether a second factor or
   additional password-complexity rules are required? Current policy is
   minimum 10 characters, mandatory first-use change, and token-version
   invalidation.
7. Which dashboard metrics/actions should each role see?
8. Should the default profile-image visibility (owner and Admin) be broadened
   to all authenticated users, or should the user directory expose avatars
   only to Admin?
9. Which workflow labels, help content, and target mobile/tablet sizes are
   required for warehouse acceptance?

## 7. Tracking references

- [Roadmap](./ROADMAP.md)
- [Issue register](./ISSUES_AND_FIXES.md)
- [Daily log](./DAILY_LOG.md)
- [Project tracker](./PROJECT_TRACKER.md)
- [Environment and command guide](./ENVIRONMENT_SETUP.md)
- [Context history](./CONTEXT_HISTORY.md)

## 8. ctx-v57 decision log and next handoff

- Supplier leads persist independently of offers; kg/ton offer weight and
  EUR/kg, EUR/ton, total-offer, and transport pricing are normalized to
  per-package kg and landed EUR/kg.
- Sequential `PRICE_OFFER`, Management external analysis, sample routing, and
  in-house QSI gates lead to contracts only after the sourcing status is
  `PASSED`. Admin/Management retain commercial fields; other roles receive
  masked offer, analysis, contract and lead-price data.
- Shipped contracts can be selected during receiving. The server inherits
  contract price, validates supplier/material/origin/package matching, and
  caps cumulative received kg and packages; the UI prefills the remaining
  balance.
- Sourcing board and supplier lead directory are API-backed with audited
  mutations and explicit failures. Seven normalization test cases cover the
  deterministic shared helper.
- Contract issuance promotes a supplier from `LEAD` to `ACTIVE_PARTNER` with
  an audit record, while `ON_HOLD` suppliers are not automatically reactivated.
- The `MongoMemoryReplSet` workflow verifies the complete offer → gates →
  contract → shipment → two partial receipts path, contract price inheritance,
  ledger/origin entries, and rejection of package-count and kg overages with
  `CONTRACT_BALANCE_EXCEEDED`.
- The Postman guide now documents the lead → offer → four gate states →
  contract → shipment → partial receipt flow with role-specific authorization,
  `X-Audit-Reason`, and required body `reason`. No live Postman requests were
  executed.
- The Sample form exposes optional weight in grams. Approval omits the field
  when blank and sends a JSON number when entered, matching the API schema.
  The section also shows the sequence from offer through shipment.
- Incoming-lot QA decisions and mismatch returns now use audited stock API
  routes; client state changes only after success. QA pass releases units from
  quarantine into `Approved` stock at `Warehouse`, but does not create a
  production batch.
- To continue with released stock, run feasibility in Batch Planning for an
  active kg HONEY material and intended customer/quantity. If feasible,
  confirm the audited reservation to create the batch. Do not expect
  non-honey materials such as pollen to qualify for the current batch flow.
- `pnpm typecheck`, `pnpm build`, and `pnpm test` passed (14 suites, 47 tests).
  ctx-v57 also verifies persisted QA release to Warehouse, followed by
  feasibility and batch reservation, in the in-memory replica set. This does
  not imply live database, browser, or Postman acceptance.
- Next: restart the local app, use a disposable active kg HONEY test lot,
  enter its lab report number, QA-pass it, verify `APPROVED`/available
  Warehouse stock, then run Batch Planning feasibility and create the batch
  only if the result is feasible. Record only steps actually run.
