# Starts the local server (hidden) if needed and opens the app in its own window.
# The server stops by itself shortly after the window is closed.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$url = "http://127.0.0.1:5179"

function Test-Server {
    try { Invoke-WebRequest "$url/api/health" -UseBasicParsing -TimeoutSec 1 | Out-Null; return $true } catch { return $false }
}

if (-not (Test-Server)) {
    if (-not (Test-Path node_modules)) {
        Write-Host "Installing dependencies (first run only)..."
        npm install
    }
    $built = Get-Item dist/index.html -ErrorAction SilentlyContinue
    $newest = Get-ChildItem src, shared, index.html -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $built -or $newest.LastWriteTime -gt $built.LastWriteTime) {
        Write-Host "Building the app..."
        npm run build
    }
    Start-Process node -ArgumentList "server/index.ts" -WindowStyle Hidden
    for ($i = 0; $i -lt 50 -and -not (Test-Server); $i++) { Start-Sleep -Milliseconds 200 }
    if (-not (Test-Server)) { throw "The app server did not start. Try running 'npm start' in this folder to see the error." }
}

$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
    Where-Object { Test-Path $_ } | Select-Object -First 1
if ($edge) {
    Start-Process $edge "--app=$url --window-size=1400,1000"
} else {
    Start-Process $url
}
