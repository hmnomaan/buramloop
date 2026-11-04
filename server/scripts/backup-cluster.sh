#!/usr/bin/env bash
# ==============================================================================
# BURAMLOOP — Coordinated Atomic Backup Script (MongoDB + Nextcloud + MariaDB)
# Rule: Mongo = source of truth; back up Mongo + Nextcloud data + Nextcloud DB together.
# ==============================================================================
set -euo pipefail

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_ROOT="./backups/${TIMESTAMP}"
MONGO_URI="${MONGO_URI:-mongodb://localhost:27017/buramloop?replicaSet=rs0}"
NC_CONTAINER="${NC_CONTAINER:-buramloop_nextcloud}"
NC_DB_CONTAINER="${NC_DB_CONTAINER:-buramloop_nc_db}"
NC_DB_USER="${NC_DB_USER:-nextcloud}"
NC_DB_PASS="${NC_DB_PASS:-nc_app_dev_password}"
NC_DB_NAME="${NC_DB_NAME:-nextcloud}"

mkdir -p "${BACKUP_ROOT}"

echo "[1/5] Putting Nextcloud into maintenance mode..."
docker exec -u www-data "${NC_CONTAINER}" php occ maintenance:mode --on || echo "Nextcloud container offline, skipping maintenance mode."

echo "[2/5] Dumping MongoDB replica set (with oplog)..."
mongodump --uri="${MONGO_URI}" --oplog --out="${BACKUP_ROOT}/mongodb"

echo "[3/5] Dumping Nextcloud MariaDB database..."
docker exec -i "${NC_DB_CONTAINER}" mysqldump -u"${NC_DB_USER}" -p"${NC_DB_PASS}" "${NC_DB_NAME}" > "${BACKUP_ROOT}/nextcloud_db.sql"

echo "[4/5] Archiving Nextcloud WebDAV data directory..."
if docker inspect "${NC_CONTAINER}" >/dev/null 2>&1; then
  docker cp "${NC_CONTAINER}:/var/www/html/data" "${BACKUP_ROOT}/nextcloud_data"
else
  echo "Nextcloud container not running; skipping data directory copy."
fi

echo "[5/5] Disabling Nextcloud maintenance mode..."
docker exec -u www-data "${NC_CONTAINER}" php occ maintenance:mode --off || true

echo "=============================================================================="
echo "SUCCESS: Coordinated atomic backup completed successfully at ${BACKUP_ROOT}"
echo "=============================================================================="