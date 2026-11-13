[CmdletBinding()]
param()
. "$PSScriptRoot\Wms.Common.ps1"

Invoke-WmsCompose -Arguments @('up', '-d', '--wait', '--wait-timeout', '180', 'db', 'redis')
$identity = Get-WmsDatabaseIdentity
$tableCount = Invoke-WmsCompose -Arguments @('exec', '-T', 'db', 'psql', '-U', $identity.POSTGRES_USER, '-d', $identity.POSTGRES_DB, '-Atc', "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
if ([int]($tableCount | Select-Object -Last 1) -eq 0) {
    throw 'Docker database is empty. Restore the final legacy backup before starting the application.'
}
Invoke-WmsCompose -Arguments @('up', '-d', '--no-build', '--wait', '--wait-timeout', '180')
Write-Host 'WMS is running. Use https://<SITE_HOST>:<FRONTEND_PORT> from the LAN.'
