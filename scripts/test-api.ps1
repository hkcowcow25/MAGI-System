<#
.SYNOPSIS
  Example PowerShell calls against MAGI OpenAI-compatible API.

.PARAMETER BaseUrl
  e.g. http://127.0.0.1:3000 or http://192.168.1.10:3000

.PARAMETER ApiKey
  Must match server MAGI_API_KEY
#>
param(
  [string]$BaseUrl = "http://127.0.0.1:3000",
  [Parameter(Mandatory = $true)]
  [string]$ApiKey,
  [string]$Question = "Should we approve the weekly maintenance window?"
)

$ErrorActionPreference = "Stop"
$headers = @{ Authorization = "Bearer $ApiKey" }

Write-Host "== GET /healthz ==" -ForegroundColor Cyan
Invoke-RestMethod -Uri "$BaseUrl/healthz" -Method Get | ConvertTo-Json

Write-Host "== GET /v1/models ==" -ForegroundColor Cyan
Invoke-RestMethod -Uri "$BaseUrl/v1/models" -Headers $headers | ConvertTo-Json -Depth 5

Write-Host "== POST /v1/chat/completions (stream=false) ==" -ForegroundColor Cyan
$body = @{
  model    = "magi-verdict"
  stream   = $false
  messages = @(@{ role = "user"; content = $Question })
} | ConvertTo-Json -Depth 5

$resp = Invoke-RestMethod -Uri "$BaseUrl/v1/chat/completions" `
  -Method Post `
  -Headers ($headers + @{ "Content-Type" = "application/json" }) `
  -Body $body

$resp | ConvertTo-Json -Depth 8
Write-Host "`nAssistant content:`n$($resp.choices[0].message.content)" -ForegroundColor Green

Write-Host "`n== Expect 400 for stream=true ==" -ForegroundColor Cyan
try {
  $bad = @{ model = "magi-verdict"; stream = $true; messages = @(@{ role = "user"; content = "x" }) } | ConvertTo-Json -Depth 5
  Invoke-RestMethod -Uri "$BaseUrl/v1/chat/completions" -Method Post `
    -Headers ($headers + @{ "Content-Type" = "application/json" }) -Body $bad
} catch {
  Write-Host "Got error as expected: $($_.Exception.Message)" -ForegroundColor Yellow
}
