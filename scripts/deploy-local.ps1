param(
  [string]$ServerHost = $env:SERVER_HOST,
  [string]$User = $env:SERVER_USER,
  [string]$AppPath = $env:SERVER_APP_PATH,
  [string]$Port = '',
  [string]$KeyPath = '',
  [string]$KeySecret = '',
  [string]$KeySecretB64 = ''
)

$ErrorActionPreference = 'Stop'

function Get-EnvValue {
  param([string[]]$Names)
  foreach ($name in $Names) {
    $value = [Environment]::GetEnvironmentVariable($name, [EnvironmentVariableTarget]::Process)
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return $value
    }
  }
  return $null
}

function Resolve-FilePathValue {
  param($Value)
  if ($null -eq $Value) {
    return $null
  }
  if ($Value -is [string]) {
    return $Value
  }
  if ($Value -is [System.IO.FileInfo] -or $Value -is [System.IO.DirectoryInfo]) {
    return $Value.FullName
  }
  if ($Value -is [System.Management.Automation.PathInfo]) {
    return $Value.ProviderPath
  }
  if ($Value.PSObject.Properties['FullName']) {
    return $Value.FullName
  }
  if ($Value.PSObject.Properties['Path']) {
    return $Value.Path
  }
  return [string]$Value
}

if ([string]::IsNullOrWhiteSpace($ServerHost)) {
  $ServerHost = '168.107.48.248'
}
if ([string]::IsNullOrWhiteSpace($User)) {
  $User = 'ubuntu'
}
if ([string]::IsNullOrWhiteSpace($AppPath)) {
  $AppPath = '/home/ubuntu/day-check'
}
if ([string]::IsNullOrWhiteSpace($Port)) {
  if ([string]::IsNullOrWhiteSpace($env:SERVER_SSH_PORT)) {
    $Port = '22'
  } else {
    $Port = $env:SERVER_SSH_PORT
  }
}

$resolvedKeyPath = $null
if (-not [string]::IsNullOrWhiteSpace($KeyPath) -and (Test-Path -Path $KeyPath)) {
  $resolvedKeyPath = Resolve-Path -Path $KeyPath
} else {
  $keyCandidatePaths = @('.oracle_deploy_key', '.ssh/oracle_deploy_key')
  foreach ($candidate in $keyCandidatePaths) {
    if (Test-Path -Path $candidate) {
      $resolvedKeyPath = Resolve-Path -Path $candidate
      break
    }
  }
}
$needsCleanupKey = $false
if (-not $resolvedKeyPath) {
  if ([string]::IsNullOrWhiteSpace($KeySecret)) {
    $KeySecret = Get-EnvValue @(
      'SERVER_SSH_PRIVATE_KEY',
      'SSH_KEY',
      'SSH-KEY'
    )
  }

  if ([string]::IsNullOrWhiteSpace($KeySecretB64)) {
    $KeySecretB64 = Get-EnvValue @(
      'SERVER_SSH_PRIVATE_KEY_B64',
      'SSH_KEY2',
      'SSH-KEY2'
    )
  }

  if (-not [string]::IsNullOrWhiteSpace($KeySecret)) {
    $tmpKey = Join-Path $env:TEMP ('deploy-key-' + [guid]::NewGuid().ToString() + '.pem')
    try {
      $normalizedKey = $KeySecret -replace "`r", '' -replace '\\r\\n', "`r`n" -replace '\\n', "`n"
      [System.IO.File]::WriteAllText($tmpKey, $normalizedKey, (New-Object System.Text.UTF8Encoding($false)))
      $resolvedKeyPath = Get-Item $tmpKey
      $needsCleanupKey = $true
    } catch {
      throw "SERVER_SSH_PRIVATE_KEY is invalid: $($_.Exception.Message)"
    }
  } elseif (-not [string]::IsNullOrWhiteSpace($KeySecretB64)) {
    $tmpKey = Join-Path $env:TEMP ('deploy-key-' + [guid]::NewGuid().ToString() + '.pem')
    try {
      [System.IO.File]::WriteAllBytes($tmpKey, [Convert]::FromBase64String($KeySecretB64))
      $resolvedKeyPath = Get-Item $tmpKey
      $needsCleanupKey = $true
    } catch {
      throw "SERVER_SSH_PRIVATE_KEY_B64 is not valid base64: $($_.Exception.Message)"
    }
  }
}
if (-not $resolvedKeyPath) {
  throw 'SSH private key is required. Set .oracle_deploy_key, SERVER_SSH_PRIVATE_KEY, SSH_KEY, SSH-KEY, SERVER_SSH_PRIVATE_KEY_B64, SSH_KEY2, or SSH-KEY2.'
}

