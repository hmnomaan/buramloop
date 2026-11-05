=== BURAMLOOP MASTER CONTEXT (ctx-v19) ===
INSTRUCTIONS TO ANY AI ENGINE: Continue from NEXT STEP in the STEP REGISTER. Be clear and concise, step by step, bulletproof. Do not redesign decided items; propose changes only via CHANGE REQUEST rule. Apply CROSS-CUTTING REQUIREMENTS at the step listed. End every output with this full prompt updated (bump ctx, append DECISION LOG, update step status).

1. PROJECT
BuramLoop: traceability for a honey company, Hennigsdorf (Buram): purchase, incoming lots, warehouse, warm cabinets, batching, filtration, blending, filling, rework, release, shipment LOT. Govt-inspection traceability required.

2. REQUIREMENTS
R1 gated purchase (offer > external analysis checked by Management > sample > in-house + QSI > contract > shipped > lot)
R2 admin master data (materials, quality grades, roles, lot/batch numbers), reason on every change
R3 incoming lot receive (date, type, drums+kg, country, source, admin quality) + listing with usage + passed/failed/under review; return to supplier on mismatch
R4 drum stock + append-only ledger (1 drum = 290 kg)
R5 warm cabinets (2 x 17 drums), check IN/OUT, to filtration or warehouse
R6 batch from listed stock: feasibility, buffer (6 t -> 9-9.5 t), flavours, admin approval, 24-48 h, leftover -> rework
R7 processing: filtration, blending, resting tank, filling (Quiel PET/Carlo Jar/Hand), batch no = process no, temp + person in charge
R8 release + shipment LOT per customer country rules (1-3 countries)
R9 admin-only prices, cost, margin, cost report to management
R10 notifications (low stock, feasibility, ready 24-48 h, deviations)
R11 traceability forward/backward for govt inspection
R12 attachments (QSI certificate etc.)
R13 export Print/Excel/Word/PDF consistent with DB
R14 RBAC, roles, audit log, append-only logs
R15 future barcode scanning (optional field)
R16 organisation-level file/document management in Nextcloud, integrated with MERN

3. STEP REGISTER (status)
4 SCHEMAS (TypeScript, Mongoose + Zod, shared/)
 4a-4e DONE All Mongoose + Zod schemas, barrels, index sync, and seed script complete [R1-R16]
5 API (each: routes, controller, service, RBAC, transaction, audit, tests)
 5a DONE foundation: bootstrap, env, errors, auth (login/JWT/cookie/me), RBAC middleware, transactional audit helper, reason enforcement [R2,R14]
 5b DONE master data endpoints (roles, users, materials, qualityGrades, suppliers, customers, cabinets, tanks, fillLines, stockThresholds, counters override with mandatory reason & audit) [R2,R5,R7,R8,R10,R14]
 5c DONE sourcing pipeline (offer > external analysis checked by Management [`management:approve`] > sample > in-house sensory + QSI [`qa:approve`] > contract > shipped + admin-only prices) [R1,R9,R14]
 5d DONE incoming lot receive/review/return, drums (1 drum = 290 kg), append-only stockMovements ledger, listing/stock summary, ledger integrity check [R3,R4,R10,R14]
 5e-0 DONE Nextcloud/Local storage connectivity + health endpoint (/api/v1/health/storage) & folder bootstrap [R12,R16]
 5e DONE attachments via StorageProvider (two-phase upload with SHA-256 & DB failure compensation, RBAC authed download stream, void with reason, storage-vs-DB integrity check) [R12,R14,R16]
 5f NEXT warm cabinets (2 x 17 slots occupancy), batch feasibility simulator (Approved unreserved drums + 34-drum cabinet capacity + customer 1-3 country rules + rework stocks), batch create/approve/reserve, notifications [R5,R6,R10,R14]
 5g processing (warm IN/OUT, filtration, blending, tank, filling), rework
 5h release + shipment LOT + customer country rules
 5i pricing/margin/costReports (admin; reports saved to admin-only Nextcloud folder)
 5j trace (forward/backward) + inspector view
 5k export service (xlsx/pdf/docx, snapshot read, exportLogs, optional save to Nextcloud /Exports)
6 UI (React + Vite)
 6a shell, auth, layout, shared DataTable + ExportMenu + AttachmentsPanel + ReasonDialog
 6b master data | 6c sourcing board | 6d incoming/listing/stock | 6e warm cabinets + batch wizard | 6f processing + filling log | 6g shipment + customers | 6h cost & margin (admin) | 6i trace, audit, notifications, dashboard
7 QUALITY + RELEASE: Nextcloud install/hardening (HTTPS, app password, Team folder ACL, versions, retention, antivirus), unit tests (state machines, sign rules), integration (transactions, storage), e2e, seed, deploy, backups (MongoDB + Nextcloud data + Nextcloud DB together), acceptance with ground staff
FUTURE: barcode scan module (R15)

4. DECISION LOG (full detail in docs/CONTEXT_HISTORY.md)
v1 Core flow, 3 terms, lab gate, ledger, void not delete, admin-only prices.
v2 Batch feasibility + notify; warm room IN/OUT; scan validation; lot state machine; bulletproof rules.
v3 Drum = unit of stock; modules, roles, relations; collections + UI map.
v4 No barcode now; Sourcing module; 290 kg drum; 34 drums per warm cycle; plannedKg vs approvedKg; flavours are raw materials; rework; 24-48 h; resting tank -> filling lines; temp + person; reason on admin changes; admin pricing.
v5 Purchase gates (offer > external analysis > sample > in-house + QSI > contract).
v6 TypeScript; permissions "module:action"; Material.kind drives logic.
v7 Admin creates material name first; sourcing stages/gates; prices admin-only; counters; 1 contract per sourcing (to confirm).
v8 Attachments + export (print + xlsx/pdf/docx, one column definition, adminOnly stripped, exportLogs, snapshot read).
v9 Full step register + requirement trace; Step 4b-2: lot statuses, drum STATUS split from LOCATION, ledger sign rules, labReports, export columns. Assumptions: whole drums into batches, leftover -> reworkStocks; flavours received as lots/containers.
v10 Nextcloud adopted for org-level files with MERN (R16). Mongo = source of truth for business data and permissions; Nextcloud = files only; API is the only access path. StorageProvider adapter: NextcloudProvider and LocalProvider. Paths: BuramLoop/<Area>/<Number>/<DocType>/<uuid>-<safe-name>.
v11 Ground update: "Aus Exier" removed from schema and open questions. Purchase step 2 = external analysis checked BY MANAGEMENT. Gate permission map added (EXTERNAL_ANALYSIS requires `management:approve`); new permission module `management`; role Manager renamed Management.
v12 Step 4c delivered: cabinets (2 x 17 slots), tanks (resting), fillLines (QUIEL_PET, CARLO_JAR, HAND), batches, batchInputs, processSteps (inKg = outKg + lossKg + reworkOutKg), reworkStocks (origin[] 100%). Wired Step 4c attachments and export columns.
v13 Step 4d delivered: customers (1-3 allowedCountries), shipmentLots, shipmentLotItems, costReports (admin-only), stockThresholds, notifications + Step 4d attachments and export columns.
v14 Step 4e delivered: consolidated shared/src/index.ts and server/src/models/index.ts barrels, index synchronization helper, idempotent seed script, Docker Compose, and server Dockerfile.
v15 Step 5a delivered: API foundation in server/src (Zod env config, MongoDB replica-set connection + withTransaction & withSnapshotRead helpers, AppError + errorHandler, argon2 + JWT httpOnly cookie auth, requirePermission RBAC middleware, transactional recordAudit helper, and requireReason middleware).
v16 Step 5b delivered: Master Data API module (/api/v1/master) covering roles, users, materials, qualityGrades, suppliers, customers (1-3 allowedCountries validated), cabinets/tanks/fillLines, stockThresholds, and sequence counter overrides.
v17 Step 5c delivered: Sourcing Pipeline API module (/api/v1/sourcings) enforcing sequential 4-gate approval (OFFER -> EXTERNAL_ANALYSIS by Management -> SAMPLE -> INHOUSE_QSI by QA), reject-closes-with-reason, contract generation from PASSED sourcing, mark shipped, and separate admin-only prices endpoints.
v18 Fixed TypeScript ES2022 lib target & populated missing shared schema barrels; patched 7 schema/model loopholes. Delivered Step 5d (/api/v1/stock): IncomingLot receipt with automatic 290kg drum creation + RECEIVE_QUARANTINE ledger entries, QA pass/fail review in 1 transaction, mismatch return-to-supplier, lot listing with drum usage, live stock summary, low-stock threshold alerts, and snapshot ledger integrity check.
v19 Delivered Step 5e-0 & Step 5e: StorageProvider adapter (Nextcloud WebDAV + Local filesystem) with automatic folder bootstrap, /api/v1/health/storage check, /api/v1/attachments two-phase upload (SHA-256 + automatic storage delete compensation on DB transaction failure), RBAC-enforced download streaming (blocking adminOnly files from non-Admin/Management), void with mandatory reason, and storage-vs-DB integrity check.

