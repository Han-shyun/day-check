param(
  [switch]$Production
)

$rootPath = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $rootPath

$processes = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object {
    $_.CommandLine -and
    $_.CommandLine -like "*server.js*" -and
    $_.CommandLine -like "*$rootPath*"
  }

if ($processes) {
  $processes | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

Start-Sleep -Milliseconds 300

$args = @('run', 'server:start')
if (-not $Production) {
  $args = @('run', 'server:dev')
}

Start-Process -FilePath 'npm' -ArgumentList $args -WindowStyle Hidden | Out-Null

if ($Production) {
  Write-Host '[server:restart] production mode restarted'
} else {
  Write-Host '[server:restart] dev mode restarted (node --watch server.js)'
}
