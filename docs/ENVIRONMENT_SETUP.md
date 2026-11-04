# Server setup and startup troubleshooting

For the ongoing issue history, daily work log, and project roadmap, see the
[project tracker](./PROJECT_TRACKER.md).

## Startup validation error

The server requires `MONGO_URI` and `JWT_SECRET`. Previously, `dotenv.config()`
searched only the process working directory for `.env`. When pnpm runs the
server's `dev` script, that directory is `server/`, while this repository's
`.env` is in the workspace root. As a result, both values were missing when
the server validated its environment.

The server now loads `.env` from its working directory and its parent
directory, so the existing root-level `.env` works with
`pnpm --filter @buramloop/server dev`.

## Required configuration

Create a local `.env` in the workspace root with values for at least:

```dotenv
MONGO_URI=mongodb://127.0.0.1:27017/buramloop?replicaSet=rs0&directConnection=true
JWT_SECRET=replace-with-a-random-secret-at-least-16-characters-long
```

`MONGO_URI` must point to a MongoDB replica set named `rs0`, because the
application uses transactions. Start that replica set before starting the API.
For a server process running on the host machine, `directConnection=true`
keeps the driver connected to the published `127.0.0.1` address instead of
trying to resolve the replica-set member name used inside Docker. The
containerized API uses the Compose service address `mongodb:27017` instead.
`JWT_SECRET` must contain at least 16 characters. Keep real credentials in the
ignored `.env` file; do not commit them.

## Command reference (PowerShell)

Run workspace commands from the repository root. Start the supporting
containers, then run the API and client locally:

```powershell
pnpm install
docker compose up -d mongodb redis nextcloud_db nextcloud
pnpm dev
```

The client is served at `http://127.0.0.1:5173` and proxies `/api/v1` calls to
the API on port `4000`. The commands below are the common day-to-day
operations; all `pnpm --filter` commands can be run from the workspace root.

### Start and stop

```powershell
# Start only local dependencies for development
docker compose up -d mongodb redis nextcloud_db nextcloud

# The root shortcut starts every service in docker-compose.yml; use only when
# you intend to run the full container stack rather than local pnpm dev
pnpm docker:up

# Check container status
docker compose ps

# Follow MongoDB logs when diagnosing database startup
docker compose logs -f mongodb

# Start client and API together (keep this terminal open)
pnpm dev

# Or start only one application in its own terminal
pnpm --filter @buramloop/server dev
pnpm --filter @buramloop/client dev
```

Stop local development processes with **Ctrl+C** in the terminal running them:

- For `pnpm dev`, Ctrl+C stops the client and API together.
- If started in separate terminals, Ctrl+C in the client terminal stops Vite;
  Ctrl+C in the server terminal stops the API. You can stop either one without
  stopping the other.

If a terminal was closed and a process is still listening, inspect the process
IDs using the known development ports before stopping only those processes:

```powershell
# Show the process IDs listening on the client/API ports
Get-NetTCPConnection -LocalPort 5173,4000 -State Listen |
  Select-Object LocalAddress, LocalPort, OwningProcess

# After confirming a PID above belongs to this project, stop that exact PID
Stop-Process -Id <PID>
```

Stopping the local pnpm processes does not stop Docker dependencies. To stop
the Compose services too (MongoDB, Redis, Nextcloud, and others), run:

```powershell
# Stops all Compose services; named data volumes are preserved
docker compose down

# Equivalent workspace shortcut
pnpm docker:down
```

### Build, typecheck, and test

```powershell
# Typecheck every workspace package
pnpm typecheck

# Build all packages
pnpm -r build

# Build an individual package
pnpm --filter @buramloop/shared build
pnpm --filter @buramloop/server build
pnpm --filter @buramloop/client build

# Watch shared package compilation during shared-package development
pnpm --filter @buramloop/shared dev

# Typecheck or test the server/client individually
pnpm --filter @buramloop/server typecheck
pnpm --filter @buramloop/server test
pnpm --filter @buramloop/client typecheck
```

### Preview and health checks

Run the client preview after building, in a separate terminal:

```powershell
pnpm --filter @buramloop/client preview
```

Default development URLs:

- Client: `http://127.0.0.1:5173`
- API health: `http://127.0.0.1:4000/api/v1/health`
- Storage health: `http://127.0.0.1:4000/api/v1/health/storage`