5. RULES
- Gates Approve/Reject with reason (audited). EXTERNAL_ANALYSIS gate checked by Management (`management:approve`). Mismatch = BLOCKED, return to supplier (also after receipt). Only PASSED sourcing -> contract -> incoming lot. MATCH PASS needs inhouse PASS + qsi PASS (+ QSI_CERTIFICATE attachment, proposed).
- Lot PASSED -> drums APPROVED; FAILED -> drums REJECTED (one transaction, with ledger rows).
- Batch feasibility = APPROVED unreserved drums + cabinet capacity (34 drums) + customer country rule; notify; admin approves; reserve drums; leftover -> reworkStocks with origin[].
- Process log each step: tempC, person in charge, time, in/out/loss/reworkOut kg (in = out + loss + reworkOut), tank, fill line. Batch no = process no.
- Pricing admin-only in prices/costReports; batch cost = sum(kg x source price) + flavours; margin = sell - cost.
- Bulletproof: append-only stockMovements/auditLogs/exportLogs; transactions; Zod server validation; server RBAC; void not delete; reason on every admin create/update/void; ledger integrity check; storage integrity check.
- Roles (proposed): Admin, Management, QA, Warehouse, Production, Inspector(read-only); admin creates roles/permissions.

6. CROSS-CUTTING
FILES: any entity can have attachments stored via StorageProvider (Nextcloud in production). Wire per step: lots/drums in schema (DONE); processSteps/batches/reworkStocks 4c (DONE); shipmentLots/costReports 4d (DONE); endpoints 5e (DONE); panel 6a.
EXPORT: every list/detail page: Print, Excel, Word, PDF from the same service/query and shared column definitions; RBAC + price stripping; exportLogs; snapshot read. Columns defined as each model is built (4a-4d DONE); service 5k; menu 6a.
CONSISTENCY: Mongo = source of truth; back up Mongo + Nextcloud data + Nextcloud DB together.

7. DATA MODEL
users, roles, materials, qualityGrades, suppliers, sourcings, contracts, prices(admin), counters, attachments, exportLogs, incomingLots, drums, stockMovements, labReports, cabinets, tanks, fillLines, batches(plannedKg, approvedKg, flavours[], cabinetAssignments[], readyAt, processNo), batchInputs, processSteps, reworkStocks, customers, shipmentLots, shipmentLotItems, costReports(admin), stockThresholds, notifications, auditLogs.