$resolvedKeyPath = Resolve-FilePathValue $resolvedKeyPath
if (-not (Test-Path -Path $resolvedKeyPath)) {
  throw "SSH key file not found: $resolvedKeyPath"
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$deployVersionFile = Join-Path $repoRoot '.deploy-version'
$originalDeployVersion = $null
if (Test-Path -Path $deployVersionFile) {
  $originalDeployVersion = Get-Content -Path $deployVersionFile -Raw
}
$deployVersion = 'manual'
try {
  $gitHead = & git -C $repoRoot rev-parse HEAD
  if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($gitHead)) {
    $deployVersion = $gitHead.Trim()
  }
} catch {}
[System.IO.File]::WriteAllText($deployVersionFile, $deployVersion, (New-Object System.Text.UTF8Encoding($false)))
Set-Location $repoRoot

$tarPath = Join-Path $env:TEMP ('day-check-deploy-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.tgz')
$remoteTmp = '/tmp/day-check-deploy.tgz'
$remoteTmpDir = '/tmp/day-check-deploy'

$tmpRemoteScript = Join-Path $env:TEMP ('day-check-remote-deploy-' + [guid]::NewGuid().ToString() + '.sh')

try {
  Write-Host "[deploy-local] Creating tarball ..."
  & tar -czf $tarPath `
    --exclude='.git' `
    --exclude='node_modules' `
    --exclude='dist' `
    --exclude='.env' `
    --exclude='server.log' `
    --exclude='security-events.log' `
    .

  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to create deployment archive.'
  }

  Write-Host "[deploy-local] Uploading to ${ServerHost}:${remoteTmp}"
  & scp -i $resolvedKeyPath -P $Port -o StrictHostKeyChecking=accept-new $tarPath "${User}@${ServerHost}:${remoteTmp}"
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to upload deployment archive.'
  }

  Write-Host '[deploy-local] Applying on server ...'
  $remoteScriptTemplate = @'
set -euo pipefail

app_path="{APP_PATH}"
remote_tmp="{REMOTE_TMP}"
remote_tmp_dir="{REMOTE_TMP_DIR}"
pid_file="${app_path}/server.pid"

mkdir -p "$remote_tmp_dir"
tar -xzf "$remote_tmp" -C "$remote_tmp_dir"
mkdir -p "$app_path"

if [ -f "$pid_file" ]; then
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" || true
    sleep 1
  fi
  rm -f "$pid_file"
fi
pkill -f "node server.js" || true

db_path_raw=""
if [ -f "${app_path}/.env" ]; then
  db_path_raw="$(grep -E '^[[:space:]]*DATABASE_PATH=' "${app_path}/.env" | tail -n1 | cut -d= -f2- || true)"
fi
db_path_raw="$(printf '%s' "$db_path_raw" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
if [ -z "$db_path_raw" ]; then
  db_path_raw="daycheck.sqlite"
fi
if [[ "$db_path_raw" = /* ]]; then
  db_abs="$db_path_raw"
else
  db_abs="${app_path}/$db_path_raw"
fi

backup_dir="${app_path}/.deploy-backups"
mkdir -p "$backup_dir"
if [ -f "$db_abs" ]; then
  ts="$(date +%Y%m%d-%H%M%S)"
  cp -a "$db_abs" "${backup_dir}/state-${ts}.sqlite"
  [ -f "${db_abs}-wal" ] && cp -a "${db_abs}-wal" "${backup_dir}/state-${ts}.sqlite-wal" || true
  [ -f "${db_abs}-shm" ] && cp -a "${db_abs}-shm" "${backup_dir}/state-${ts}.sqlite-shm" || true
  ls -1t "${backup_dir}"/state-*.sqlite 2>/dev/null | awk 'NR>10 {print}' | xargs -r rm -f
  ls -1t "${backup_dir}"/state-*.sqlite-wal 2>/dev/null | awk 'NR>10 {print}' | xargs -r rm -f
  ls -1t "${backup_dir}"/state-*.sqlite-shm 2>/dev/null | awk 'NR>10 {print}' | xargs -r rm -f
fi

declare -a keep_names=(
  ".env"
  ".git"
  "node_modules"
  "server.log"
  "security-events.log"
  ".cache"
  ".deploy-backups"
)

if [[ "$db_abs" == "$app_path/"* ]]; then
  db_rel="${db_abs#"$app_path/"}"
  db_root="${db_rel%%/*}"
  if [ "$db_root" = "$db_rel" ]; then
    keep_names+=("$db_root" "${db_root}-wal" "${db_root}-shm")
  elif [ -n "$db_root" ]; then
    keep_names+=("$db_root")
  fi
fi

shopt -s nullglob dotglob
for entry in "$app_path"/* "$app_path"/.*; do
  base="$(basename "$entry")"
  if [ "$base" = "." ] || [ "$base" = ".." ]; then
    continue
  fi

  if [[ "$base" == *.sqlite || "$base" == *.sqlite-wal || "$base" == *.sqlite-shm ]]; then
    continue
  fi

  keep=false
  for name in "${keep_names[@]}"; do
    if [ "$base" = "$name" ]; then
      keep=true
      break
    fi
  done
  if [ "$keep" = false ]; then
    rm -rf "$entry"
  fi
done
shopt -u nullglob dotglob

shopt -s dotglob
cp -R "${remote_tmp_dir}"/. "${app_path}"/
shopt -u dotglob
rm -rf "$remote_tmp_dir" "$remote_tmp"
bash "${app_path}/scripts/deploy-server.sh"

if [ -f "${app_path}/.deploy-version" ]; then
  echo [deploy-local] remote .deploy-version=$(cat "${app_path}/.deploy-version")
fi
if [ -d "${app_path}/.git" ]; then
  (cd "${app_path}" && echo [deploy-local] remote git HEAD=$(git rev-parse HEAD))
fi
'@
  $remoteScript = $remoteScriptTemplate.Replace('{REMOTE_TMP_DIR}', $remoteTmpDir).Replace('{REMOTE_TMP}', $remoteTmp).Replace('{APP_PATH}', $AppPath)
  [System.IO.File]::WriteAllText($tmpRemoteScript, $remoteScript, (New-Object System.Text.UTF8Encoding($false)))

  & scp -i $resolvedKeyPath -P $Port -o StrictHostKeyChecking=accept-new $tmpRemoteScript "${User}@${ServerHost}:/tmp/day-check-deploy.sh"
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to upload remote helper script.'
  }

  & ssh -i $resolvedKeyPath -p $Port -o StrictHostKeyChecking=accept-new ${User}@${ServerHost} 'bash /tmp/day-check-deploy.sh && rm -f /tmp/day-check-deploy.sh'
  if ($LASTEXITCODE -ne 0) {
    throw 'Remote apply failed.'
  }

  Write-Host '[deploy-local] Deployment completed.'
} finally {
  if (Test-Path -Path $tarPath) {
    Remove-Item -Force $tarPath -ErrorAction SilentlyContinue
  }
  if (Test-Path -Path $tmpRemoteScript) {
    Remove-Item -Force $tmpRemoteScript -ErrorAction SilentlyContinue
  }
  if ($needsCleanupKey -and (Test-Path -Path $resolvedKeyPath)) {
    Remove-Item -Force $resolvedKeyPath -ErrorAction SilentlyContinue
  }
  if (Test-Path -Path $deployVersionFile) {
    if ($null -ne $originalDeployVersion) {
      Set-Content -Path $deployVersionFile -Value $originalDeployVersion -Encoding UTF8 -NoNewline
    } else {
      Remove-Item -Force $deployVersionFile -ErrorAction SilentlyContinue
    }
  }
}