The API health endpoint also reports database connectivity. There is no
separate `/api/v1/health/db` route.

Check the API and dev proxy from PowerShell with curl:

```powershell
curl.exe -i http://127.0.0.1:4000/api/v1/health
curl.exe -i http://127.0.0.1:5173/api/v1/health
```

### Build and run the complete Docker stack

The local-development commands above run the API/client on the host. To build
and run all Compose services as containers instead:

```powershell
docker compose up -d --build
docker compose ps
docker compose logs -f server client
```

In the full Docker stack, the client is at `http://localhost:3000` and the API
is at `http://localhost:4000`. Stop the stack with `docker compose down`; named
database/storage volumes remain unless explicitly removed.

If a Docker build says it cannot find `zod` while compiling
`@buramloop/shared`, verify the root `.dockerignore` excludes host
`node_modules`. The image must install workspace dependencies from the
lockfile; Windows pnpm junctions from the host must not be copied into Linux
build stages. The client and server Dockerfiles install their workspace
dependency closure with `--frozen-lockfile`, and package build errors should
remain visible rather than being ignored.

The MongoDB replica set must advertise a hostname reachable from other
containers. The Compose healthcheck configures its single member as
`mongodb:27017`; do not initialize it as `127.0.0.1:27017`, since that address
would point back to the API container when the API discovers the replica-set
primary.

When running a command such as `pnpm seed` on Windows rather than inside
Compose, `mongodb` is not a DNS name available to the host. The Compose
MongoDB service publishes port `27017` to the host, so use a host connection
URI for that command. Set it only for the current PowerShell session to avoid
changing the Compose-only URI in `.env`:

```powershell
docker compose up -d mongodb
$env:MONGO_URI = 'mongodb://127.0.0.1:27017/buramloop?replicaSet=rs0&directConnection=true'
pnpm seed
Remove-Item Env:MONGO_URI
```

If `pnpm seed` fails, inspect the reported error before retrying; do not assume
the seed completed. The temporary environment override takes precedence over
the `.env` value. The containerized API continues to use
`mongodb://mongodb:27017/buramloop?replicaSet=rs0`.

### Optional data seeding

Only seed a development database when you intend to add or reset project
sample data; inspect `server/src/seeds/seed.ts` first. Seeding changes database
contents. On a database without `admin@buram.de`, set `SEED_ADMIN_PASSWORD`
in the ignored root `.env` to an initial password of at least 8 characters
before running the seed. The seed does not log or reset an existing admin
password; change existing account credentials through the normal account
administration process.

```powershell
pnpm seed
```

If startup still reports `ENV_INVALID`, check that the keys are spelled exactly
as shown, have non-empty values, and are in either the workspace-root `.env` or
`server/.env`.

## Shared package export error

If startup fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` for `@buramloop/shared`,
the server is resolving the package through CommonJS, but the shared package
only declared an ESM export. The shared package now exposes its compiled entry
to both import styles. Its `dist` output is generated before the server's dev
watch process starts.

Run the API with:

```powershell
pnpm --filter @buramloop/server dev
```

The shared package must compile successfully. If the build reports TypeScript
errors, resolve those first; the API cannot load the shared package until its
compiled entry exists.

## Workspace typecheck failure

The captured `pnpm typecheck` output reported 57 TypeScript errors across
`server/src/models/index.ts`, `server/src/models/outbound.model.ts`,
`server/src/models/production.model.ts`, and the attachment, master, sourcing,
and stock modules. The main cause is that these server model files are empty:

- `server/src/models/master.model.ts`
- `server/src/models/access.model.ts`
- `server/src/models/auditLog.model.ts`
- `server/src/models/counter.model.ts`
- `server/src/models/purchase.model.ts`
- `server/src/models/attachment.model.ts`
- `server/src/models/exportLog.model.ts`
- `server/src/models/stock.model.ts`

Consequently, model imports used by the services were missing, with additional
type errors from mismatched audit/error helper calls and sourcing gate
constants. These were source-code gaps; reinstalling dependencies would not
fix them. The missing model implementations, including the access models that
were not caught by the compiler due to an unsafe fallback, and helper contracts
have been implemented. The sourcing gate schema has been aligned with and
added to API request validation. The workspace `pnpm typecheck` now passes.

The API bootstrap also previously connected to MongoDB twice and started
listening before initializing storage folders. It now connects once, prepares
storage, and only then starts listening.
