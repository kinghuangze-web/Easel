$ErrorActionPreference = 'Stop'
$Profile = 'easel'
$Root = Split-Path -Parent $PSScriptRoot
$LogFile = Join-Path $env:TEMP 'easel-gateway.log'
$ErrorLogFile = Join-Path $env:TEMP 'easel-gateway.error.log'
$ConfigDir = Join-Path $HOME ".openclaw-$Profile"
$Port = 18789

$ToolsNode = Join-Path $Root 'tools\node'
$ToolsNpm = Join-Path $Root 'tools\npm-global'
$ToolsFfmpeg = Join-Path $Root 'tools\ffmpeg\bin'
if (Test-Path $ToolsNode) { $env:Path = "$ToolsNode;$ToolsNpm;$ToolsFfmpeg;$env:Path" }

function Test-Gateway {
    try { Invoke-WebRequest "http://127.0.0.1:$Port/healthz" -UseBasicParsing -TimeoutSec 2 | Out-Null; return $true }
    catch { return $false }
}

function Get-GatewayProcess {
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
        Where-Object { $_.CommandLine -match "openclaw.*--profile\s+$Profile.*gateway" } |
        Select-Object -First 1
}

function Stop-Gateway {
    $process = Get-GatewayProcess
    if ($process) { Stop-Process -Id $process.ProcessId -Force; Write-Host '[easel] Gateway stopped' }
    else { Write-Host '[easel] Gateway was not running' }
}

switch ($args[0]) {
    'start' {
        if (Test-Gateway) { Write-Host '[easel] Gateway already running'; break }
        New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
        Write-Host "[easel] Starting Easel gateway (profile: $Profile)..."
        $nodeExe = if (Test-Path (Join-Path $ToolsNode 'node.exe')) { Join-Path $ToolsNode 'node.exe' } else { 'node' }
        $ocMjs = Join-Path $ToolsNpm 'node_modules\openclaw\openclaw.mjs'
        if (Test-Path $ocMjs) {
            Start-Process $nodeExe -ArgumentList @($ocMjs, '--profile', $Profile, 'gateway', 'run', '--force', '--allow-unconfigured', '--bind', 'loopback') `
                -WorkingDirectory $Root -RedirectStandardOutput $LogFile -RedirectStandardError $ErrorLogFile -WindowStyle Hidden | Out-Null
        } else {
            $pathPrefix = if (Test-Path $ToolsNode) { "`$env:Path = '$ToolsNode;$ToolsNpm;$ToolsFfmpeg;' + `$env:Path; " } else { "" }
            $command = "$pathPrefix openclaw --profile $Profile gateway run --force --allow-unconfigured --bind loopback"
            Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-Command', $command `
                -WorkingDirectory $Root -RedirectStandardOutput $LogFile -RedirectStandardError $ErrorLogFile -WindowStyle Hidden | Out-Null
        }
        $ready = $false
        Write-Host -NoNewline "[easel] 等待网关服务就绪"
        1..45 | ForEach-Object {
            if (-not $ready) {
                if (Test-Gateway) {
                    $ready = $true
                    Write-Host " [OK]" -ForegroundColor Green
                } else {
                    Write-Host -NoNewline "."
                    Start-Sleep -Seconds 1
                }
            }
        }
        if ($ready) { Write-Host '[easel] Gateway started' }
        else { Write-Host "`n[easel] 网关就绪检测超时，但进程可能仍在后台启动中；请检查 $LogFile" -ForegroundColor Yellow }
    }
    'stop' { Stop-Gateway }
    'restart' { Stop-Gateway; Start-Sleep -Seconds 2; & $PSCommandPath start }
    'status' {
        if (Test-Gateway) { Write-Host "[easel] Gateway running (profile: $Profile)" }
        else { Write-Host '[easel] Gateway not running' }
    }
    'logs' { Get-Content $LogFile -Wait }
    default { Write-Host 'Usage: gateway.ps1 {start|stop|restart|status|logs}'; exit 1 }
}
