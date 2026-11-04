#!/usr/bin/env bash
# ==============================================================================
# BURAMLOOP — Step 7 Nextcloud Hardening & Folder Governance Script [R12, R16]
# Ensures Nextcloud acts strictly as an API-governed object vault for MERN.
# ==============================================================================
set -euo pipefail

NC_CONTAINER="${NC_CONTAINER:-buramloop_nextcloud}"
NC_SERVICE_USER="${NC_SERVICE_USER:-buram_service}"

echo "[1/4] Configuring Nextcloud trusted domains and Redis file locking..."
docker exec -u www-data "${NC_CONTAINER}" php occ config:system:set trusted_domains 0 --value="localhost"
docker exec -u www-data "${NC_CONTAINER}" php occ config:system:set trusted_domains 1 --value="127.0.0.1"
docker exec -u www-data "${NC_CONTAINER}" php occ config:system:set trusted_domains 2 --value="nextcloud"
docker exec -u www-data "${NC_CONTAINER}" php occ config:system:set filelocking.enabled --value="true" --type=boolean

echo "[2/4] Enforcing immutable version retention for Government Inspection [R11, R16]..."
docker exec -u www-data "${NC_CONTAINER}" php occ config:app:set files_versions Sj_ retention_obligation --value="auto, 1825"

echo "[3/4] Disabling public link sharing (API is the sole authenticated access path)..."
docker exec -u www-data "${NC_CONTAINER}" php occ config:app:set core shareapi_allow_links --value="no"

echo "[4/4] Running Nextcloud WebDAV file index scan for ${NC_SERVICE_USER}..."
docker exec -u www-data "${NC_CONTAINER}" php occ files:scan "${NC_SERVICE_USER}"

echo "SUCCESS: Nextcloud hardened for BURAMLOOP production use."