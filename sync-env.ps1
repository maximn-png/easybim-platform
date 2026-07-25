<#
.SYNOPSIS
  Push each app's .env.local from this repo up to the shared Google Drive.

.DESCRIPTION
  Copies local  apps/<name>/.env.local  ->  Drive/<name>/.env.local

  Run this after rotating a key or adding an env var, so the Drive copy
  stays the current source of truth.

  Developers do NOT pull with a script. To set up a machine, each dev
  manually copies only the app folders they need from the Drive into
  their local apps/<name>/.env.local  (deliberate, so they know they are
  handling live secrets and only take what they need).

.EXAMPLE
  .\sync-env.ps1            # push local -> drive
  .\sync-env.ps1 -WhatIf    # preview without copying
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param()

$ErrorActionPreference = 'Stop'

$RepoRoot = $PSScriptRoot
$AppsDir  = Join-Path $RepoRoot 'apps'
$Dest     = 'G:\Shared drives\R&D\Claude env.local files'

if (-not (Test-Path 'G:\Shared drives\R&D')) {
    Write-Error "Shared drive not accessible: G:\Shared drives\R&D. Is Google Drive mounted?"
    exit 1
}
New-Item -ItemType Directory -Force -Path $Dest | Out-Null

Write-Host "Mode: PUSH (local -> drive)" -ForegroundColor Cyan
Write-Host "Drive: $Dest`n"

# Discover apps that have a local .env.local
$apps = Get-ChildItem -Path $AppsDir -Directory -ErrorAction SilentlyContinue |
        Where-Object { Test-Path (Join-Path $_.FullName '.env.local') } |
        Select-Object -ExpandProperty Name

if (-not $apps) {
    Write-Warning "No local .env.local files found under $AppsDir."
    exit 0
}

$count = 0
foreach ($app in $apps) {
    $from     = Join-Path $AppsDir "$app\.env.local"
    $driveDir = Join-Path $Dest $app
    $to       = Join-Path $driveDir '.env.local'

    New-Item -ItemType Directory -Force -Path $driveDir | Out-Null

    if ($PSCmdlet.ShouldProcess($to, "Copy from $from")) {
        Copy-Item -Path $from -Destination $to -Force
        $srcLen = (Get-Item $from).Length
        $dstLen = (Get-Item $to).Length
        $ok = if ($srcLen -eq $dstLen) { 'OK' } else { 'SIZE MISMATCH' }
        Write-Host ("  {0,-12} {1,6} bytes  {2}" -f $app, $dstLen, $ok) -ForegroundColor Green
        $count++
    }
}

Write-Host "`nPushed $count file(s) to Drive." -ForegroundColor Cyan
