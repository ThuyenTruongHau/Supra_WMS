Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:WmsRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$script:WmsEnvFile = Join-Path $script:WmsRoot '.env.docker'
$script:WmsProjectName = 'supra-wms'

function Invoke-WmsCompose {
    param([Parameter(Mandatory)][string[]]$Arguments)
    if (-not (Test-Path -LiteralPath $script:WmsEnvFile)) {
        throw 'Run .\scripts\docker\Prepare-WmsDocker.ps1 first.'
    }
    & docker compose --project-name $script:WmsProjectName --project-directory $script:WmsRoot --env-file $script:WmsEnvFile --file (Join-Path $script:WmsRoot 'docker-compose.yml') @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose failed (exit $LASTEXITCODE)." }
}

function Get-WmsPython {
    $python = Join-Path $script:WmsRoot 'backend\.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $python)) {
        throw 'The legacy backup requires backend\.venv\Scripts\python.exe and backend dependencies.'
    }
    return $python
}

function Get-WmsDatabaseIdentity {
    $values = @{}
    foreach ($line in (Get-Content -LiteralPath $script:WmsEnvFile)) {
        if ($line -match '^\s*(POSTGRES_USER|POSTGRES_DB)\s*=\s*([a-zA-Z0-9_-]+)\s*$') {
            $values[$matches[1]] = $matches[2]
        }
    }
    foreach ($key in @('POSTGRES_USER', 'POSTGRES_DB')) {
        $override = [Environment]::GetEnvironmentVariable($key)
        if ($override) { $values[$key] = $override }
    }
    if (-not $values.ContainsKey('POSTGRES_USER')) { $values['POSTGRES_USER'] = 'wms' }
    if (-not $values.ContainsKey('POSTGRES_DB')) { $values['POSTGRES_DB'] = 'masan_wms' }
    return $values
}
