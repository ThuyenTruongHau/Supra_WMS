[CmdletBinding()]
param(
    [ValidatePattern('^[a-zA-Z0-9.-]+$')][string]$SiteHost = '192.168.50.200',
    [switch]$Build
)
. "$PSScriptRoot\Wms.Common.ps1"

if (-not (Test-Path -LiteralPath (Join-Path $script:WmsRoot 'backend\.env'))) {
    throw 'backend\.env must exist; it supplies the JWT key, ICS URL and warehouse settings.'
}
if (-not (Test-Path -LiteralPath $script:WmsEnvFile)) {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $password = ([System.BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
    $settings = @(
        'POSTGRES_USER=wms', "POSTGRES_PASSWORD=$password", 'POSTGRES_DB=masan_wms', 'POSTGRES_ADMIN_PORT=15432',
        "SITE_HOST=$SiteHost", 'FRONTEND_PORT=5173', 'BACKEND_PORT=8001',
        'ORCHESTRATOR_HOST=host.docker.internal', 'ORCHESTRATOR_PORT=6868'
    )
    [System.IO.File]::WriteAllLines($script:WmsEnvFile, $settings, (New-Object System.Text.UTF8Encoding $false))
    Write-Host 'Created .env.docker with a random database password.'
} else {
    Write-Host 'Keeping existing .env.docker.'
}

Invoke-WmsCompose -Arguments @('config', '--quiet')
if ($Build) { Invoke-WmsCompose -Arguments @('build', 'backend', 'frontend') }
Write-Host 'Prepared. No application containers were started. See DOCS/docker-windows.md for migration.'
