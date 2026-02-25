# ============================================================
# verify_409_docker.ps1 - 從 Docker 容器內部執行驗證
# 使用方式: pwsh -File verify_409_docker.ps1
# 前提: minioc 容器必須已在運行中
# ============================================================

$ErrorActionPreference = "Continue"
$ProjectRoot = $PSScriptRoot
$CONTAINER = "minioc"

function Write-Header($text) {
    Write-Host ""
    Write-Host "══════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host "══════════════════════════════════════" -ForegroundColor Cyan
}

function Write-Pass($text) { Write-Host "  ✅ $text" -ForegroundColor Green }
function Write-Fail($text) { Write-Host "  ❌ $text" -ForegroundColor Red }
function Write-Warn($text) { Write-Host "  ⚠️  $text" -ForegroundColor Yellow }
function Write-Info($text) { Write-Host "  ℹ️  $text" -ForegroundColor Gray }

# ── 確認容器存在 ─────────────────────────────────────────────
$running = docker ps --format "{{.Names}}" 2>&1 | Where-Object { $_ -eq $CONTAINER }
if (-not $running) {
    Write-Fail "容器 '$CONTAINER' 未運行，請先執行: docker-compose up -d"
    exit 1
}
Write-Pass "容器 '$CONTAINER' 正在運行"

# ── 讀取 Token（從 .env）──────────────────────────────────────
$EnvFile = Join-Path $ProjectRoot ".env"
$TOKEN = Get-Content $EnvFile |
    Where-Object { $_ -match "^TELEGRAM_BOT_TOKEN=" } |
    ForEach-Object { $_.Split("=", 2)[1].Trim().Trim('"').Trim("'") } |
    Select-Object -First 1

# ════════════════════════════════════════════════════════════
# Docker-1: 容器網路連線測試（ping 8.8.8.8）
# ════════════════════════════════════════════════════════════
Write-Header "Docker-1: 容器外部網路連線"

Write-Info "從容器內 ping 8.8.8.8 (3 次)..."
$pingResult = docker exec $CONTAINER ping -c 3 8.8.8.8 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Pass "容器可連通外部網路"
} else {
    Write-Fail "容器無法連通外部網路！"
    Write-Info $pingResult
}

# ════════════════════════════════════════════════════════════
# Docker-2: DNS 解析測試
# ════════════════════════════════════════════════════════════
Write-Header "Docker-2: 容器 DNS 解析"

Write-Info "從容器內解析 api.telegram.org..."
$dnsResult = docker exec $CONTAINER nslookup api.telegram.org 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Pass "DNS 解析成功"
    $dnsResult | Where-Object { $_ -match "Address" } | ForEach-Object { Write-Info $_ }
} else {
    Write-Fail "DNS 解析失敗！"
    Write-Info $dnsResult
}

# ════════════════════════════════════════════════════════════
# Docker-3: HTTPS 連線測試（非 Telegram）
# ════════════════════════════════════════════════════════════
Write-Header "Docker-3: 容器 HTTPS 基本連線"

Write-Info "從容器內測試 https://www.google.com..."
$httpsResult = docker exec $CONTAINER curl -s -o /dev/null -w "%{http_code}" --max-time 10 https://www.google.com 2>&1
if ($httpsResult -match "^2") {
    Write-Pass "HTTPS 連線正常（HTTP $httpsResult）"
} else {
    Write-Warn "HTTPS 回應碼: $httpsResult"
}

# ════════════════════════════════════════════════════════════
# Docker-4: Telegram API getMe（從容器內）
# ════════════════════════════════════════════════════════════
Write-Header "Docker-4: 容器內 Telegram getMe 驗證"

Write-Info "從容器內呼叫 getMe..."
$getMeRaw = docker exec $CONTAINER curl -s --max-time 15 "https://api.telegram.org/bot${TOKEN}/getMe" 2>&1
try {
    $getMe = $getMeRaw | ConvertFrom-Json
    if ($getMe.ok) {
        Write-Pass "getMe 成功！Bot: @$($getMe.result.username) ($($getMe.result.first_name))"
    } else {
        Write-Fail "getMe 回應異常: $getMeRaw"
    }
} catch {
    Write-Fail "getMe 回應解析失敗: $getMeRaw"
}

# ════════════════════════════════════════════════════════════
# Docker-5: Telegram getWebhookInfo（從容器內）
# ════════════════════════════════════════════════════════════
Write-Header "Docker-5: 容器內 Webhook 狀態"

Write-Info "從容器內呼叫 getWebhookInfo..."
$whRaw = docker exec $CONTAINER curl -s --max-time 15 "https://api.telegram.org/bot${TOKEN}/getWebhookInfo" 2>&1
try {
    $wh = $whRaw | ConvertFrom-Json
    if ($wh.ok) {
        $url = $wh.result.url
        if ([string]::IsNullOrEmpty($url)) {
            Write-Pass "無 Webhook 設定（純 Polling 模式）"
        } else {
            Write-Warn "發現 Webhook URL: $url → 可能造成 409！"
        }
    }
} catch {
    Write-Fail "getWebhookInfo 解析失敗: $whRaw"
}

# ════════════════════════════════════════════════════════════
# Docker-6: Telegram getUpdates（從容器內，關鍵 409 測試）
# ════════════════════════════════════════════════════════════
Write-Header "Docker-6: 容器內 getUpdates 驗證（409 關鍵測試）"

Write-Info "從容器內呼叫 getUpdates (timeout=1)..."
$updRaw = docker exec $CONTAINER curl -s --max-time 10 "https://api.telegram.org/bot${TOKEN}/getUpdates?timeout=1" 2>&1
try {
    $upd = $updRaw | ConvertFrom-Json
    if ($upd.ok -eq $true) {
        Write-Pass "getUpdates 正常（ok=true）"
        Write-Info "待處理 Updates 數量: $($upd.result.Count)"
    } elseif ($upd.error_code -eq 409) {
        Write-Fail "409 Conflict！（從容器內也確認了衝突）"
        Write-Info "描述: $($upd.description)"
    } else {
        Write-Warn "回應: $updRaw"
    }
} catch {
    Write-Fail "getUpdates 解析失敗: $updRaw"
}

# ════════════════════════════════════════════════════════════
# Docker-7: 容器內 Node 進程狀態
# ════════════════════════════════════════════════════════════
Write-Header "Docker-7: 容器內 Node 進程狀態"

Write-Info "列出容器內運行中的 Node 進程..."
$psResult = docker exec $CONTAINER ps aux 2>&1 | Where-Object { $_ -match "node" }
if ($psResult) {
    $psResult | ForEach-Object { Write-Info $_ }
} else {
    Write-Warn "容器內無 Node 進程運行（Bot 可能已崩潰）"
}

# ════════════════════════════════════════════════════════════
# 摘要
# ════════════════════════════════════════════════════════════
Write-Header "驗證完成"
Write-Host "  若發現問題，請執行: .\fix_409.ps1" -ForegroundColor Yellow
Write-Host ""
