# BuramLoop project tracker

This is the project index for the issue register, daily work log, and roadmap.
Update these documents as work is done; record new failures with the exact
symptom, root cause, change, and verification result.

## Tracking documents

- [Issue register](./ISSUES_AND_FIXES.md) — reported issues, fixes, and open items.
- [Daily log](./DAILY_LOG.md) — dated work and validation notes.
- [Roadmap](./ROADMAP.md) — sequenced project delivery priorities.
- [Master handoff prompt](./BURAMLOOP_MASTER_PROMPT.md) — verified current
  state, complete requirements, decisions to confirm, and next-step register.
- [Environment setup and troubleshooting](./ENVIRONMENT_SETUP.md) — local
  setup steps, command reference, and startup/typecheck history.
- [Postman API testing guide](./POSTMAN_API_TESTING.md) — authentication,
  mounted routes, exact kg/ton receipt payload, process-step and shipment
  payloads/statuses, local acceptance sequence, and redacted failure reporting.
- Guided Postman progress: the user confirmed local `GET /api/v1/health`
  passed; login and remaining route tests are not yet reported.
- The guide now includes a disposable-replica-set vertical receipt → QA
  approval → batch simulation workflow and warns that reservation is a
  durable stock mutation. These steps have not yet been reported as run.

## Current baseline

