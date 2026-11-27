param(
    [string]$CloudHost = "root@43.139.111.113",
    [string]$OutDir = "D:\OpenClaw\backups",
    [switch]$Refresh
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

if ($Refresh) {
    Write-Host "=== [1/3] Triggering fresh core snapshot on $CloudHost ===" -ForegroundColor Cyan
    ssh -o BatchMode=yes -o ConnectTimeout=10 $CloudHost "/usr/local/bin/backup-couple-space.sh"
    if ($LASTEXITCODE -ne 0) { throw "Remote backup script failed." }
}

Write-Host "=== Locating latest core snapshot on $CloudHost ===" -ForegroundColor Cyan
$latestPath = (ssh -o BatchMode=yes -o ConnectTimeout=10 $CloudHost "ls -t /var/backups/couple-space/core-*.tar.gz 2>/dev/null | head -n 1").Trim()
if (-not $latestPath) {
    throw "No core-*.tar.gz archive found in /var/backups/couple-space/. Run with -Refresh first."
}
$fileName = Split-Path -Leaf $latestPath
$destPath = Join-Path $OutDir $fileName

Write-Host "=== Downloading $fileName -> $destPath ===" -ForegroundColor Cyan
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "ssh.exe"
$psi.Arguments = "-o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 $CloudHost `"cat '$latestPath'`""
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$proc = [System.Diagnostics.Process]::Start($psi)

$fs = [System.IO.File]::Create($destPath)
try {
    $proc.StandardOutput.BaseStream.CopyTo($fs)
} finally {
    $fs.Close()
}
$err = $proc.StandardError.ReadToEnd()
$proc.WaitForExit()
if ($proc.ExitCode -ne 0) {
    Remove-Item $destPath -Force -ErrorAction SilentlyContinue
    throw "SSH download failed: $err"
}

$item = Get-Item $destPath
if ($item.Length -lt 1024) {
    Remove-Item $destPath -Force -ErrorAction SilentlyContinue
    throw "Downloaded archive looks too small ($($item.Length) bytes)."
}

# Keep latest 14 local off-site core snapshots
Get-ChildItem -Path $OutDir -Filter "core-*.tar.gz" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 14 |
    Remove-Item -Force -ErrorAction SilentlyContinue

$sizeKb = [Math]::Round($item.Length / 1KB, 1)
Write-Host "[OK] Saved off-site core backup: $destPath ($sizeKb KB)" -ForegroundColor Green
