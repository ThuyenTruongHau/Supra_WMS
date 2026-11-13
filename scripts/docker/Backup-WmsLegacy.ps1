[CmdletBinding()]
param(
    [string]$OutputDirectory,
    [string]$PgBin = 'C:\Program Files\PostgreSQL\18\bin',
    [switch]$WritersStopped
)
. "$PSScriptRoot\Wms.Common.ps1"
if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path $script:WmsRoot ('backups\legacy-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
}
if (-not (Test-Path -LiteralPath (Join-Path $PgBin 'pg_dump.exe'))) { throw 'PostgreSQL 18 pg_dump.exe not found.' }
$backupArgs = @((Join-Path $PSScriptRoot 'backup_legacy.py'), '--output', $OutputDirectory, '--pg-bin', $PgBin)
if ($WritersStopped) { $backupArgs += '--writers-stopped' }
& (Get-WmsPython) @backupArgs
if ($LASTEXITCODE -ne 0) { throw 'Backup failed. Do not restore an incomplete backup.' }