- pnpm 12 explicitly blocks Tesseract's optional OpenCollective postinstall
  script in `allowBuilds`; `docker compose build client server` passed and
  created both images ([BL-029](./ISSUES_AND_FIXES.md#resolved)).
- `pnpm typecheck` passes for shared, client, and server packages.
- `pnpm -r build` and `pnpm --filter @buramloop/server build` pass after
  resolving the batch/process/shipment compiler failures ([BL-014](./ISSUES_AND_FIXES.md#resolved)).
- The ctx-v57 `pnpm typecheck`, `pnpm build`, and `pnpm test` passed;
- The ctx-v70/ctx-v71 pnpm typecheck, pnpm build, and all 15 server Jest suites (57 tests) pass, including the complete sourcing-to-receipt and receipt-to-trace/export MongoMemoryReplSet workflows.
  sourcing-to-receipt MongoMemoryReplSet workflow, offer normalization,
  contract-price inheritance, receipt-to-shipment/cost/trace coverage, and
  persisted QA release to Warehouse followed by batch feasibility
  ([BL-036](./ISSUES_AND_FIXES.md#resolved),
  [BL-037](./ISSUES_AND_FIXES.md#resolved),
  [BL-038](./ISSUES_AND_FIXES.md#resolved),
  [BL-039](./ISSUES_AND_FIXES.md#resolved),
  [BL-040](./ISSUES_AND_FIXES.md#resolved),
  [BL-041](./ISSUES_AND_FIXES.md#resolved),
  [BL-043](./ISSUES_AND_FIXES.md#resolved)). The ctx-v56 Sample payload fix
  also passes `pnpm typecheck` and `pnpm build` ([BL-042](./ISSUES_AND_FIXES.md#resolved)).
  These tests verify transactions
  against an in-memory replica set, not a live deployment database; browser
  and Postman acceptance remain outstanding
  ([BL-012](./ISSUES_AND_FIXES.md#open--needs-follow-up),
  [BL-036](./ISSUES_AND_FIXES.md#resolved),
  [BL-037](./ISSUES_AND_FIXES.md#resolved),
  [BL-038](./ISSUES_AND_FIXES.md#resolved),
  [BL-039](./ISSUES_AND_FIXES.md#resolved),
  [BL-040](./ISSUES_AND_FIXES.md#resolved)).
- A runtime smoke check confirmed all 29 registered models load and sourcing
  request schemas accept/reject representative inputs as expected.
- A local API instance connected to the MongoDB replica set and storage health
  passed; the Vite client renders and proxies health checks to the API.
- The Compose API container is running with zero restarts; its health endpoint
  and the client's reverse-proxied health endpoint both report MongoDB
  connected ([BL-018](./ISSUES_AND_FIXES.md#resolved)).
- The seed-script update passes server typecheck, build, and tests. A user-run
  seed attempt failed before connecting because the host process used the
  Compose-only `mongodb` hostname; the host URI override and retry steps are
  documented, and a successful seed run remains unverified
  ([BL-019](./ISSUES_AND_FIXES.md#resolved), [BL-020](./ISSUES_AND_FIXES.md#open--needs-follow-up)).
- The client app typechecks/builds and now checks `/auth/me` before rendering
  the ERP, using backend identity/permissions and providing logout. This flow
  has not yet been verified against a live authenticated browser session.
- Account/profile flows now include self-service password change, profile
  name/avatar upload, a first-login password-change gate, session-token
  revocation, and an Admin directory/create-user form (including secondary
  Admin creation) ([BL-027](./ISSUES_AND_FIXES.md#resolved)). They build and
  typecheck, but do not yet have endpoint integration or browser acceptance
- Account/profile flows now include self-service password change, profile name/avatar upload, a first-login password-change gate, session-token revocation, and an Admin directory with create, update, activate/deactivate, and temporary password reset actions (BL-027, BL-051).
- Effective Warehouse baseline permissions are applied at login and on
  authenticated API requests; QA approval remains separate. Authentication
  validates JWT subjects before lookup and does not misreport unexpected
  database/programming failures as invalid credentials
  ([BL-030](./ISSUES_AND_FIXES.md#resolved)).
- The account workspace now has contextual guidance, visible permissions,
  avatar preview, password confirmation, role badges and an audited-reason
  confirmation dialog. The admin directory remains API-backed; the compared
  mockup's demo data and fake-success behavior were not adopted.
- Master data is now an Admin-only navigation destination with API-backed
  material/counter reads and audited material creation; the shared process
  breadcrumb is mounted. Product setup now supports independent kg/L/piece
  units and package/allergen metadata; unit changes are blocked after
  creation. Unit-aware kg/L/piece receipts now persist package quantities and
  append-only per-unit ledger movements without creating drums for non-kg
  stock. Kg intake accepts total mass in kg or tonnes and previews exact
  package distribution; optional source price entry is restricted to
  Admin/Management and enforced by the API. Existing kg/drum receipts remain
  supported; batch eligibility
  remains active kg honey, with allocation across actual-weight drums,
  supported kg IBC/DRUM/BUCKET_TRAY packages, and explicitly selected eligible
  rework. Batch origins preserve source lot/package/rework and normalized
  weight and cost percentages; process-generated rework retains the derived
  origin weights, source links, unit prices, cost values and cost shares.
  Kg-based sourcing now retains supplier leads, normalizes kg/ton offers and
  price bases, enforces sequential gates, carries terms into contracts, and
  links shipped contracts to capped incoming receipts. Non-kg sourcing,
  package-level barcode uniqueness, batch-reservation acceptance, and live
  receipt API/browser/Postman acceptance remain open. QA decisions now persist
  through the stock API; passed stock stays in Warehouse until reserved for a
  batch after feasibility. The transaction-backed sourcing/receipt and
  receipt/QA/feasibility/batch workflows are covered by ctx-v55/v57 tests
  ([BL-024](./ISSUES_AND_FIXES.md#open--needs-follow-up),
  [BL-035](./ISSUES_AND_FIXES.md#resolved),
  [BL-043](./ISSUES_AND_FIXES.md#resolved)).
  Shell navigation and the breadcrumb now
  apply role and permission filtering; camera/manual barcode capture is wired
  to the active receiving form. Warehouse users with `stock:read` and
  `stock:write` can open intake, scan or manually enter a supplier-lot code,
  and access the receive form; Admin retains the same capability. Camera
  decoding now uses ZXing instead of browser-specific `BarcodeDetector`, and
  Tesseract.js OCR now extracts label text locally for operator review/edit.
  Receipt uses master-data IDs and the real API, persists optional
  barcode/OCR metadata, and uploads the captured image after receipt with an
  explicit retry path on upload failure. QA-only users can review but do not
  see receive controls. Barcode uniqueness is not validated. Warm-room
  and batch still share a rendered component; Admin costs and traceability/
  audit are API-backed following ctx-v53;   The sourcing board and sourcing-to-receipt workflow are covered by
  ctx-v54/v55; the Sample gate omits blank optional weight and sends entered
  grams as a number (ctx-v56).
  The Operations Dashboard now provides role-specific summaries and
  permission-aware shortcuts. It loads lot, warm-room, batch, and sourcing
  data from APIs; dashboard warm-room and sourcing-gate actions report server failures and
  update state only after successful responses. Processing now reads process
  records and tanks/fill lines from the API; shipment management reads live
  lots, completed batches and customers, and uses audited create/status
  mutations. Shipment dashboard counts are populated after that workspace has
  loaded; stock movements and notifications remain unsynchronized. Other
  operational screens still need review for static fixtures and
  offline-success mutation catches. Admin costs and trace/audit no longer use
  local fixtures or fake offline success.
  Responsive and full workflow acceptance remain outstanding. See the
  roadmap and master handoff prompt.

## How to maintain the tracker

1. Add each new user-reported defect or actionable code issue to the issue
   register, including its current status.
2. Add a dated entry to the daily log after each work session. Keep completed
   work distinct from pending work and record commands/results for validation.
3. Update roadmap status only when implementation or verification supports the
   change. Do not mark a feature complete merely because a directory or
   placeholder exists.
4. Do not put credentials, private customer data, or secret values in these
   documents.