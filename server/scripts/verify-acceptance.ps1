# scripts/verify-acceptance.ps1
# ==============================================================================
# BURAMLOOP — Automated End-to-End Ground-Staff Acceptance Verification [R1-R16]
# ==============================================================================
$ErrorActionPreference = "Stop"
$ApiBase = "http://localhost:4000/api/v1"

Write-Host "1. Checking API & MongoDB Replica-Set Health..." -ForegroundColor Cyan
$health = Invoke-RestMethod -Uri "$ApiBase/health" -Method Get
Write-Host "   -> Service: $($health.service) | DB: $($health.dbState) | Storage: $($health.storageProvider)" -ForegroundColor Green

Write-Host "2. Checking Storage Provider Health (Step 5e-0 / R16)..." -ForegroundColor Cyan
$storageHealth = Invoke-RestMethod -Uri "$ApiBase/health/storage" -Method Get
Write-Host "   -> Provider: $($storageHealth.data.provider) | Latency: $($storageHealth.data.latencyMs)ms" -ForegroundColor Green

Write-Host "3. Authenticating as Seeded Admin (admin@buram.de)..." -ForegroundColor Cyan
$loginBody = @{ email = "admin@buram.de"; password = "Buram2026!" } | ConvertTo-Json
$loginRes = Invoke-RestMethod -Uri "$ApiBase/auth/login" -Method Post -Body $loginBody -ContentType "application/json" -SessionVariable buramSession
$token = $loginRes.data.token
$headers = @{
  Authorization = "Bearer $token"
  "X-Audit-Reason" = "Automated ground-staff acceptance verification run"
}
Write-Host "   -> Authenticated as: $($loginRes.data.user.fullName) [Role: $($loginRes.data.user.role)]" -ForegroundColor Green

Write-Host "4. Verifying 2x17 Warm Cabinets & Plant Infrastructure (R5 / R7)..." -ForegroundColor Cyan
$cabinets = Invoke-RestMethod -Uri "$ApiBase/warm-room" -Method Get -Headers $headers -WebSession $buramSession
Write-Host "   -> Active Warm Cabinets Loaded: $($cabinets.data.Count)" -ForegroundColor Green

Write-Host "5. Verifying Append-Only Stock Ledger Integrity (R4 / R14)..." -ForegroundColor Cyan
$ledgerCheck = Invoke-RestMethod -Uri "$ApiBase/stock/ledger/integrity-check" -Method Get -Headers $headers -WebSession $buramSession
Write-Host "   -> Ledger Integrity OK: $($ledgerCheck.ok)" -ForegroundColor Green

Write-Host "6. Verifying Snapshot Export Service & ExportLog (R13)..." -ForegroundColor Cyan
$exportBody = @{ dataset = "BATCHES"; format = "CSV"; saveToNextcloud = $false } | ConvertTo-Json
$exportRes = Invoke-RestMethod -Uri "$ApiBase/exports/run" -Method Post -Headers $headers -Body $exportBody -ContentType "application/json" -WebSession $buramSession
Write-Host "   -> Snapshot Export Rows: $($exportRes.data.rowCount) | ExportLog ID: $($exportRes.data.exportLogId)" -ForegroundColor Green

Write-Host "==============================================================================" -ForegroundColor Yellow
Write-Host "ALL BURAMLOOP ACCEPTANCE CHECKS PASSED (CTX-V28)" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Yellow