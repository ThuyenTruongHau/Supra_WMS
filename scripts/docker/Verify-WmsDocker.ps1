[CmdletBinding()]
param([Parameter(Mandatory)][string]$BackupDirectory)
. "$PSScriptRoot\Wms.Common.ps1"
$script:WmsProjectName = 'supra-wms-verify-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
Write-Host "Isolated rehearsal project: $script:WmsProjectName"
$composeBase = @('compose', '--project-name', $script:WmsProjectName, '--project-directory', $script:WmsRoot,
    '--env-file', $script:WmsEnvFile, '--file', (Join-Path $script:WmsRoot 'docker-compose.yml'))
$oldValues = @{}
foreach ($key in @('BACKEND_PORT', 'FRONTEND_PORT', 'BACKEND_BIND_IP', 'FRONTEND_BIND_IP', 'POSTGRES_ADMIN_PORT', 'WMS_LOG_DIR')) {
    $oldValues[$key] = [Environment]::GetEnvironmentVariable($key)
}
try {
    $env:BACKEND_PORT = '18001'
    $env:FRONTEND_PORT = '15173'
    $env:BACKEND_BIND_IP = '127.0.0.1'
    $env:FRONTEND_BIND_IP = '127.0.0.1'
    $env:POSTGRES_ADMIN_PORT = '0'
    $env:WMS_LOG_DIR = Join-Path $script:WmsRoot ".docker\$script:WmsProjectName\logs"
    & "$PSScriptRoot\Restore-WmsDocker.ps1" -BackupDirectory $BackupDirectory -ProjectName $script:WmsProjectName -Rehearsal
    Invoke-WmsCompose -Arguments @('up', '-d', '--no-build', '--wait', '--wait-timeout', '180', 'backend', 'frontend')
    $checks = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'verify_container.py') -Raw
    $checks | & docker @composeBase exec -T backend python -
    if ($LASTEXITCODE -ne 0) { throw 'Rehearsal integration checks failed.' }
    # Docker Engine restart is not performed while the legacy system is running.
    # Recreate the four rehearsal services to exercise DNS changes and persistence.
    Invoke-WmsCompose -Arguments @('stop', 'frontend', 'backend', 'db', 'redis')
    Invoke-WmsCompose -Arguments @('up', '-d', '--no-build', '--force-recreate', '--wait', '--wait-timeout', '180', 'db', 'redis', 'backend', 'frontend')
    $checks | & docker @composeBase exec -T backend python -
    if ($LASTEXITCODE -ne 0) { throw 'Checks after container recreation failed.' }
    Write-Host 'Rehearsal passed. No new Celery worker/scheduler was started.'
} finally {
    # Remove only rehearsal containers/network, retaining backup and test volumes.
    & docker @composeBase down --timeout 30
    foreach ($key in $oldValues.Keys) {
        [Environment]::SetEnvironmentVariable($key, $oldValues[$key], 'Process')
    }
}
