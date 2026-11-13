[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$BackupDirectory,
    [ValidatePattern('^supra-wms(-verify[a-z0-9-]*)?$')][string]$ProjectName = 'supra-wms',
    [switch]$Rehearsal
)
. "$PSScriptRoot\Wms.Common.ps1"
$script:WmsProjectName = $ProjectName
if ($Rehearsal -and $ProjectName -notlike 'supra-wms-verify*') {
    throw '-Rehearsal is only allowed in a separate supra-wms-verify* project.'
}
$backup = (Resolve-Path -LiteralPath $BackupDirectory).Path
$manifest = Get-Content -LiteralPath (Join-Path $backup 'manifest.json') -Raw | ConvertFrom-Json
if ($manifest.format -ne 1) { throw 'Unsupported backup format.' }
if (-not $manifest.writers_stopped -and -not $Rehearsal) {
    throw 'Use a final backup taken with -WritersStopped after stopping all legacy writers.'
}
foreach ($entry in $manifest.sha256.PSObject.Properties) {
    $file = [System.IO.Path]::GetFullPath((Join-Path $backup $entry.Name))
    if (-not $file.StartsWith($backup.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Invalid backup manifest path.'
    }
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $entry.Value) {
        throw "Backup checksum mismatch: $($entry.Name)"
    }
}
$running = @(Invoke-WmsCompose -Arguments @('ps', '--status', 'running', '--services') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if (@($running | Where-Object { $_ -notin @('db', 'redis') }).Count) {
    throw 'Stop this project application containers before restoring; only db and redis may be running.'
}
Invoke-WmsCompose -Arguments @('up', '-d', '--wait', '--wait-timeout', '180', 'db', 'redis')
$composeBase = @('compose', '--project-name', $ProjectName, '--project-directory', $script:WmsRoot,
    '--env-file', $script:WmsEnvFile, '--file', (Join-Path $script:WmsRoot 'docker-compose.yml'))
$checkScript = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'restore_state.py') -Raw
$checkScript | & docker @composeBase run --rm --no-deps -T --entrypoint python backend - check-empty
if ($LASTEXITCODE -ne 0) { throw 'Target is not empty. Nothing was restored.' }

$remoteDump = '/tmp/wms-restore-' + [guid]::NewGuid().ToString('N') + '.dump'
$identity = Get-WmsDatabaseIdentity
try {
    Invoke-WmsCompose -Arguments @('cp', (Join-Path $backup 'postgres.dump'), "db:$remoteDump")
    Invoke-WmsCompose -Arguments @('exec', '-T', 'db', 'pg_restore', '--exit-on-error', '--single-transaction', '--no-owner', '--no-privileges', '-U', $identity.POSTGRES_USER, '-d', $identity.POSTGRES_DB, $remoteDump)
    $checkScript | & docker @composeBase run --rm --no-deps -T --volume "${backup}:/restore:ro" --entrypoint python backend - restore-state
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL restored, but state/file validation failed. Do not start the application.' }
} finally {
    Invoke-WmsCompose -Arguments @('exec', '-T', 'db', 'rm', '-f', $remoteDump)
}
Write-Host 'Restore and validation completed. Application and workers have not been started.'
