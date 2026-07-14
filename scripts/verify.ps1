$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js was not found. Install Node.js 20.19+, 22.12+, or 24.x, then run this script again."
}

$nodeVersion = [Version]((node -v).TrimStart('v'))
$minimumVersions = @{
    20 = [Version]"20.19.0"
    22 = [Version]"22.12.0"
    24 = [Version]"24.0.0"
}
$minimumVersion = $minimumVersions[$nodeVersion.Major]

if ($null -eq $minimumVersion -or $nodeVersion -lt $minimumVersion) {
    throw "Unsupported Node.js version $($nodeVersion.ToString()). Use Node.js 20.19+, 22.12+, or 24.x."
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
