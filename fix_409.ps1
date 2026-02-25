# ============================================================
# fix_409.ps1 - Telegram Bot 409 強制修復腳本
# 使用方式: pwsh -File fix_409.ps1
# 警告: 此腳本會停止所有 minioc 相關進程並重啟
# ============================================================

$ErrorActionPreference = "Continue"
$ProjectRoot = $PSScriptRoot

function Write-Header($text) {
    Write-Host ""
    Write-Host "══════════════════════════════════════" -ForegroundColor Magenta
    Write-Host "  $text" -ForegroundColor Magenta
    Write-Host "══════════════════════════════════════" -ForegroundColor Magenta
}

function Write-Pass($text) { Write-Host "  ✅ $text" -ForegroundColor Green }
function Write-Fail($text) { Write-Host "  ❌ $text" -ForegroundColor Red }
function Write-Warn($text) { Write-Host "  ⚠️  $text" -ForegroundColor Yellow }
function Write-Info($text) { Write-Host "  ℹ️  $text" -ForegroundColor Gray }
function Write-Step($n, $text) { Write-Host "  [$n] $text" -ForegroundColor Cyan }

# ── 讀取 Token ───────────────────────────────────────────────
$EnvFile = Join-Path $ProjectRoot ".env"
$TOKEN = Get-Content $EnvFile |
    Where-Object { $_ -match "^TELEGRAM_BOT_TOKEN=" } |
    ForEach-Object { $_.Split("=", 2)[1].Trim().Trim('"').Trim("'") } |
    Select-Object -First 1

if (-not $TOKEN -or $TOKEN -eq "your_telegram_bot_token_here") {
    Write-Fail "TELEGRAM_BOT_TOKEN 未設定，請先設定 .env"
    exit 1
}

Write-Header "Step 1: 停止所有本地 Node 進程"

Write-Step "1-A" "尋找 Node 進程..."
$nodeProcs = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcs) {
    $nodeProcs | ForEach-Object {
        Write-Warn "停止 Node 進程 PID: $($_.Id)"
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Pass "所有本地 Node 進程已停止"
} else {
    Write-Info "無本地 Node 進程"
}

Write-Header "Step 2: 停止 Docker 容器"

Write-Step "2-A" "停止 minioc 容器..."
try {
    $stopResult = docker-compose -f (Join-Path $ProjectRoot "docker-compose.yml") down 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Pass "Docker 容器已停止"
    } else {
        Write-Warn "docker-compose down 輸出: $stopResult"
        # 嘗試直接 stop
        docker stop minioc 2>&1 | Out-Null
        Write-Info "嘗試直接 docker stop minioc"
    }
} catch {
    Write-Warn "Docker 操作失敗（可能未安裝）: $_"
}

Write-Header "Step 3: 清除殘留 Lock 檔案"

$LockFile = Join-Path $ProjectRoot "data\bot.lock"
Write-Step "3-A" "檢查 Lock 檔案: $LockFile"
if (Test-Path $LockFile) {
    Remove-Item $LockFile -Force
    Write-Pass "Lock 檔案已刪除"
} else {
    Write-Info "無殘留 Lock 檔案"
}

Write-Header "Step 4: 清除 Telegram Webhook"

Write-Step "4-A" "呼叫 deleteWebhook (drop_pending_updates=true)..."
try {
    $delResponse = Invoke-WebRequest `
        -Uri "https://api.telegram.org/bot$TOKEN/deleteWebhook?drop_pending_updates=true" `
        -Method GET `
        -TimeoutSec 15 `
        -UseBasicParsing
    $delBody = $delResponse.Content | ConvertFrom-Json
    if ($delBody.ok) {
        Write-Pass "Webhook 已清除，待處理 Updates 已丟棄"
    } else {
        Write-Warn "deleteWebhook 回應: $($delBody | ConvertTo-Json -Compress)"
    }
} catch {
    Write-Fail "deleteWebhook 失敗: $($_.Exception.Message)"
}

Write-Header "Step 5: 等待 Telegram 服務端釋放連線"

$WAIT_SECONDS = 35
Write-Step "5-A" "等待 ${WAIT_SECONDS} 秒（超過 Long Polling 30 秒 timeout）..."

for ($i = 1; $i -le $WAIT_SECONDS; $i++) {
    Write-Progress -Activity "等待 Telegram 釋放連線" -Status "$i / $WAIT_SECONDS 秒" -PercentComplete (($i / $WAIT_SECONDS) * 100)
    Start-Sleep -Seconds 1
}
Write-Progress -Activity "等待完成" -Completed
Write-Pass "等待完成"

Write-Header "Step 6: 驗證 409 是否已解除"

Write-Step "6-A" "呼叫 getUpdates 確認狀態..."
$conflictResolved = $false
try {
    $response = Invoke-WebRequest `
        -Uri "https://api.telegram.org/bot$TOKEN/getUpdates?timeout=1" `
        -Method GET `
        -TimeoutSec 10 `
        -UseBasicParsing
    $body = $response.Content | ConvertFrom-Json
    if ($body.ok -eq $true) {
        Write-Pass "409 已解除！getUpdates 回應正常"
        $conflictResolved = $true
        
        # 清除待處理訊息
        if ($body.result -and $body.result.Count -gt 0) {
            $lastId = $body.result[-1].update_id
            Write-Step "6-B" "清除 $($body.result.Count) 個待處理 Updates (offset=$($lastId+1))..."
            Invoke-WebRequest `
                -Uri "https://api.telegram.org/bot$TOKEN/getUpdates?offset=$($lastId+1)&limit=1&timeout=1" `
                -Method GET -TimeoutSec 10 -UseBasicParsing | Out-Null
            Write-Pass "待處理 Updates 已清除"
        }
    }
} catch {
    $errBody = $null
    if ($_.Exception.Response) {
        try {
            $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
            $errBody = $reader.ReadToEnd() | ConvertFrom-Json
        } catch {}
    }
    if ($errBody -and $errBody.error_code -eq 409) {
        Write-Fail "409 仍然存在！Telegram 服務端尚未釋放"
        Write-Warn "建議等待 30 分鐘或使用 @BotFather 重新產生 Token"
    } else {
        Write-Fail "請求失敗: $($_.Exception.Message)"
    }
}

Write-Header "Step 7: 重啟指引"

if ($conflictResolved) {
    Write-Pass "修復成功！現在可以安全重啟 Bot"
    Write-Host ""
    Write-Host "  重啟方式（二選一）：" -ForegroundColor Cyan
    Write-Host "  [Docker]  cd '$ProjectRoot'; docker-compose up -d" -ForegroundColor White
    Write-Host "  [本地]    cd '$ProjectRoot'; npm run dev" -ForegroundColor White
} else {
    Write-Fail "409 尚未解除，請稍後再試"
    Write-Host ""
    Write-Host "  可能的解決方案：" -ForegroundColor Yellow
    Write-Host "  1. 等待 30 分鐘讓 Telegram 自動釋放" -ForegroundColor White
    Write-Host "  2. 使用 @BotFather 指令 /revoke 重新產生 Token" -ForegroundColor White
    Write-Host "  3. 確認是否有其他設備/伺服器也在使用此 Token" -ForegroundColor White
}

Write-Host ""
Write-Host "══════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  修復腳本執行完畢" -ForegroundColor Magenta
Write-Host "══════════════════════════════════════" -ForegroundColor Magenta
