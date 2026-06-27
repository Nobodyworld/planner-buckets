$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js was not found. Install Node.js 20 or newer, then run this script again."
}

$nodeVersion = [Version]((node -v).TrimStart('v'))
if ($nodeVersion.Major -lt 20 -or $nodeVersion.Major -ge 25) {
    throw "Unsupported Node.js version $($nodeVersion.ToString()). Use Node.js 20, 22, or 24."
}

if (
    -not (Test-Path "node_modules") -or
    -not (Test-Path "node_modules/.bin/vitest.cmd") -or
    -not (Test-Path "node_modules/.bin/vite.cmd")
) {
    Write-Host "Installing dependencies..."
    npm install
}

npm test
npm run build
Write-Host "Verification complete."