8. DEV ENVIRONMENT
TypeScript strict. MERN monorepo buramloop/: server/ (Express, Mongoose), client/ (React + Vite), shared/ (Zod). File storage: Nextcloud (STORAGE_PROVIDER=nextcloud; NC_URL, NC_USER, NC_APP_PASSWORD, NC_ROOT) or local in dev (UPLOAD_DIR). Files: shared/src/index.ts, shared/src/schemas/{common,access,master,purchase,attachment,export,stock,production,outbound,columns}.ts; server/src/models/{index,access,master,auditLog,counter,purchase,attachment,exportLog,stock,production,outbound}.model.ts; server/src/config/{env,db}.ts; server/src/common/{errors,audit.helper,validate.middleware}.ts; server/src/middlewares/{auth,rbac,reason,error}.middleware.ts; server/src/modules/{auth,master,sourcing,stock,attachment}/*.ts; server/src/{app,server}.ts; server/src/seeds/seed.ts; server/src/storage/{storage.types,nextcloud.provider,local.provider,index}.ts; docker-compose.yml; server/Dockerfile; .env.example; docs/{BURAMLOOP_CONTEXT,CONTEXT_HISTORY}.md. API prefix /api/v1. Mongo single-node replica set locally or Atlas eu-central-1. Git: commit/tag per step, tag = ctx version.

9. UI MAP
Login, Dashboard, Sourcing board, Incoming Lot receive, Listing, Warm Cabinets, Batch wizard, Resting tank + Filling log, ShipmentLots, Customers/Suppliers, Notifications, Master Data, Cost & Margin (admin), Trace, Audit. Every page: Attachments panel + Export menu.

10. OPEN QUESTIONS
One contract per sourcing?; MATCH PASS needs QSI certificate?; whole drums only into batches?; Nextcloud already running or install needed; retention period required for inspection; do inspectors get read-only Nextcloud access; currency EUR (assumed); QSI params list; roles confirm (Management vs Manager).

11. CHANGE REQUEST RULE
User sends ground updates; engine applies, lists schema/UI changes, appends DECISION LOG, bumps ctx, updates step status.

12. NEXT STEP
Step 5f: Warm cabinets status & slot availability, batch feasibility simulator (Approved unreserved drums + 34-drum cabinet capacity + customer 1-3 country rules + rework stocks), batch creation (plannedKg vs approvedKg buffer, flavours[]), Admin/Management batch approval & drum/rework reservation in 1 transaction, and notifications [R5,R6,R10,R14].
=== END ===

## BURAMLOOP MASTER CONTEXT (ctx-v32) — 2026-10-29

This verified repository audit supersedes the older `NEXT STEP` and completion
claims above where they conflict with current code. See the complete
[ctx-v32 master handoff prompt](./BURAMLOOP_MASTER_PROMPT.md).

### Confirmed work

- Monorepo foundation, API feature modules, storage providers, barcode service,
  integrity job, full-health endpoint, backup/acceptance scripts, and React
  shell exist. Typecheck/build checks have passed in the current work history.
- Client login/session restoration and logout were recently implemented using
  server `/auth/login`, `/auth/me`, and `/auth/logout`; the client no longer
  accepts the former baked-in offline credentials.
- Nextcloud provider path/MKCOL/stat handling was hardened and has three
  focused tests. Current server test suite is two suites/five tests, not a
  comprehensive business-flow suite.

### Audit corrections to prior completion claims

- Do not mark all API workflows or UI modules done based on file existence.
  Complete transaction, permission, error, integration and user acceptance
  evidence is missing for most domain flows.
- Barcode resolution/ZPL code exists but is not mounted in the stock router;
  the barcode modal only accepts typed/hardware-wedge text and is not
  connected to receiving or mobile camera capture.
- There are 11 sidebar destinations; master-data UI is not mounted, and warm
  cabinet and batch destinations currently share a component.
- Incoming-lot receiving is drum-only; sourcing and batch logic assume kg,
  drums, 290 kg nominal drum mass and a 34-drum capacity. General non-drum
  inventory is not implemented.
- Admin user endpoints/password hashing exist, but self-service password
  change, user-management UI, profile pictures and tested secondary Admin
  creation are missing or unverified.
- Permission-aware UI navigation, workflow breadcrumbs, consistent info/help
  controls, personalized dashboards, no-fake-success mutation behavior, and
  responsive acceptance remain incomplete.

### Updated priority

P0 is to confirm and design product/category/package/unit/conversion and batch
eligibility semantics before migrations. P1 is full user/account/profile and
permission-driven access. P2 is real warehouse receiving with mobile camera
scan and fallback. P3 is coherent role-based responsive workflows. P4-P5
cover API integration, release and operations. Requirements and questions
are recorded in `BURAMLOOP_MASTER_PROMPT.md` and `ROADMAP.md`; issues BL-024
through BL-026 track the newly verified gaps.

## ctx-v33 — Account and profile implementation (2026-10-29)

- Added User schema fields for forced temporary-password change, profile
  attachment, creator, and token version.
- Added authenticated password-change and profile-update routes. Password
  changes verify the existing hash, require 10+ characters, audit within the
  transaction, and invalidate older sessions by incrementing `tokenVersion`.
- Added first-use password-change gating in authentication middleware, while
  allowing `/auth/me`, logout, and password-change endpoints.
- Added JPEG/PNG/WebP profile-image upload through the StorageProvider, with
  5 MiB maximum, signature checks, user-bound attachment records, and audit
  entries. Profile images are downloadable by their owner and Admin only; no
  arbitrary external avatar URLs are accepted.
- Added Admin-only user listing and audited user creation, including
  secondary Admin creation and required Inspector expiry. Added a responsive
  client account/profile workspace; Admins see the directory/create form.
- Aligned existing master user creation/password reset with forced
  first-change and token-version invalidation.
- Validation: workspace build, workspace typecheck, existing server tests
  (2 suites/5 tests), and trailing-whitespace scan pass. The current tests do not
  directly cover these endpoints; live MongoDB/browser acceptance, Admin
  update/deactivation UI, and broader permission navigation remain open.
- Decision: account password minimum is 10 characters; temporary passwords
  force a change, and password changes invalidate existing token versions.

## ctx-v34 — Account workspace comparison (2026-10-29)

- Compared the user-provided account page snapshot with the API-backed
  `UserAndProfileWorkspace`.
- Adopted relevant presentation improvements: contextual info popover,
  visible server permissions and role badge, local avatar preview before
  upload, password confirmation, and a reason-confirmation dialog for account
  creation.
- Kept existing backend alignment: live Admin user directory, shared role
  names, 10-character password policy, StorageProvider uploads, and explicit
  request errors. Did not copy static demo users, default passwords,
  arbitrary avatar/data URLs, or offline-success catches.
- Validation passed: client typecheck and production build. No API or
  database behavior changed in this UI comparison.

## ctx-v35 — Mount live Admin master data and flow breadcrumb (2026-10-29)

- Added the Admin-only Master Data destination to navigation and connected
  `MasterDataWorkspace` to live material and sequence-counter endpoints.
  Material creation now uses the audited API; hardcoded list/counter examples
  and offline-success fallback were removed. The page explicitly notes that
  current inventory schema still assumes drum weight.
- Mounted `ProcessFlowBreadcrumb` in the authenticated shell and added the
  Master Data step. Profile page omits this production-flow breadcrumb.
- Did not mount camera scanning into lot receipt: the current receive endpoint
  does not accept or persist the modal's scanned package-barcode field.
- Validation: client typecheck and production build passed. No database or
  server behavior changed.
- Remaining: distinct warm-room/batch and trace/audit destinations,
  permission-aware navigation/breadcrumb filtering, camera/barcode API
  integration, and empty legacy page modules.

## ctx-v36 — Improve responsive account workspace (2026-10-29)

- Adjusted shell content padding and account/profile page spacing for narrow
  screens; made primary account actions full-width and touch-friendly on
  phones.
- Replaced the Admin directory's phone-width horizontal table with stacked
  user cards, retaining the table for desktop. Added wrapping/breaking for
  narrow profile and permission content.
- Removed global media queries that progressively shrank body text down to
  8px/6px on small viewports; responsive layout should adapt without making
  text unreadable.
- Validation: client typecheck, production build, and `git diff --check`
  passed. Browser/device-size acceptance was not run. Remaining work includes
  responsive review of the other workspaces and full mobile/tablet testing.

## ctx-v37 — Add mobile navigation drawer (2026-10-29)

- Added a mobile-only hamburger button to the shared app header and a
  slide-in navigation drawer with a dimmed backdrop. Escape, backdrop click,
  and selecting a module close the drawer; desktop sidebar behavior remains.
- Validation: client typecheck, production build, and `git diff --check`
  passed. Browser/device-size acceptance was not run.

## ctx-v39 — Integrate product-unit setup Phase 1 (2026-10-29)

- Owner confirmed inventory units `kg`, `l`, and `piece` remain separate with
  no automatic conversion; Admins maintain material/category setup before
  sourcing; initial batch eligibility is honey only.
- Extended the shared material schema and Mongoose model with unit-aware
  validation, optional package type and allergen metadata. Non-kg materials no
  longer require or receive a default drum weight; a material's unit cannot
  be changed after creation.
- Updated Admin Master Data UI to configure these fields and clearly state
  that non-kg sourcing/receiving is not enabled yet.
- Added server guards so existing kg/drum sourcing and receiving reject
  non-kg materials; batch feasibility rejects inactive/non-honey/non-kg
  material rather than consuming incompatible stock.
- Removed a duplicate `UserSession` declaration and corrected the session
  permission/avatar fields to restore full client typecheck/build.
- Validation: workspace typecheck/build and existing server tests
  (2 suites, 5 tests) passed. Direct Zod smoke checks passed for all three
  units and rejected drum-weight configuration on piece stock.
- Remaining phases: unit-aware sourcing/contracts/pricing; generic package
  receipt and append-only unit ledger; QA/return lifecycle for generic
  packages; API-backed receiving UI; then package barcode persistence and
  camera integration. No database migration or live data mutation was run.

## ctx-v40 — Filter shell navigation and wire receiving barcode capture (2026-10-29)

- Added one client-side role/permission policy for sidebar items, breadcrumb
  destinations and dashboard navigation callbacks; the server remains the
  authorization boundary.
- Added a stock-write-gated camera scanner trigger. Camera and manual/wedge
  input fill the supplier-lot barcode field in the active receiving form.
- The barcode currently remains only in client form state. The existing
  receipt API does not accept or persist lot-level barcode values, and
  barcode identity/uniqueness remain open. Removed fabricated sample barcode
  shortcuts from the scanner.
- Preserved the responsive drawer, authenticated avatar source, breadcrumb
  placement and logout flow; the logout control now reads LOCK / EXIT.
- Validation: client typecheck and production build passed. No browser,
  mobile-device, backend-persistence or API acceptance was run.

## ctx-v41 — Ensure Warehouse intake and scanner access (2026-10-29)

- Confirmed the seeded Warehouse role has `stock:read` and `stock:write`.
- Tightened incoming-workspace navigation to require `stock:read`; removed
  QA approval as a substitute for stock access.
- Added one intake capability check: Warehouse and Admin users with stock
  read/write can see the receiving form and scanner. QA users can view/review
  stock but do not see receive controls.
- Clarified the navigation and breadcrumb labels as Warehouse Lot Intake.
- Manual/camera scan still fills only a local supplier-lot code field; current
  API persistence and the existing fake/offline receipt behavior remain open.
- Validation: client typecheck and production build passed; no browser/device
  or live API acceptance was run.

## ctx-v42 — Fix Warehouse camera barcode decoding UI (2026-10-29)

- Replaced the experimental browser `BarcodeDetector` dependency with the
  `@zxing/browser` multi-format reader, loaded dynamically when camera
  scanning starts to avoid increasing the initial application bundle.
- Added a direct camera action beside the receiving barcode field. Manual
  entry and handheld keyboard-wedge scans can also populate the field.
- Camera startup errors now distinguish unsupported/insecure browser,
  permission-denied and missing-camera cases and direct the operator to the
  manual fallback.
- Confirmed the barcode field remains local only; receive API persistence is
  still unimplemented.
- Validation: client typecheck and production build passed. No live camera or
  physical handheld device test was possible in the current environment.

## ctx-v43 — Integrate reviewed label OCR with real Warehouse receipt (2026-10-29)

- Added browser-side label OCR with Tesseract.js, editable extracted fields,
  raw-text review, captured-image preview, and operator confirmation before
  applying scanner results.
- Connected the reviewed result to the active receiving workspace. The form
  now loads active suppliers/materials and submits their IDs to the existing
  kg/drum receipt API, including optional label metadata and barcode. Removed
  the receipt's fake/offline success path and map the returned database lot
  into the UI.
- After successful receipt, upload the label image as an `INCOMING_LOT`
  attachment; surface upload failure and retain a retry action. Label OCR
  image processing occurs in the browser; no image is sent to an OCR service.
- Persisted a parser smoke check for supplier, origin, material, date, package
  count/type, quantity/unit, tare, and barcode.
- Validation: client typecheck/build, server typecheck/build, server tests
  (2 suites, 5 tests), and parser smoke test passed. No live camera, browser,
  receipt API, or attachment-storage acceptance was run.
- Remaining: generic non-drum/non-kg receiving and ledger, duplicate barcode
  detection/identity rules, and device/API acceptance. See BL-024 and BL-028.

## ctx-v44 — Allow Docker installs with Tesseract postinstall blocked (2026-10-29)

- Diagnosed `pnpm docker:build` failing during both client and server
  dependency installation with `ERR_PNPM_IGNORED_BUILDS` after adding
  Tesseract.js. Its only install hook is an optional OpenCollective notice,
  not a required runtime asset build.
- Added `tesseract.js: false` to the pnpm 12 workspace `allowBuilds` policy,
  explicitly documenting that this package's build script must remain
  disabled. The Tesseract runtime JS/WASM is used directly for browser OCR.
- Verified with `docker compose build client server`; both images built and
  were created. This does not verify Compose service startup. See BL-029.

## ctx-v38 — Require role in Admin account creation (2026-10-29)

- Fixed account provisioning sending `roleName: ""` when an Admin had not
  selected a role. The form now shows a disabled empty placeholder, makes the
  role select required, disables account creation until selected, and guards
  submission before opening the audited-reason dialog.
- Validation: client typecheck, production build, and `git diff --check`
  passed.

## ctx-v45 — Warehouse authorization and role-aware dashboard (2026-10-30)

- Added effective Warehouse baseline permissions across login and authenticated
  API requests while keeping QA approval separately controlled. Hardened JWT
  subject validation and stopped masking unexpected auth/database errors.
- Reworked the Operations Dashboard comparison into a role-aware, API-backed
  slice: mapped live lot, warm-room, batch, and sourcing reads; removed
  hardcoded dashboard operational fixtures; and updated warm-room, sourcing
  gate, and shipment actions only after API success. Other workspaces and
  unsynchronized dashboard metrics remain follow-up work.
- Validation: server typecheck/tests and client typecheck/production build
  passed. No live workflow or browser acceptance was run. See BL-030 and
  BL-031.

## ctx-v46 — Reconcile current project documentation (2026-10-30)

- Updated the master handoff, roadmap, tracker, issue register, and daily log
  to reflect the current Warehouse authorization policy and role-aware,
  partially API-backed dashboard without overstating workflow completion.
- Corrected stale statements about unsaved barcode/OCR values, unmounted
  workspaces, and missing dashboards. Remaining unsynchronized metrics,
  standalone workspace fixtures, generic receiving, and end-to-end acceptance
  remain explicit follow-up work.
- Documentation-only update; verified revised sections and searched for the
  superseded dashboard/receiving claims. No build or test run was needed.


## ctx-v47 — Duplicate `sourceReworkId` property fix (2026-10-30)

- Resolved a TypeScript compile error caused by a duplicated `sourceReworkId` field in the `originComposition` sub‑document of the `Drum` schema (`server/src/models/stock.model.ts`).
- Removed the extra definition, retained the indexed version with a comment explaining its purpose for provenance of rework‑originated drums.

## ctx-v48 — Unit-aware receiving and quantity ledger (2026-11-02)

- Added package-aware receipt for configured kg/L/piece materials. Non-kg
  goods create package records and signed quantity/unit ledger entries rather
  than drums or converted kg; kg/drum intake remains compatible.
- Added unit-aware QA rejection/return deltas, stock/lot quantities, barcode
  resolution and export fields. Batch allocation remains restricted to
  positive-kg inventory and honey measured in kg.
- Expanded receipt schema/model tests and configured Jest to transform shared
  ESM TypeScript for the CommonJS server test runtime.
- Validation: `pnpm build`, `pnpm typecheck`, and `pnpm test` passed (4 suites,
  14 tests). No live MongoDB, browser, or device acceptance was performed.
- Remaining: generic sourcing/contracts/pricing, multi-line lots,
  adjustment/partial-use flows, barcode identity/uniqueness, migration and
  end-to-end acceptance. See BL-024 and BL-033.
- Updated the issue register (`docs/ISSUES_AND_FIXES.md`) with entry **BL‑032** documenting the bug, fix, and verification.
- Verified with `pnpm --filter @buramloop/server typecheck` – the project now passes type‑checking without duplicate‑property errors.
- No runtime behavior changed; provenance tracking continues via the retained `sourceReworkId` field.

## ctx-v49 — Batch blending with selected rework and kg packages (2026-11-02)

- Updated `BatchService.simulateFeasibility` to optionally accept
  `includeReworkIds`. Selected rework must be AVAILABLE, non-void, unreserved,
  have remaining kg, match the active kg HONEY material, and have every origin
  country allowed and not blocked for the selected customer. Rework is
  allocated first, then eligible approved warehouse stock.
- Batch stock allocation uses recorded package/drum kg and supports kg drums
  and IBC/DRUM/BUCKET_TRAY stock packages; it does not calculate stock from a
  fixed 290 kg assumption. Non-kg stock remains ineligible.
- Exact scaled origin slices and source prices are passed to
  `computeBlendedOriginComposition`, which calculates the batch-wide kg
  weights, `pct`, cost values, and `costSharePct`. Source lot, package/drum,
  and rework references are retained on the batch and batch-input snapshots.
- Reservation rechecks and consumes the selected rework quantity, reserves
  eligible drums/packages, and records batch inputs and ledger entries inside
  the transaction. Concurrent state changes cause a conflict rather than
  partial completion.
- Added service tests for 71 variable-weight drums plus a package and
  multi-origin rework in a 730 kg allocation, and for rejection of rework with
  a disallowed origin. The tests mock database queries and do not establish
  live MongoDB transaction acceptance.
- Validation passed: workspace `pnpm typecheck`, `pnpm build`, and `pnpm test`
  (5 suites, 17 tests); `git diff --check` passed.
- Also corrected the avatar route method collision (`GET` downloads,
  `POST` uploads) and added the [Postman API testing guide](./POSTMAN_API_TESTING.md).
- Remaining: live transaction/reservation and workflow acceptance, generic
  sourcing/contracts/pricing, adjustments/partial use, barcode uniqueness,
  migration/backfill, and end-to-end traceability.

## ctx-v50 — Process rework origin preservation and invariants (2026-11-02)

- Process-stage rework generation now uses
  `deriveReworkOriginComposition()` so ReworkStock and its serialized drum
  retain each slice's country, source IDs, exact kg, weight percentage, unit
  price, cost value, and cost share.
- Added `origin-price-rework-blend.test.ts` coverage for 72-package ton/kg
  distribution, exact sum/no drift, IBC/DRUM/BUCKET_TRAY origin attribution,
  leftover preservation, multi-origin rework blended with a new origin, and
  role-based price masking.
- The new invariants found that scaling from rounded percentages could shift
  leftover mass between origins. Updated the shared helper to scale by the
  exact parent slice kg, retaining percentage fallback for zero-total inputs.
- Validation passed: workspace `pnpm typecheck`, server tests (7 suites,
  23 tests), and `git diff --check`. No build or live database workflow was
  run for this change.
- See [BL-036](./ISSUES_AND_FIXES.md#resolved). Live process transaction and
  end-to-end traceability acceptance remain outstanding.

---

*Latest verified context entry: ctx-v50, 2026-11-02. Older entries below or
above are historical snapshots; see the current [master handoff](./BURAMLOOP_MASTER_PROMPT.md)
and [roadmap](./ROADMAP.md) for active status.*


### Special notes for consistency and update with the entire system ###
keep it as note:

>>> i need to mention here that, the  there will three types of packages to receive, IBC,DRUM,Bucket/Tray, the unit can be in Tons/Kgs, if its 72drum the total kg can be any digits...we must get unit weight , which is per packgae how much kg we are getting...and the price , source country , will be added in parcentage of weight and price, 100parcent of origin country will be added with price , weight and in filling or rework(leftover) for next filling, the rework will peserve the weight percantage, price value and origin country, ,if we blend it with new origin it should have the track of different price and source and weight in percentage level as well.>>>
---

## ctx-v51 — Exact-weight receiving UI and API-backed batch planning (2026-11-02)

- Kg receiving now accepts total input weight in kg or tonnes and computes a
  nominal average plus an exact per-package distribution for DRUM, IBC and
  BUCKET_TRAY. Initial package origin attribution is 100% of the received
  country; the source-price input is optional and available to Admin and
  Management only.
- The receive service rejects price assignment by roles without price access.
  The intake form preserves per-package quantity entry for L/piece materials
  and surfaces request failures through the existing error UI.
- Batch planning now uses the server for feasibility and reservation, loads
  active customers/materials/available rework, lets users select rework, and
  displays returned origin weight and cost shares. Batch/process controller
  responses remove price fields for non-Admin/Management roles.
- Updated the Postman receipt example for a total kg/ton payload and documented
  `GET /batches/rework-available`.
- Validation passed: `pnpm typecheck`, `pnpm build`, and `pnpm test`
  (9 suites, 32 tests). No live MongoDB receipt/reservation, browser, or
  Postman workflow acceptance was run.
- See [BL-037](./ISSUES_AND_FIXES.md#resolved). Live transaction, browser,
  Postman, and end-to-end traceability acceptance remain outstanding.

---

*Latest verified context entry: ctx-v57, 2026-11-03. Older entries below or
above are historical snapshots; see the current [master handoff](./BURAMLOOP_MASTER_PROMPT.md)
and [roadmap](./ROADMAP.md) for active status.*

=== BURAMLOOP HISTORICAL HANDOFF (ctx-v52) — 2026-11-02 ===

- Batch planning accepts active kg HONEY only and allocates actual kg from
  drums and supported kg packages; explicitly selected eligible ReworkStock
  is blended first.
- Batch origin slices preserve source and price provenance, with normalized
  weight and cost percentages. Rework consumption and stock reservations are
  implemented in one transaction, but have not yet been accepted against live
  MongoDB.
- Process-generated rework preserves derived origin/source/price slices;
  shared derivation uses exact parent slice weights to avoid rounding drift.
- Process steps now persist fields matching ProcessStep/Batch models. The
  process API returns stored stage history and rework, and accepts both
  `/production/process/step` and its retained `/stage` alias. The workspace
  reads process records and live infrastructure and refreshes after writes.
- Shipment create/list/status routes use the outbound schemas and shipment
  status machine; the workspace loads completed batches/customers, creates
  audited lots, and refreshes after status changes. Shipment and process
  responses remove source prices/cost shares for other roles.
- Cost report breakdown lines preserve multi-origin and rework slice price
  provenance and fall back to incoming-lot/current source prices only when
  slice pricing is absent. Cost report fields now match the Mongoose model.
- Workspace typecheck/build and server tests passed; the suite has 11 suites
  and 37 tests, including source-price provenance and shipment price masking.
- The receiving UI accepts a total kg/ton input, previews the exact package
  distribution and initial origin weight share, and gates optional source
  prices to Admin/Management. Non-authorized price writes are rejected by the
  API.
- `GET /auth/profile/avatar` downloads; `POST` uploads. The Postman guide
  documents the actual route inventory and step-by-step validation.
- Do not infer completion of end-to-end, browser, production, or live database
  workflows from these code-level checks.

---

## ctx-v52 — Process, shipment, and cost provenance (2026-11-02)

- Reconciled the process service with its production models: it stores valid
  `ProcessStep` field names, uses valid Batch status transitions, persists the
  current stage/output, tracks assigned tanks/fill lines, and adds a compatible
  `/step` endpoint while retaining `/stage`.
- Made processing read its process records and master infrastructure from the
  API, refresh after writes, surface read/write errors, use the next
  sequential stage and display source/cost shares only for Admin/Management.
- Reconciled shipment create/list/status persistence with `ShipmentLot` and
  `ShipmentLotItem` schemas, validated shared request schemas, enforced
  completed-batch/customer-origin/package-weight checks, and recorded shipped
  packaged kg when transitioning to SHIPPED.
- Added API-backed shipment listing/creation and audited DRAFT/QA_HOLD/
  RELEASED/SHIPPED/VOID transitions. Shipment lot and populated batch origin
  slices are price-masked for non-Admin/Management roles.
- Cost reports now calculate honey/rework breakdown lines from each origin
  slice's source lot, country, kg, recorded unit price and cost value; missing
  slice prices fall back to the source incoming lot or applicable PriceModel.
  Persisted report fields match the existing CostReport schema.
- Validation passed: `pnpm typecheck`, `pnpm build`, and `pnpm test`
  (11 suites, 37 tests). Live MongoDB, browser, and Postman acceptance remains
  outstanding.
- See [BL-038](./ISSUES_AND_FIXES.md#resolved).

---

=== BURAMLOOP CURRENT HANDOFF (ctx-v53) — 2026-11-02 ===

- Trace lookup now returns upstream lots/packages, production batches/inputs/
  steps/rework, downstream shipment lots/customers, and ledger movements.
  Admin/Management retain price/cost provenance; other roles have commercial
  fields stripped. Inspector counterparty names and supplier label details are
  redacted.
- Admin costs and traceability/audit workspaces now use the mounted API
  responses for reports/prices/batches, genealogy, audit records, export logs,
  and export execution. Request failures are visible; no fixture success path
  is used.
- A MongoMemoryReplSet workflow now covers kg receipt, QA, batch reservation,
  process/rework, re-blending, shipment, cost generation, trace role masking,
  export logging, and append-only audit/export records.
- That workflow exposed rework drums being counted twice, rework provenance
  fields missing from the Drum schema, and cost/export writes that did not
  match their model contracts; these were corrected and covered.
- `pnpm typecheck`, `pnpm build`, and `pnpm test` passed; server Jest reports
  12 suites and 38 tests, including the replica-set integration workflow.
- The replica set is in memory. Do not treat this as live deployment database,
  browser, or Postman acceptance; those workflows remain to be run.
- See [BL-039](./ISSUES_AND_FIXES.md#resolved) and the current
  [master handoff](./BURAMLOOP_MASTER_PROMPT.md).

## ctx-v53 — Traceability, live costs/audit, and replica-set workflow (2026-11-02)

- Added role-aware trace response sanitization for origin slices and flat
  price/cost fields, preserving Inspector supplier/customer redaction.
- Replaced fixture-based Admin costs and traceability/audit views with live
  `/costs`, `/batches`, `/trace/:code`, `/audit`, and `/exports/logs` reads,
  plus audited cost generation and export execution.
- Persisted rework drum source links in the Drum model and prevented rework
  drums, including legacy `RW-` records, from being allocated as ordinary
  stock.
- Aligned cost-report attachments and report fields, and export log writes,
  with their existing Mongoose model contracts.
- Added an end-to-end MongoMemoryReplSet test traversing receipt → QA →
  reservation → processing/rework → re-blend → shipment → cost report →
  trace/export, with role masking and append-only log assertions.
- Validation passed: `pnpm typecheck`, `pnpm build`, and `pnpm test`
  (12 suites, 38 tests). No live deployment database, browser, or Postman
  acceptance was run.



> special note: for short note: SOurce/Supplier with info -> Price offer -> external analysis part (mostly decision made by choice of location, price, market demand , transport cost, quality, then sample request from supplier, or supplier sends sample to qsi)--> after report publishing --> there is inhouse QA test happens , if everything matches admin/ management goes for  contract--> then the incoming lots comes...

>here whatever we get offers the total weight should be calculated in per unit of kgs with the price, like no matter how many tons we rcv there will system generated value of per unit in kg and euro price..

>we will store all the source leads for future use in the business needs`

## ctx-v54 — Supplier leads, normalized offers, and contract-linked receipt (2026-11-02)

- Added persistent supplier lead creation, search, and status updates, plus
  shared offer normalization for kg/ton quantities, per-package kg, EUR/kg,
  EUR/ton, total-offer EUR, transport cost, and landed EUR/kg.
- Sourcing retains the existing `PRICE_OFFER` gate key and sequentially
  captures Management's external commercial/quality assessment, sample
  routing, and in-house sensory/QSI verification before a contract can be
  issued. Commercial fields remain restricted to Admin and Management.
- Replaced the fixture sourcing board with API-backed supplier, offer, gate,
  contract, and shipping workflows. Shipped contract receipt inherits source
  pricing and enforces supplier/material/origin/package matching plus
  cumulative contracted kg and package limits.
- Incoming receipt selection autofills the remaining contract kg/package
  balance; partial receipts do not repeat the full contract quantities.
- Added seven offer-normalization tests and a regression test for contract
  source-price inheritance and cumulative receipt balance. Fixed the receipt
  schema to preserve omitted manual price as `undefined`, allowing linked
  Warehouse receipts to inherit the server-held contract price.
- Workspace typecheck, production build, and server test suite passed
  (13 suites, 46 tests). No live sourcing/receipt
  database, browser, or Postman acceptance was run.
- Remaining: verify the full offer → gates → contract → shipped receipt path
  against a disposable replica set and through browser/Postman; non-kg
  sourcing/pricing, multi-line lots, and broader business workflow acceptance
  remain open.

## ctx-v55 — Sourcing-to-receipt replica-set acceptance (2026-11-03)

- Added `server/src/__tests__/sourcing-to-receipt-workflow.test.ts`, which
  runs the full source lead → normalized tonnage offer → Management external
  analysis → QSI sample routing → in-house/QSI approval → contract → shipment
  → two Warehouse partial receipts flow against `MongoMemoryReplSet`.
- Verified the 20.52-ton / 72-drum offer normalizes to 20,520 kg,
  285 kg/package, EUR 3.85/kg source price, and EUR 3.90/kg landed price.
  The contract inherits its offer price and promotes a `LEAD` supplier to
  `ACTIVE_PARTNER` with an audit record.
- Verified each 36-drum receipt inherits EUR 3.85/kg, creates origin-priced
  drums and append-only ledger entries, and advances the contract balance;
  package-count and kg overages are rejected with HTTP 409
  `CONTRACT_BALANCE_EXCEEDED` and leave no extra lot/ledger records.
- Updated the Postman guide with authenticated request headers, required body
  audit reasons, exact request payloads for all four gate steps, contract
  shipment, two partial receipts, and package/weight overage attempts. The
  guide is procedural documentation; no live Postman request was run.
- Validation passed: `pnpm typecheck`, `pnpm build`, and `pnpm test`
  (14 suites, 47 tests). No live API, browser, or Postman acceptance was run.

## ctx-v56 — Sample gate validation fix (2026-11-03)

- Fixed the client Sample approval payload: the optional `weightGrams` field
  is removed from the form-state spread and only sent as a number when
  provided. This prevents a blank form value from being sent as `""` and
  rejected by the API schema, which expects a number.
- Added an optional sample-weight-in-grams input and a brief workflow sequence
  under “Sourcing decisions and contracts.”
- Documented that Postman must send `weightGrams` as a JSON number or omit the
  property when unknown.
- Validation passed: `pnpm typecheck` and `pnpm build`.
 No live browser/API
  click-through was run.

## ctx-v57 — Persisted incoming-lot QA and batch progression (2026-11-03)

- Incoming lot QA Pass/Fail now calls `POST /stock/lots/:id/review` with the
  decision, required lab report number, and audited reason. Mismatch return
  calls `POST /stock/lots/:id/return-mismatch` with required mismatch details
  and reason. Client lot state changes only after the API confirms success.
- A passed lot persists as `PASSED`; quarantined stock units transition to
  `Approved` at `Warehouse`. QA release does not automatically create a
  production batch.
- The production sequence remains separate: check customer/material/quantity
  in Batch Planning feasibility, then confirm the audited reservation to
  create a batch from eligible Warehouse stock. Batch processing eligibility
  remains active kg HONEY only.
- Extended the MongoMemoryReplSet workflow to assert the saved lab report,
  persisted lot status, Warehouse stock-unit status/location, then verify
  feasible allocation before batch reservation. Updated the Postman guide
  with the QA → Warehouse → feasibility → batch sequence.
- Validation passed: `pnpm typecheck`, `pnpm build`, and `pnpm test`
  (14 suites, 47 tests). No live browser/API click-through was run.

## ctx-v58 — Connected batch stock availability & warm-room operator terminal (2026-11-03)

- Added `GET /batches/stock-availability` (`BatchService.listMaterialStockAvailability`) to aggregate eligible unreserved Warehouse drums and `IBC`/`DRUM`/`BUCKET_TRAY` stock packages, QA Quarantine balances, origin countries, and shipped/received incoming lots per active `kg` honey material.
- Updated `BatchPlanningWorkspace.tsx` so the **Active Honey Material (kg)** selector and connected Warehouse stock panel display live approved kg, customer-policy-compatible kg, pending QA quarantine kg, and per-lot origin breakdowns with quick-fill actions; removed stray warm-room fields from the batch reservation payload.
- Upgraded `WarmCabinetsWorkspace.tsx`, `WarmRoomService.checkInDrum`, and `CabinetSlotSchema` to support one-by-one drum barcode/label scanning (`MobileCameraBarcodeModal` + manual/eligible-drum lookup by `_id`, `drumCode`, or `barcode`), server-feasible batch assignment, warming presets (`6h, 12h, 18h, 24h, 30h, 36h, 42h, 48h`, or custom `1–120h`), real-time clock/countdown, real-time simulated temperature ramp (`20°C` → target `45°C`) with sensor-ready architecture, target-reached alert notifications, and persisted operator notes.
- Validation passed: `pnpm typecheck`, `pnpm build`, and `batch-service.test.ts` (3 tests). See [BL-044](./ISSUES_AND_FIXES.md#resolved).

## ctx-v59 — Server feasibility multi-pass allocation & shipped-contract materialization (2026-11-03)

- Hardened `BatchService.simulateFeasibility`, `BatchService.listMaterialStockAvailability`, and `BatchService.approveAndReserveBatch` (`server/src/modules/batch/batch.service.ts`):
  - Removed the restrictive `packageType` filter on `StockPackageModel` so all `kg` stock packages are eligible.
  - Corrected `PriceModel` lookup to `{ materialId: material._id, isVoid: false }.sort({ effectiveDate: -1 })` and added `resolvePositivePrice()` so `0` placeholder slice prices fall back to lot/contract/material pricing.
  - Added multi-pass allocation in `simulateFeasibility`: (1) `Approved`/`InWarehouse` units matching `customer.allowedCountries`, (2) `Quarantine` units matching `customer.allowedCountries`, (3) non-blocked origin countries outside the initial customer `allowedCountries` list, and (4) drumless `IncomingLot` records, unreceived `SHIPPED`/`SIGNED` `Contract` balances, and `SHIPPED`/`CONTRACTED`/`PASSED` `Sourcing` offers.
  - Enabled feasible allocation whenever `accumulatedKg > 0` (even if available stock such as a `5,800 kg` 20-drum lot is below the default `6,000 kg` target), and added `materializePendingStockIfNeeded()` in `approveAndReserveBatch` so unreceived shipped contracts/lots materialize into real Warehouse `Drum` records and ledger entries during atomic batch reservation.
- Updated `BatchPlanningWorkspace.tsx` to surface shipped contract balances (`SHIPPED CONTRACT` badge and lot cards) and auto-adjust `plannedInputKg` to the selected material's available/quarantine/shipped stock.
- Validation passed: `pnpm typecheck`, `pnpm build`, and `batch-service.test.ts` + `price-mask-controllers.test.ts` (2 suites, 7 tests). See [BL-045](./ISSUES_AND_FIXES.md#resolved).

## ctx-v60 — Warm-out movement enum fix & Tailwind feedback modals (2026-11-03)

- Fixed `WarmRoomService.checkOutDrum` (`server/src/modules/warm-room/warm-room.service.ts`) so `StockMovementModel.create` uses the canonical `STOCK_MOVEMENT_TYPES` enum values `'WARM_OUT_FILTRATION'` and `'WARM_OUT_WAREHOUSE'` instead of `'WARM_OUT_TO_FILTRATION'` and `'WARM_OUT_TO_WAREHOUSE'`, preserves `slotEntry.batchId` on `drum.reservedBatchId` when routing to `FILTRATION`, and records optional operator `notes` in both the movement reason and `auditLogs`.
- Added a reusable Tailwind `FeedbackModal` component (`SUCCESS` | `ERROR` | `WARNING`) in `client/src/components/ui/IndustrialPrimitives.tsx` based on the centered Tailwind modal pattern (`fixed inset-0 z-50 bg-black/60 flex items-center justify-center`, circular status icon badge, title, detail badge, message, and Close button), and wired it into `WarmCabinetsWorkspace.tsx` and `BatchPlanningWorkspace.tsx` while keeping live non-blocking telemetry banners inline.
- Validation passed: `pnpm typecheck`, `pnpm build`, and `batch-service.test.ts` + `price-mask-controllers.test.ts` (2 suites, 8 tests). See [BL-046](./ISSUES_AND_FIXES.md#resolved).

## ctx-v61 — Filling completion `CONSUME_BATCH` stock-movement fix & processing modal feedback (2026-11-03)

- Fixed `ProcessService.executeStage` (`server/src/modules/process/process.service.ts`) where committing the final `FILLING` stage (`sevenStageTarget: 'COMPLETED'`) created `CONSUME_BATCH` `StockMovement` entries for `reservedDrums` without `materialId` or `country` (and where legacy batches missing `baseMaterialId` could fail during `REWORK_CREATED` or `CONSUME_BATCH`). `executeStage` now resolves `effectiveMaterialId` and `fallbackCountry`, populates `materialId`, `country`, `fromStatus`, and `toStatus` on all `CONSUME_BATCH` and `REWORK_CREATED` stock movements, and includes `'Warming'` in the consumed-unit status query.
- Wired `FeedbackModal` into `ProcessingWorkspace.tsx` (`client/src/pages/ProcessingWorkspace.tsx`) for stage commit confirmations, rework drum serialization, and server error alerts.
- Validation passed: `pnpm typecheck`, `pnpm build`, and `batch-service.test.ts` + `price-mask-controllers.test.ts` (2 suites, 9 tests). See [BL-047](./ISSUES_AND_FIXES.md#resolved).

## ctx-v62 — Client UI copy decluttering & documentation of operational notes (2026-11-03)

- Removed internal specification/roadmap step labels (`STEP 5D..6I`, `5G/5H/5I/5J` nav badges), rule codes (`R1`–`R14`), raw API route hints, Nextcloud storage path strings, and verbose collection/schema descriptions from the client workspaces (`AppShell.tsx`, `IndustrialPrimitives.tsx`, `OperationsDashboard.tsx`, `WarmCabinetsWorkspace.tsx`, `BatchPlanningWorkspace.tsx`, `ProcessingWorkspace.tsx`, `ShipmentLotsWorkspace.tsx`, `WarehouseStockLedgerWorkspace.tsx`, `IncomingStockWorkspace.tsx`, `SourcingWorkspace.tsx`, `AdminCostsWorkspace.tsx`, `TraceabilityAuditWorkspace.tsx`, and `MasterDataWorkspace.tsx`).
- Preserved all special operational, sensor/telemetry, mass-balance, Nextcloud path, and `R1`–`R14` domain rule notes in [BURAMLOOP_CONTEXT.md](./BURAMLOOP_CONTEXT.md).
- Validation passed: `pnpm typecheck` and `pnpm build`.

## ctx-v63 — Comprehensive codebase audit & full-stack remediation (2026-11-04)

- Completed a full-stack technical inspection across `shared`, `server`, `client`, and infrastructure, followed by incremental fixes (`BL-049`):
  - **Shared Schemas (`shared/src/schemas/outbound.ts`, `shared/src/schemas/master.ts`):** Added `'WARM_READY'`, `'DEVIATION_MISMATCH'`, and `'PROCESS_DEVIATION'` to `NOTIFICATION_TYPES` to prevent Mongoose validation rollbacks during QA rejection, mismatch return, early warm-out, and >2.5% process loss alerts; aligned `UpsertQualityGradeSchema` with `rank` and uppercase quality grade codes.
  - **Batch, Process & Shipment Integrity (`batch.service.ts`, `process.service.ts`, `shipment.service.ts`):** Removed customer master `allowedCountries` mutation from `BatchService.approveAndReserveBatch`; updated `ShipmentService.createShipmentLot` to honor batch-approved origins for the batch's customer and enforce cumulative `orderedKg` limits across all non-void shipment lots for a batch; fixed `ProcessService.executeStage` so `batch.totalInputKg` and `batch.totalFilledKg` preserve mass balance instead of accumulating across sequential steps.
  - **Stock, Barcode, Attachment & Export APIs (`stock.routes.ts`, `stock.controller.ts`, `attachment.*`, `export.*`):** Mounted `GET /api/v1/stock/drums/:id/zpl-label` and `GET /api/v1/stock/barcode/:code`; added query-string sanitization and commercial price masking on `/stock/drums` and `/stock/packages`; added `GET /api/v1/attachments/health`, `entityCode` filtering, and deterministic `entityId` fallback; fixed `ExportService.listExportLogs` sort order (`{ createdAt: -1 }`).
  - **Route Validation, Auth & Ledger Hardening (`master.*`, `batch.routes.ts`, `warm-room.routes.ts`, `process.routes.ts`, `cost.routes.ts`, `export.routes.ts`, `stock.model.ts`, `app.ts`, `error.middleware.ts`):** Added `validateBody` Zod validation to mutating routes; incremented `User.tokenVersion` when `roleId` or `isActive` changes; added `updateOne`/`updateMany`/`findOneAndUpdate`/`replaceOne` immutability pre-hooks on `StockMovementSchema`; removed duplicate `/health` and `/health/storage` routes; protected `/api/v1/health/full` with `authenticate` + `requireAdminOnly`; and sanitized 500 error messages in production.
  - **Frontend Integration & Cleanup (`App.tsx`, `CrossCuttingPanels.tsx`, `SourcingWorkspace.tsx`, `IncomingStockWorkspace.tsx`, `MasterDataWorkspace.tsx`):** Wired `ExportMenu` and `AttachmentsPanel` to real API payloads and download streams without fake local fallbacks; passed required `externalAnalysis` fields in `App.tsx`; handled `/master/counters` 403 gracefully for non-Admin roles; and removed 18 zero-byte placeholder files plus the stray `client/client` directory.
- Validation passed: `tsc --noEmit` across `shared`, `server`, and `client` (0 errors) and 11 server unit test suites (48 tests). See [BL-049](./ISSUES_AND_FIXES.md#resolved) and [TECHNICAL_AUDIT_REPORT.md](./TECHNICAL_AUDIT_REPORT.md) (`v1.1`).

## ctx-v64 — Phase 4 audit security & performance completion (2026-11-04)

- Completed all remaining Phase 4 items from [TECHNICAL_AUDIT_REPORT.md](./TECHNICAL_AUDIT_REPORT.md) (`v1.2` / `BL-050`):
  - **Authentication Rate Limiting (`HIGH-07`):** Added `loginRateLimiter` (20 attempts / 15 min) and `passwordChangeRateLimiter` (10 attempts / 15 min) in `server/src/modules/auth/auth.routes.ts`.
  - **Docker Compose Cleanup (`MED-02`):** Removed the unused `redis` service dependency from `server` in `docker-compose.yml` while keeping `redis` for `nextcloud`.
  - **In-Memory / Cookie-Backed Token Handling (`MED-03`):** Updated `client/src/lib/apiClient.ts`, `LandingWithLoginPage.tsx`, and `App.tsx` to store the bearer token in memory (`apiClient.setBearerToken(...)`) rather than persisting raw JWTs in `window.sessionStorage`.
  - **Bounded Queries & Parallel Storage Integrity (`MED-05`, `MED-06`):** Added `.limit(500)` bounds on `IncomingLotModel` and `PriceModel` queries in `stock.service.ts` and `sourcing.service.ts`, and updated `AttachmentService.verifyStorageIntegrity` to check WebDAV files in concurrent batches of 8.
  - **Vite Bundle Chunk Splitting (`LOW-02`):** Added `manualChunks` (`vendor` and `scanner`) in `client/vite.config.ts`.
  - **Master Data 5-Tab CRUD Workspace (`HIGH-08`):** Expanded `client/src/pages/MasterDataWorkspace.tsx` from Materials + read-only Counters to 5 interactive tabs (`Materials`, `Customers` with 1–3 allowed/blocked countries, `Suppliers`, `Quality Grades`, and `Counters` with Admin sequence override).
- Validation passed: `tsc --noEmit` across `shared`, `server`, and `client` (0 errors) and 11 server unit test suites (48 tests). See [BL-050](./ISSUES_AND_FIXES.md#resolved) and [TECHNICAL_AUDIT_REPORT.md](./TECHNICAL_AUDIT_REPORT.md) (`v1.2`).


## ctx-v65 — Admin user account governance & live dashboard feeds (2026-11-05)

- Completed Admin user management in `client/src/pages/UserAndProfileWorkspace.tsx` (`BL-025`, `BL-027`, `BL-051`):
  - Added inline management and activation/deactivation controls for directory users.
  - Implemented audited user account edits (full name, email, role assignment, active/deactivated status, and optional >=10 char temporary password reset) wired to `PUT /api/v1/master/users/:id`.
  - Updated `MasterService.upsertUser` (`server/src/modules/master/master.service.ts`) to resolve role by either ObjectId or role name string, return populated role names, and ensure `tokenVersion` increments to invalidate active sessions when role, active state, or password changes.
- Wired live notification and stock ledger feeds in `client/src/App.tsx` and `client/src/pages/OperationsDashboard.tsx` (`BL-031`, `BL-051`):
  - Added `PATCH /api/v1/notifications/:id/read` alias to `server/src/modules/notification/notification.routes.ts` with user acknowledgement tracking.
  - Synchronized `GET /api/v1/notifications` and `GET /api/v1/stock/ledger` on initial load and dashboard refresh.
  - Populated recent stock movement table with live delta, per-lot balance, operator name, and audited reason.
  - Added one-click notification acknowledgement in the dashboard alerts card.
- Refreshed documentation in `docs/ROADMAP.md` and `docs/PROJECT_TRACKER.md` reflecting verified 14-suite test baseline, 5-tab Master Data workspace, and mounted barcode/ZPL endpoints.
- Validation passed: `tsc --noEmit` across `shared`, `server`, and `client` (0 errors), client production build (`vite build`), and all 14 server Jest suites (52 tests, including `MongoMemoryReplSet` E2E suites).


## ctx-v66 — Role push notifications, audio alerts & interactive modal inspectors (2026-11-05)

- Implemented synthesized audio chimes and native push notification delivery (`client/src/lib/notificationSound.ts`, `BL-052`):
  - Added zero-dependency Web Audio API synthesized chimes for `info`, `warning`, and `critical` severity tones without requiring external audio assets.
  - Integrated native browser Notification API permission requests on session start and automated background push notifications tailored to role-targeted alert streams.
- Created bottom pop-up toast alerts (`client/src/components/ui/ToastNotification.tsx`, `BL-052`):
  - Displays incoming notifications at the bottom-right corner for 2 seconds with an automatic fade-out and slide transition.
  - Includes manual dismiss close button (`X`) and severity styling (critical red, warning amber, info elevated dark).
- Enhanced Header Notification Bell with mouse-hover preview (`client/src/components/layout/AppShell.tsx`, `BL-052`):
  - The notification bell now opens an active role-specific alert dropdown immediately on mouse hover, with a test-sound button, direct mark-as-read actions, unread badge counter, and link to Audit Docs.
- Implemented reusable Tailwind record detail modals (`client/src/components/ui/DetailModal.tsx`, `client/src/pages/OperationsDashboard.tsx`, `BL-052`):
- Configured industry-standard PWA infrastructure for native device push notifications (`client/public/manifest.json`, `client/public/sw.js`, `index.html`, `BL-052`):
  - Registered Service Worker with Web Push Notification listener and window focus/open click handler.
  - Added PWA Web App Manifest with standalone display mode, theme colors, and mobile homescreen compatibility.
## ctx-v67 — Notification Hover & Pin, Native PWA Push, Admin Audit Advanced Filtering & CSV Export vs Govt Trace Separation (2026-11-05)

- Differentiated Government Inspection Trace from Internal Admin Audit in `client/src/pages/TraceabilityAuditWorkspace.tsx` (`BL-053`):
  - Created two distinct tabbed workspaces: **Admin Audit & Data Exports** (for internal compliance, full event history, before/after diffs, and filtered data dumps) and **Government Inspection Trace** (for regulatory audits with counterparty commercial redaction).
  - Preserved existing Government trace contract pending user regulatory/API decisions.
- Advanced Admin Audit query filtering and CSV export (`server/src/modules/audit/audit.routes.ts`, `client/src/pages/TraceabilityAuditWorkspace.tsx`, `BL-053`):
  - Enhanced `GET /api/v1/audit` endpoint with multi-parameter filtering: `module`, `action`, `actorRole`, `entityType`, `entityRef` regex, `actorId`, `startDate` & `endDate` range bounds, and full-text search across reasons, entity references, actions, and modules, with populated actor details.
  - Added debounced multi-field filter bar in the Admin Audit view.
  - Implemented before/after JSON change diff modal for inspecting audit record mutations.
  - Added direct client-side CSV export (`exportFilteredAuditToCsv`) to download filtered audit logs instantly.
- In-App & PWA Notification Architecture (`client/src/components/layout/AppShell.tsx`, `client/public/manifest.json`, `client/public/sw.js`, `BL-052`):
  - Bell header interaction now supports dual behavior: quick-glance dropdown preview on mouse hover, and click-to-pin open (with pinned indicator, outside-click dismissal, close button, and Escape key dismissal).
  - Configured PWA Service Worker with Push Notification listener and window focus/open click handler.
  - Added Web App Manifest with standalone display, dark/amber theme colors, and mobile icons.
- Validation passed: `tsc --noEmit` on client and server passed (0 errors); client Vite build passed; all 14 server Jest suites (52 tests, including `MongoMemoryReplSet` E2E workflows) passed.

## RULES  for  BURAMLOOP AI DEVELOPMENT

1. Inspect existing code before proposing changes.
2. Explain the intended changes before editing.
3. Do not modify files until I approve the plan.
4. Do not run destructive commands.
5. Do not install, upgrade or remove dependencies without approval.
6. Do not change database schemas or migrations without approval.
7. Never access, print or transmit secrets from .env files.
8. Preserve existing API contracts unless explicitly approved.
9. Make small, focused changes rather than broad rewrites.
10. After editing, list every changed file and explain why.
11. Show the Git diff before asking me to commit.
12. Run relevant tests only after approval.
13. Report failures honestly; never claim tests passed without running them.
14. Wait for my approval before staging or committing.