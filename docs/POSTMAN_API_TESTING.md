# Testing the BuramLoop API with Postman

This guide covers the routes mounted by `server/src/app.ts`. Test only against
a local or disposable database. Do not run mutation, export, or integrity tests
against production data.

## 1. Start the API and check health

For host-run development, start the API from the repository root with
`pnpm dev` (or use the server's `pnpm dev` script). The API expects MongoDB
configured as a replica set; see [Environment setup](./ENVIRONMENT_SETUP.md)
for local and Compose connection settings.

Create a Postman environment with:

| Variable | Initial value |
|---|---|
| `baseUrl` | `http://127.0.0.1:4000/api/v1` |

Use the same hostname for every request. `localhost` and `127.0.0.1` have
separate cookie jars.

Send these unauthenticated requests first:

| Request | Method and URL | Expected |
|---|---|---|
| API/database health | `GET {{baseUrl}}/health` | `200`, `ok: true`, `dbState: "connected"` |
| Storage health | `GET {{baseUrl}}/health/storage` | `200` and `ok: true` when storage is ready |
| Full integrity diagnostics (optional) | `GET {{baseUrl}}/health/full` | `200` when DB, storage, and integrity checks pass; this runs a broader audit and may take longer |

`/health/db` is not mounted. If health fails, stop here and resolve the API,
MongoDB replica-set, or storage startup error before testing authenticated
routes.

## 2. Authenticate in Postman

1. Send `POST {{baseUrl}}/auth/login` with **Body → raw → JSON**:

   ```json
   {
     "email": "admin@buram.de",
     "password": "<your local seeded admin password>"
   }
   ```

   The password is the one configured for your own local seed. There is no
   password to copy from this guide. If this account is unavailable, use an
   authorized local test account; do not seed or reset accounts in a database
   containing data you need.
2. Check Postman's cookie manager for the `buramloop_token` cookie for the same
   host. Postman normally stores and sends it automatically. Leave the
   Authorization tab set to **No Auth** unless you intentionally choose the
   supported Bearer-token alternative; do not copy a live token into notes or
   chat.
3. Send `GET {{baseUrl}}/auth/me`. Confirm the response is successful and note
   the returned role and permissions (redact email/name before sharing logs).
4. If `mustChangePassword` is true, send
   `PATCH {{baseUrl}}/auth/change-password` with:

   ```json
   {
     "currentPassword": "<current password>",
     "newPassword": "<new password meeting the schema requirements>"
   }
   ```

   Then sign in again: a password change expires the current session.

The login cookie is preferred for Postman. The API also accepts
`Authorization: Bearer <token>`. Never share the cookie, bearer token, or
password.

## 3. Shared request rules

- Use **Body → raw → JSON** for JSON requests. Postman sets
  `Content-Type: application/json`.
- For audited writes, include a `reason` string in the JSON body, at least five
  characters long, for example `"reason": "Postman local test"`. A
  `x-audit-reason` header alone does **not** satisfy the `requireReason`
  middleware.
- Uploads use **Body → form-data** with a file field named `file`. Do not set
  the multipart `Content-Type` manually; Postman supplies its boundary.
- A normal JSON success is shaped like `{ "ok": true, "data": ... }`. Some
  endpoints return a message or a file instead. Errors use
  `{ "ok": false, "code": "...", "message": "...", "details": ... }`.
- `401` usually means no valid session; `403` means the signed-in role lacks
  permission or is required to change its temporary password; `400` usually
  means invalid input or a missing audit reason; `404` may mean a route or
  referenced record does not exist. Record the response before deciding it is
  a code defect.
- For `:id` and related fields, copy IDs from real records returned by your
  local GET requests. Do not invent IDs and expect successful mutations.

## 4. Run requests in dependency order

Start with read-only requests. Then try writes only with disposable local data,
appropriate permissions, and a reason in the body. Several operations advance
workflow state or create durable records; there is no general test-data
rollback endpoint.

### A. Authentication and profile

| Method | Path | Notes |
|---|---|---|
| `POST` | `/auth/login` | Public; establishes the cookie session. |
| `GET` | `/auth/me` | Authenticated session and current permissions. |
| `PATCH` | `/auth/profile` | Updates the signed-in user's profile; use schema-valid fields. |
| `GET` | `/auth/profile/avatar` | Returns the signed-in user's image; expect not-found if none is set. |
| `POST` | `/auth/profile/avatar` | Multipart form with `file`; JPEG, PNG, or WebP only. |
| `PATCH` | `/auth/change-password` | Changes own password and invalidates the current session. |
| `GET` | `/auth/users` | Admin only. |
| `POST` | `/auth/users` | Admin only; creates a user that must change its initial password. Requires body `reason`. |
| `POST` | `/auth/logout` | Authenticated; run last, since it clears the session. |

### B. Master data

Read these first and use their returned IDs/codes in downstream workflows:

| Method | Path | Write notes |
|---|---|---|
| `GET` | `/master/roles` | |
| `POST`, `PUT` | `/master/roles`, `/master/roles/:id` | Admin only; body `reason`. |
| `GET` | `/master/users` | |
| `POST`, `PUT` | `/master/users`, `/master/users/:id` | Admin only; body `reason`. |
| `GET` | `/master/materials` | Optional query: `kind`, `activeOnly=true`. |
| `POST`, `PUT` | `/master/materials`, `/master/materials/:id` | `master:write`; body `reason`; request schema in `shared/src/schemas/master.ts`. |
| `GET` | `/master/quality-grades` | |
| `POST`, `PUT` | `/master/quality-grades`, `/master/quality-grades/:id` | `master:write`; body `reason`. |
| `GET` | `/master/suppliers` | |
| `POST`, `PUT` | `/master/suppliers`, `/master/suppliers/:id` | `master:write` or `sourcing:write`; body `reason`. |
| `GET` | `/master/customers` | |
| `POST`, `PUT` | `/master/customers`, `/master/customers/:id` | `master:write` or `shipments:write`; body `reason`; schema in `shared/src/schemas/outbound.ts`. |
| `GET` | `/master/infrastructure` | |
| `POST` | `/master/stock-thresholds` | `master:write`; body `reason`. |
| `GET` | `/master/counters` | Admin only. |
| `POST` | `/master/counters/override` | Admin only; body `reason`. Changes a sequence counter. |

### C. Sourcing and incoming stock

| Method | Path | Notes |
|---|---|---|
| `GET` | `/sourcings/leads` | Lists retained supplier leads and offer counts; commercial latest-price field is Admin/Management-only. |
| `POST` | `/sourcings/leads` | `sourcing:write`, `management:approve`, or `master:write`; body `reason`. |
| `PATCH` | `/sourcings/leads/:id/status` | `sourcing:write` or `management:approve`; body `reason`. Leads can be put on hold and reactivated. |
| `GET` | `/sourcings` | Read sourcing records; commercial offer/contract fields are Admin/Management-only. |
| `GET` | `/sourcings/prices` | Admin/Management commercial access. |
| `POST` | `/sourcings` | `sourcing:write` or `management:approve`; body `reason`; request schema in `shared/src/schemas/purchase.ts`. |
| `POST` | `/sourcings/:id/gates` | Gate permission is checked by the service; schema and body `reason` required. Advances sourcing state. |
| `POST` | `/sourcings/:id/contracts` | `contracts:write`, `management:approve`, or `sourcing:write`; body `reason`; requires status `PASSED`. |
| `POST` | `/sourcings/contracts/:contractId/ship` | `contracts:write`, `management:approve`, or `sourcing:write`; body `reason`. |
| `GET` | `/sourcings/contracts` | Lists shipped contracts available for incoming receipt. |
| `POST` | `/sourcings/prices` | Admin/Management commercial access; body `reason`. |
| `GET` | `/stock/lots` | `stock:read`; list incoming lots. |
| `POST` | `/stock/lots/receive` | `stock:write`; body `reason`; receive schema in `shared/src/schemas/stock.ts`. Creates stock and ledger records. |
| `POST` | `/stock/lots/:id/review` | `qa:approve`; body includes `decision` (`PASSED` or `FAILED`), `labReport`, and `reason`. |
| `POST` | `/stock/lots/:id/return-mismatch` | `stock:write`; body includes `mismatchDetails` and `reason`. |
| `GET` | `/stock/drums` | `stock:read`. |
| `GET` | `/stock/packages` | `stock:read`. |
| `GET` | `/stock/summary` | `stock:read`. |
| `GET` | `/stock/ledger` | `stock:read`; append-only movement records. |
| `GET` | `/stock/ledger/integrity-check` | `stock:read`; diagnostic. |

### Sourcing-to-receipt sequence

Use Postman environment variables for `adminJwt`, `managementJwt`,
`sourcingJwt`, `qaJwt`, `warehouseJwt`, `supplierId`, `materialId`,
`sourcingId`, and `contractId`. Each write below includes both the
`X-Audit-Reason` header and a JSON `reason`. **The body field is required** by
these routes; the sourcing and stock `requireReason` middleware does not use
the header as a substitute. Keep each JWT private.

Before creating test data, read `GET {{baseUrl}}/master/materials?activeOnly=true`
and `GET {{baseUrl}}/sourcings/leads`; choose an active kg material and a
disposable supplier code not already in use. A new offer automatically records
`PRICE_OFFER` as approved and starts at `EXTERNAL_ANALYSIS`. The following
gate requests require, in order, `management:approve`, `sourcing:write`, and
`qa:approve`.

#### 1. Register a retained supplier lead

`POST {{baseUrl}}/sourcings/leads`

Headers:

```text
Authorization: Bearer {{adminJwt}}
Content-Type: application/json
X-Audit-Reason: Onboard local Romanian supplier
```

Body:

   ```json
   {
     "code": "SUP-RO-001",
     "name": "Danubius Honey Apiary Test SRL",
     "country": "RO",
     "regionCity": "Timisoara",
     "contactPerson": "Test Contact",
     "email": "supplier@example.invalid",
     "honeyVarieties": ["Acacia Honey Raw"],
     "certifications": [],
     "leadStatus": "LEAD",
     "reason": "Onboard local Romanian supplier"
   }
   ```

The response's `data._id` is `supplierId`. Leads remain stored when their
offers are rejected or not contracted.

#### 2. Submit the offer and verify normalization

`POST {{baseUrl}}/sourcings`

Headers:

```text
Authorization: Bearer {{adminJwt}}
Content-Type: application/json
X-Audit-Reason: Record local tonnage offer
```

Body:

   ```json
   {
     "supplierId": "{{supplierId}}",
     "materialId": "{{materialId}}",
     "country": "RO",
     "packageType": "DRUM",
     "massInputUnit": "ton",
     "offeredInputWeight": 20.52,
     "offeredDrums": 72,
     "priceBasis": "PER_TON",
     "inputPriceEur": 3850,
     "transportCostEur": 1026,
     "offerRef": "OFFER-DANUBIUS-2026-A",
     "saveAsFutureLead": true,
     "reason": "Record local tonnage offer"
   }
   ```

Expected: `offeredKg: 20520`, `offer.unitWeightKg: 285`,
`offer.unitPriceEurPerKg: 3.85`, `offer.transportEurPerKg: 0.05`, and
`offer.landedUnitPriceEurPerKg: 3.90`. Save response `data._id` as
`sourcingId`; the record starts at `EXTERNAL_ANALYSIS`.

#### 3. Approve Gate 2 as Management

`POST {{baseUrl}}/sourcings/{{sourcingId}}/gates`

Headers:

```text
Authorization: Bearer {{managementJwt}}
Content-Type: application/json
X-Audit-Reason: Management approves external analysis
```

Body:

   ```json
   {
     "gate": "EXTERNAL_ANALYSIS",
     "decision": "APPROVED",
     "externalAnalysis": {
       "labName": "External Lab",
       "reportNo": "LAB-LOCAL-01",
       "reportDate": "2026-11-03T00:00:00.000Z",
       "locationAcceptable": true,
       "priceAcceptable": true,
       "marketDemandFit": "HIGH",
       "transportCostEur": 1026,
       "qualityAcceptable": true,
       "managementNotes": "Approved for local acceptance test"
     },
     "reason": "Management approves external analysis"
   }
   ```

Expected next stage: `SAMPLE`.

#### 4. Approve Gate 3 as a sourcing user

`POST {{baseUrl}}/sourcings/{{sourcingId}}/gates`

Headers:

```text
Authorization: Bearer {{sourcingJwt}}
Content-Type: application/json
X-Audit-Reason: Send sample directly to QSI
```

Body:

```json
{
  "gate": "SAMPLE",
  "decision": "APPROVED",
  "sample": {
    "sampleCode": "SMP-RO-LOCAL-001",
    "routingMode": "SENT_DIRECT_TO_QSI",
    "qsiTrackingRef": "QSI-TRACK-LOCAL-001",
    "receivedAt": "2026-11-03T00:00:00.000Z",
    "weightGrams": 500,
    "notes": "Sample dispatched directly to QSI Bremen"
  },
  "reason": "Send sample directly to QSI"
}
```

`weightGrams` is optional, but when supplied it must be a JSON number
(`500`), not a quoted string (`"500"`) or an empty string (`""`). Omit the
property when the sample weight is unknown.

Expected next stage: `INHOUSE_QSI`.

#### 5. Approve Gate 4 as QA

`POST {{baseUrl}}/sourcings/{{sourcingId}}/gates`

Headers:

```text
Authorization: Bearer {{qaJwt}}
Content-Type: application/json
X-Audit-Reason: QA confirms QSI and sensory match
```

Body:

```json
{
  "gate": "INHOUSE_QSI",
  "decision": "APPROVED",
  "inhouseQsi": {
    "inhouseSensoryPass": true,
    "sensoryNotes": "Sensory comparison passed",
    "qsiReportNo": "QSI-RO-LOCAL-001",
    "qsiReportPublishedAt": "2026-11-03T00:00:00.000Z",
    "qsiPass": true,
    "moisturePct": 16.7,
    "hmfMgKg": 8.5,
    "c4SugarPass": true,
    "nmrPass": true
  },
  "reason": "QA confirms QSI and sensory match"
}
```

Expected status and stage: `PASSED`.

#### 6. Issue a contract from the passed sourcing

`POST {{baseUrl}}/sourcings/{{sourcingId}}/contracts`

Headers:

```text
Authorization: Bearer {{adminJwt}}
Content-Type: application/json
X-Audit-Reason: Issue contract for passed sourcing
```

Body:

```json
{
  "deliveryTerms": "DAP Hennigsdorf",
  "expectedArrivalDate": "2026-11-08T00:00:00.000Z",
  "reason": "Issue contract for passed sourcing"
}
```

The generated contract inherits 20,520 kg, 72 packages, 285 kg/package, and
EUR 3.85/kg. Save response `data._id` as `contractId`.

#### 7. Mark the contract shipped

`POST {{baseUrl}}/sourcings/contracts/{{contractId}}/ship`

Headers:

```text
Authorization: Bearer {{adminJwt}}
Content-Type: application/json
X-Audit-Reason: Mark contract shipped for receipt
```

Body:

```json
{
  "shippingRef": "CMR-RO-DE-2026-001",
  "shippedAt": "2026-11-03T00:00:00.000Z",
  "reason": "Mark contract shipped for receipt"
}
```

Expected status: `SHIPPED`. Optionally confirm it appears in
`GET {{baseUrl}}/sourcings/contracts`.

#### 8. Receive the first partial lot as Warehouse

`POST {{baseUrl}}/stock/lots/receive`

Headers:

```text
Authorization: Bearer {{warehouseJwt}}
Content-Type: application/json
X-Audit-Reason: Receive first partial truck
```

Body (do not include a manual price):

```json
{
  "sourcingId": "{{sourcingId}}",
  "contractId": "{{contractId}}",
  "supplierId": "{{supplierId}}",
  "materialId": "{{materialId}}",
  "country": "RO",
  "unit": "kg",
  "packageType": "DRUM",
  "packageCount": 36,
  "massInputUnit": "kg",
  "totalInputWeight": 10260,
  "tareKgPerPackage": 17.5,
  "supplierLotBarcode": "SUP-LOT-RO-TRUCK1",
  "reason": "Receive first partial truck"
}
```

Expected: 36 drums, 10,260 kg, inherited EUR 3.85/kg, and 36 append-only
receipt movements. The contract balance becomes 10,260 kg and 36 packages.
Before receiving the remaining half, run the overage checks below against this
remaining balance; failed attempts must leave it unchanged. Then repeat this
receipt with a new lot/barcode and reason for 36 drums and 10,260 kg. The
balance should then be exhausted.

#### 9. Verify over-receipt rejection

With 36 packages and 10,260 kg remaining after the first receipt, test a
package-count-only overage by requesting 37 packages while keeping the mass
within the balance:

```json
{
  "contractId": "{{contractId}}",
  "supplierId": "{{supplierId}}",
  "materialId": "{{materialId}}",
  "country": "RO",
  "unit": "kg",
  "packageType": "DRUM",
  "packageCount": 37,
  "massInputUnit": "kg",
  "totalInputWeight": 10260,
  "reason": "Verify package over-receipt rejection"
}
```

Then test a kg-only overage by requesting the remaining 36 packages with one
extra kg:

```json
{
  "contractId": "{{contractId}}",
  "supplierId": "{{supplierId}}",
  "materialId": "{{materialId}}",
  "country": "RO",
  "unit": "kg",
  "packageType": "DRUM",
  "packageCount": 36,
  "massInputUnit": "kg",
  "totalInputWeight": 10261,
  "reason": "Verify weight over-receipt rejection"
}
```

Each request must return HTTP `409` with code `CONTRACT_BALANCE_EXCEEDED`;
neither attempt should create a lot or ledger movement.

For kg receipts, send the package count and the **total** mass, not a rounded
per-package estimate. `massInputUnit` accepts `kg` or `ton`; the API derives
each package's exact recorded kg and the average `unitWeightKg`. For example,
replace the IDs below with actual IDs from your local master-data responses:

```json
{
  "supplierId": "<supplier-id>",
  "materialId": "<active-kg-material-id>",
  "country": "RO",
  "packageType": "DRUM",
  "packageCount": 72,
  "unit": "kg",
  "massInputUnit": "ton",
  "totalInputWeight": 20.5,
  "tareKgPerPackage": 17.5,
  "unitPriceEurPerKg": 3.8,
  "reason": "Postman local receipt test"
}
```

`unitPriceEurPerKg` is optional and may only be supplied by Admin or
Management; the server rejects it for other roles. Omit the field for other
roles. `IBC`, `DRUM`, and `BUCKET_TRAY` use the same total-weight distribution.
L/piece receipts continue to use `quantityPerPackage` and do not accept total
mass. Current sourcing/contract pricing remains kg-based; non-kg sourcing is
not yet supported.

### D. Production, storage, and shipments

The batch router is mounted under both `/batches` and `/production/batches`;
these are aliases for the same handlers.

| Method | Path(s) | Notes |
|---|---|---|
| `GET` | `/batches`, `/production/batches` | `batches:read`. |
| `GET` | `/batches/rework-available`, `/production/batches/rework-available` | `batches:read` or `rework:read`; lists eligible available rework for batch planning. |
| `POST` | `/batches/simulate-feasibility`, `/production/batches/simulate-feasibility` | `batches:read`; request needs valid customer/material IDs and target quantity. Optional `includeReworkIds` selects available rework lots to allocate before warehouse stock; every origin in a selected lot must satisfy the customer's country policy. Read-only simulation. |
| `POST` | `/batches/reserve`, `/production/batches/reserve` | `batches:approve` or `batches:write`; body `reason`; may include the same `includeReworkIds` used in simulation. Consumes the selected rework quantity and reserves allocated drums/packages transactionally. |
| `GET` | `/warm-room` | `warmroom:read`. |
| `POST` | `/warm-room/check-in`, `/warm-room/check-out` | `warmroom:write`; body `reason`; changes inventory state. |
| `GET` | `/production/process` | `processing:read`. |
| `GET` | `/master/infrastructure` | Loads tanks and fill lines used by process entry. |
| `POST` | `/production/process/step` or `/production/process/stage` | `processing:write`; body `reason`; records one mass-balanced process step. `/step` is the current client path; `/stage` remains an alias. |
| `GET` | `/shipments` | `shipments:read`. |
| `GET` | `/master/customers` | Loads active customer country rules for shipment creation. |
| `POST` | `/shipments` | `shipments:write`; validates completed batch output, customer origin policy, package weights, and body `reason`. |
| `POST` | `/shipments/:id/status` | `qa:approve`; `targetStatus` must be `RELEASED`, `QA_HOLD`, `SHIPPED`, or `VOID`; body `reason` required. Actual allowed transitions are enforced by the shipment state machine. |

Process steps must follow the batch sequence and balance to a tolerance of
`0.001 kg`. Set `inKg` to the previous step's `outKg`; set
`inKg = outKg + lossKg + reworkOutKg`. Example first step:

```json
{
  "batchId": "{{reservedBatchId}}",
  "stage": "WARMING",
  "sevenStageTarget": "WARMING_IN",
  "inKg": 9000,
  "outKg": 8950,
  "lossKg": 50,
  "reworkOutKg": 0,
  "tempC": 41.5,
  "personInChargeName": "Operator name",
  "reason": "Record warm-in step"
}
```

Continue the workflow with the next 7-stage target shown by `GET
/production/process`: `WARMING_OUT` (`stage: WARMING`), `FILTERING`
(`stage: FILTERING`), `BLENDING`/`RESTING_TANK` (`stage: BLENDING`), then
`FILLING` and `COMPLETED` (`stage: FILLING`). Include a configured `tankCode`
for `RESTING_TANK` and `fillLineCode` for filling. The server persists process
steps, batch state, and generated rework in the transaction; do not retry an
ambiguous mutation without first checking the process list.

Shipment creation uses `CreateShipmentLotSchema` fields. Replace IDs with
records from this local database:

```json
{
  "batchId": "{{completedBatchId}}",
  "processNo": "{{completedProcessNo}}",
  "customerId": "{{activeCustomerId}}",
  "destinationCountry": "DE",
  "orderedKg": 500,
  "shippedKg": 0,
  "items": [
    {
      "skuCode": "HONEY-500",
      "productName": "Honey 500 g",
      "packagingType": "GLASS_JAR",
      "fillLine": "CARLO_JAR",
      "unitWeightGrams": 500,
      "unitsCount": 1000,
      "netKg": 500,
      "palletsCount": 1
    }
  ],
  "bestBeforeDate": "2028-11-02",
  "carrierName": "Local test carrier",
  "deliveryNoteNo": "TEST-001",
  "reason": "Create local shipment test lot"
}
```

The batch's origins (not the destination country) must all be permitted by
the customer's 1–3 `allowedCountries` and not in `blockedCountries`. After
creation, transition `DRAFT` to `RELEASED` or `QA_HOLD`; release a held lot
before `SHIPPED`. The server records `shippedKg` from packaged item weights
when the lot transitions to `SHIPPED`. Non-Admin/non-Management responses
retain origin country/weight shares but omit source prices and cost shares.

### E. Attachments, costs, traceability, exports, notifications, and audit

| Method | Path | Notes |
|---|---|---|
| `GET` | `/attachments` | `attachments:read`; supports `entityType`, `entityId`, `docType`, and `includeVoid=true` filters. |
| `GET` | `/attachments/integrity-check` | `attachments:read`; diagnostic. |
| `GET` | `/attachments/:id/download` | `attachments:read`; returns file content, not JSON. |
| `POST` | `/attachments/upload` | `attachments:write`; multipart fields from `UploadAttachmentMetaSchema` plus file field `file`. |
| `POST` | `/attachments/:id/void` | `attachments:write`; body `reason`; destructive status change. |
| `GET` | `/costs` | `reports:read`. |
| `POST` | `/costs/generate` | Admin only; body `reason`; generates a report. |
| `GET` | `/trace?code=<record-code>` or `/trace/:code` | `trace:read`; use a real local record code. |
| `GET` | `/exports/logs` | `exports:run`. |
| `POST` | `/exports/run` | `exports:run`; JSON fields can include `dataset`, `format`, and `saveToNextcloud`. This creates an export. |
| `GET` | `/notifications` | Any authenticated user; results depend on role/targeting. |
| `POST` | `/notifications/:id/acknowledge` | Any authenticated user; use an actual notification ID. |
| `GET` | `/audit` | `audit:read`; optional filters: `module`, `entityType`, `entityRef`. |

For cost and trace authorization checks, use records created in a disposable
local workflow:

1. With an Admin or Management session, call `GET /costs`. Confirm the response
   contains `reports` and `prices`. Cost reports include server-computed
   `breakdownLines[]`; inspect `inputKind` values such as `HONEY_DRUM`,
   `REWORK`, and `FLAVOUR`.
2. With an Admin session only, generate a report for a completed local batch
   using `POST /costs/generate`:

   ```json
   {
     "batchId": "<completed-local-batch-id>",
     "sellingPricePerKgEur": 4.45,
     "reason": "Postman local cost test"
   }
   ```

   Expect `201` and a persisted report with breakdown lines. Re-read
   `GET /costs`; do not retry if the first response is ambiguous until you
   inspect whether the report was created.
3. Trace the batch by its real `processNo`, or use a lot, drum, rework, or
   shipment code: `GET /trace/<code>`. Admin and Management should have
   `pricesVisible: true` and authorized price/cost provenance. With a
   non-Admin/non-Management role, verify weight (`kg`, `pct`) remains while
   unit prices and cost values/shares are absent. With an Inspector session,
   also verify supplier/customer names are redacted. Do not share trace
   responses containing business data.
4. To check export logging, first read `GET /exports/logs`, then on disposable
   data call `POST /exports/run`, for example:

   ```json
   {
     "dataset": "BATCHES_PROCESS",
     "format": "CSV",
     "saveToNextcloud": false
   }
   ```

   Re-read the logs and confirm a new export record appears. Export and cost
   generation are mutations; use authorized local accounts and never run them
   against production data.

## 5. Guided acceptance: MongoDB, browser, then Postman

Run this vertical workflow against a local or disposable MongoDB replica set
only. Receiving, QA approval, and reservation create or change durable records;
there is no general rollback endpoint. Do not use a production database or
seed a database that contains data you need.

### A. Confirm the local database and API

From the repository root in PowerShell, start the required Compose services
and inspect their status:

```powershell
docker compose up -d mongodb redis nextcloud_db nextcloud
docker compose ps
```

Start the app in another terminal with `pnpm dev`. Confirm all of the
following before proceeding:

- `http://127.0.0.1:4000/api/v1/health` returns HTTP 200 and
  `dbState: "connected"`.
- `http://127.0.0.1:5173/api/v1/health` also returns a connected database
  through the Vite proxy.
- If using Postman, set `baseUrl` to
  `http://127.0.0.1:4000/api/v1`; use that same host consistently.

The host API must use the local published MongoDB address with replica set
`rs0` (see [Environment setup](./ENVIRONMENT_SETUP.md)). A successful health
check establishes database connectivity; a receipt mutation below exercises
the transaction path. If either check fails, stop and report the sanitized
error before creating data. Do not paste `.env` or connection credentials.

### B. Browser smoke test: receive a small test lot

1. Open `http://127.0.0.1:5173` and sign in with an authorized local account.
2. Open **Incoming QA / intake**. Confirm supplier and material lists load.
3. Use an active kg material, a test supplier, country `RO`, package type
   `DRUM`, count `3`, total net weight `10 kg`, and tare `0` for a simple
   test. Use a unique supplier lot barcode only if needed. Admin/Management
   may optionally enter a source price; leave it blank for the first pass.
4. Click **Receive**, provide the audit reason, and confirm once. Expected:
   visible success, total `10 kg`, average `3.333 kg/package`, and initial
   `RO` origin at 100%. The lot should remain under QA review; the operation
   must not report success if the API fails.
5. Reload or revisit the lot list and verify the record still appears. If it
   does not, save the sanitized response and stop rather than repeatedly
   submitting, which could create duplicates.
6. If testing a non-Admin/Management account, confirm the source-price control
   is absent. Do not assume UI hiding alone proves authorization; test the API
   denial in Postman below.

### C. Postman: verify receipt persistence and role boundary

1. Sign in, then call `GET {{baseUrl}}/auth/me`. Confirm the expected role.
2. Read `GET /master/suppliers`, `GET /master/materials?activeOnly=true`,
   `GET /stock/lots`, and `GET /stock/ledger`. Use IDs returned by these
   requests; do not fabricate them.
3. For an exact distribution test in a disposable database, receive 72 kg
   drums with a total of `20.5` tonnes. Expected response fields include
   `totalNetKg: 20500`, `packageCount: 72`, and lot `unitWeightKg: 284.722`.
   The first 71 package weights should be 284.722 kg and the final one
   284.738 kg so the package sum stays exactly 20,500 kg. This creates 72
   records; prefer the three-package browser test first.
4. Verify the new lot and stock through `GET /stock/lots`, then query
   `GET /stock/drums?incomingLotId=<lot-id>` or
   `GET /stock/packages?incomingLotId=<lot-id>` and
   `GET /stock/ledger?incomingLotId=<lot-id>`. Confirm package count, summed
   net kg, country, quarantine status, and receive movement records.
5. To verify the permission boundary, sign in as a local Warehouse test user
   and submit a receipt body that includes `unitPriceEurPerKg`. Expected:
   HTTP 403 and no lot/package/ledger records created. Then retry with that
   field omitted; only do so if you intend to create another test receipt.
   Never perform this mutation against valuable inventory data.

### D. Continue the traceability path in Postman

On a test lot, approve it with a QA-authorized session:

```json
{
  "decision": "PASSED",
  "labReport": {
    "reportNo": "LOCAL-TEST-001"
  },
  "reason": "Approve local receipt test"
}
```

Use `POST {{baseUrl}}/stock/lots/<lot-id>/review`, then re-read the lot,
its package/drum records, and the ledger. Verify the approved/available
statuses and QA movement. A passed lot is saved as `PASSED`; its stock
packages are saved as `Approved` in the `Warehouse` location and remain
available there. QA release does not create a batch automatically. Next, open
Batch Planning and run feasibility for the intended customer, eligible kg
HONEY material, and target quantity. If feasible, review the allocation and
confirm the audited reservation to create the batch. Use only a test lot; QA
approval changes inventory eligibility, while reservation consumes/reserves
stock for production.

Next, call `GET /master/customers`, `GET /master/materials?activeOnly=true&kind=HONEY`,
and `GET /batches/rework-available`. Rework may correctly be empty. Choose a
customer whose allowed-country policy permits the test stock, then run
`POST /batches/simulate-feasibility` with a target no larger than available
compatible stock:

```json
{
  "customerId": "<customer-id>",
  "materialId": "<active-kg-honey-material-id>",
  "targetKg": 10,
  "includeReworkIds": []
}
```

Expected: server-calculated `canFulfill`, allocation, origin weight shares,
and message. If prices are visible to the current role, also inspect cost
shares; non-Admin/Management responses must not contain price/cost fields.
If simulation cannot fulfill the target, do not reserve; check stock status,
material, customer country rules, and the returned shortfall first.

`POST /batches/reserve` is a durable mutation: it creates a batch and reserves
stock (and consumes selected rework). Run it only on disposable test data and
only after reviewing a successful simulation. Its request uses the same
`customerId`, `materialId`, `plannedKg`, and `includeReworkIds` values plus a
body `reason`. Re-read `/batches`, `/stock/drums`, `/stock/packages`, and
`/stock/ledger` afterward to verify the batch and reservation movements.

## 6. Check role permissions

After confirming the Admin flow, sign in with a separate local account for each
role you want to test. For a route the role should not access, verify that the
API returns `403` and does not change data. For an allowed route, verify its
normal result. Do not use the Admin account to conclude that role restrictions
work. Create accounts only in a disposable database; new users may be forced
to change their password at first login.

## 7. Keep a test log and ask for help

Track each request as **Not started**, **Passed**, **Failed**, or **Blocked**.
Copy this entry for a result you want help with:

```text
Step / route:
Role (Admin or other role; no name/email):
Method and path (omit host if desired):
Expected status/result:
Actual status:
Response code/message/body (redact personal or business data):
Record created? (yes/no/unknown):
```

Also tell me which numbered section you reached. Never include passwords,
cookies, bearer tokens, `.env` contents, or unredacted production data. Send
one failure at a time and I can diagnose it, suggest the next safe check, and
keep the checklist moving with you.
