$nodeDir = "$env:LOCALAPPDATA\Programs\NodeJS"
if ($env:Path -notlike "*$nodeDir*") {
    $env:Path = "$nodeDir;$env:Path"
}
Write-Host "Starting SafetyIntel Operations Dashboard..." -ForegroundColor Green
npm run dev
