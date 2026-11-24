param(
    [string]$CloudHost = "root@43.139.111.113",
    [string]$HealthUrl = "https://icebear-yearning.fun/portal-api/health"
)

$ErrorActionPreference = "Stop"

Write-Host "=== [1-2/4] Building Portal frontend & packing clean release bundle in WSL2 ===" -ForegroundColor Cyan
$bundle = "D:\OpenClaw\portal-release.tar.gz"
wsl -d OpenClaw -- bash /mnt/d/OpenClaw/portal/scripts/build_portal_bundle.sh
if ($LASTEXITCODE -ne 0) { throw "Frontend build or bundle packing failed." }

Write-Host "=== [3/4] Uploading bundle to $CloudHost (with auto-retry) ===" -ForegroundColor Cyan
$uploaded = $false
for ($i = 1; $i -le 5; $i++) {
    $bytes = [System.IO.File]::ReadAllBytes($bundle)
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "ssh.exe"
    $psi.Arguments = "-o BatchMode=yes -o ServerAliveInterval=15 $CloudHost `"cat > /tmp/portal-release.tar.gz`""
    $psi.UseShellExecute = $false
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardError = $true
    $proc = [System.Diagnostics.Process]::Start($psi)
    $proc.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
    $proc.StandardInput.BaseStream.Flush()
    $proc.StandardInput.Close()
    $err = $proc.StandardError.ReadToEnd()
    $proc.WaitForExit()
    if ($proc.ExitCode -eq 0) {
        $uploaded = $true
        break
    }
    Write-Host "SSH upload attempt $i failed ($err), retrying..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
}
Remove-Item $bundle -Force -ErrorAction SilentlyContinue
if (-not $uploaded) { throw "Failed to upload portal-release.tar.gz to cloud server." }

Write-Host "=== [4/4] Deploying Portal on cloud server (zero data touch) ===" -ForegroundColor Cyan
$remoteScript = @'
set -euo pipefail
rm -rf /opt/couple-space/portal
mkdir -p /opt/couple-space/portal
tar -xzf /tmp/portal-release.tar.gz -C /opt/couple-space/portal
rm -f /tmp/portal-release.tar.gz
chown -R donut:donut /opt/couple-space/portal

su - donut -c '/opt/couple-space/portal-venv/bin/pip install --quiet -i https://pypi.tuna.tsinghua.edu.cn/simple -r /opt/couple-space/portal/backend/requirements.txt'
systemctl restart couple-portal.service
sleep 2
systemctl is-active couple-portal.service
curl -sS http://127.0.0.1:8081/portal-api/health
echo ""
'@ -replace "`r", ""
$remoteB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($remoteScript))

$deployed = $false
for ($i = 1; $i -le 6; $i++) {
    ssh -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 $CloudHost "echo $remoteB64 | base64 -d | bash"
    if ($LASTEXITCODE -eq 0) {
        $deployed = $true
        break
    }
    Write-Host "Remote deploy attempt $i failed, retrying..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
}
if (-not $deployed) { throw "Remote deploy failed." }

Write-Host "=== Verifying public HTTPS endpoint ===" -ForegroundColor Green
$prevPref = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$pubOut = & curl.exe -sS --max-time 8 $HealthUrl 2>&1
$pubCode = $LASTEXITCODE
$ErrorActionPreference = $prevPref
if ($pubCode -eq 0) {
    Write-Host $pubOut -ForegroundColor Green
} else {
    Write-Host "[WARN] Local public HTTPS check did not complete ($pubOut) - cloud service itself is active & healthy." -ForegroundColor Yellow
}
Write-Host "[OK] Portal published successfully to $CloudHost !" -ForegroundColor Green
