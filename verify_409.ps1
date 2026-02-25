# ============================================================
# verify_409.ps1 - Telegram Bot 409 衝突完整驗證腳本
# 使用方式: pwsh -File verify_409.ps1
# 注意: 只做驗證與診斷，不會自動重啟 Bot
# ============================================================

$ErrorActionPreference = "Continue"
$ProjectRoot = $PSScriptRoot

# ── 工具函式 ────────────────────────────────────────────────

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

# 結果收集
$results = @{}

# ── 讀取 Token ───────────────────────────────────────────────

$EnvFile = Join-Path $ProjectRoot ".env"
if (-not (Test-Path $EnvFile)) {
    Write-Fail "找不到 .env 檔案: $EnvFile"
    exit 1
}

$TOKEN = Get-Content $EnvFile |
    Where-Object { $_ -match "^TELEGRAM_BOT_TOKEN=" } |
    ForEach-Object { $_.Split("=", 2)[1].Trim().Trim('"').Trim("'") } |
    Select-Object -First 1

if (-not $TOKEN -or $TOKEN -eq "your_telegram_bot_token_here") {
    Write-Fail "TELEGRAM_BOT_TOKEN 未設定或仍為預設值"
    exit 1
}

Write-Host "🔑 Token 已讀取 (前 10 碼): $($TOKEN.Substring(0,10))..." -ForegroundColor DarkGray

# ════════════════════════════════════════════════════════════
# Phase 1: 多實例偵測
# ════════════════════════════════════════════════════════════
Write-Header "Phase 1: 多實例偵測"

# 1-A: Docker 容器
Write-Info "檢查 Docker 容器..."
$dockerRunning = $false
try {
    $dockerPs = docker ps --format "{{.Names}}" 2>&1
    $miniocContainers = $dockerPs | Where-Object { $_ -match "minioc" }
    if ($miniocContainers) {
        Write-Warn "偵測到 Docker 容器運行中: $($miniocContainers -join ', ')"
        $dockerRunning = $true
    } else {
        Write-Pass "無 minioc 相關 Docker 容器"
    }
} catch {
    Write-Warn "Docker 未安裝或未啟動: $_"
}

# 1-B: 本地 Node 進程
Write-Info "檢查本地 Node 進程..."
$nodeRunning = $false
try {
    $nodeProcs = Get-Process -Name "node" -ErrorAction SilentlyContinue
    if ($nodeProcs) {
        Write-Warn "偵測到本地 Node 進程 (PID: $($nodeProcs.Id -join ', '))"
        $nodeRunning = $true
    } else {
        Write-Pass "無本地 Node 進程"
    }
} catch {
    Write-Warn "無法檢查 Node 進程: $_"
}

# 1-C: Lock 檔案
Write-Info "檢查 Lock 檔案..."
$LockFile = Join-Path $ProjectRoot "data\bot.lock"
if (Test-Path $LockFile) {
    $lockPid = (Get-Content $LockFile).Trim()
    $lockProc = Get-Process -Id ([int]$lockPid) -ErrorAction SilentlyContinue
    if ($lockProc) {
        Write-Warn "Lock 檔案存在且進程仍在運行 (PID: $lockPid)"
    } else {
        Write-Warn "Lock 檔案存在但進程已死亡 (殘留 Lock，PID: $lockPid)"
    }
} else {
    Write-Pass "無殘留 Lock 檔案"
}

# 1-D: 多實例綜合判斷
if ($dockerRunning -and $nodeRunning) {
    Write-Fail "⚡ 根因確認: Docker + 本地 Node 同時運行 → 這就是 409 的原因！"
    $results["Phase1"] = "CONFLICT"
} elseif ($dockerRunning -or $nodeRunning) {
    Write-Info "單一實例運行中，排除多實例衝突 → 進入 Phase 2"
    $results["Phase1"] = "SINGLE"
} else {
    Write-Info "未偵測到任何運行中的 Bot → 可能是 Telegram 服務端殘留，進入 Phase 2"
    $results["Phase1"] = "NONE"
}

# ════════════════════════════════════════════════════════════
# Phase 2: Telegram 服務端狀態驗證
# ════════════════════════════════════════════════════════════
Write-Header "Phase 2: Telegram 服務端 getUpdates 驗證"

Write-Info "正在呼叫 getUpdates (timeout=1)..."
try {
    $response = Invoke-WebRequest `
        -Uri "https://api.telegram.org/bot$TOKEN/getUpdates?timeout=1" `
        -Method GET `
        -TimeoutSec 10 `
        -UseBasicParsing 2>&1
    
    $body = $response.Content | ConvertFrom-Json
    
    if ($body.ok -eq $true) {
        Write-Pass "getUpdates 回應正常 (ok=true)"
        $results["Phase2"] = "OK"
        $pendingCount = $body.result.Count
        Write-Info "待處理 updates 數量: $pendingCount"
    } else {
        Write-Fail "getUpdates 回應異常: $($body | ConvertTo-Json -Compress)"
        $results["Phase2"] = "ERROR"
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
        Write-Fail "409 Conflict 確認！Telegram 服務端仍有殘留連線"
        Write-Info "錯誤描述: $($errBody.description)"
        $results["Phase2"] = "409"
    } else {
        Write-Fail "HTTP 請求失敗: $($_.Exception.Message)"
        $results["Phase2"] = "HTTP_ERROR"
    }
}

# ════════════════════════════════════════════════════════════
# Phase 3: Webhook 狀態驗證
# ════════════════════════════════════════════════════════════
Write-Header "Phase 3: Webhook 狀態驗證"

Write-Info "正在呼叫 getWebhookInfo..."
try {
    $whResponse = Invoke-WebRequest `
        -Uri "https://api.telegram.org/bot$TOKEN/getWebhookInfo" `
        -Method GET `
        -TimeoutSec 10 `
        -UseBasicParsing 2>&1
    
    $whBody = $whResponse.Content | ConvertFrom-Json
    
    if ($whBody.ok -eq $true) {
        $webhookUrl = $whBody.result.url
        if ([string]::IsNullOrEmpty($webhookUrl)) {
            Write-Pass "無 Webhook 設定（純 Polling 模式）"
            $results["Phase3"] = "NO_WEBHOOK"
        } else {
            Write-Warn "偵測到 Webhook URL: $webhookUrl → 這可能造成衝突！"
            $results["Phase3"] = "HAS_WEBHOOK"
        }
        
        $pendingWebhookUpdates = $whBody.result.pending_update_count
        if ($pendingWebhookUpdates -gt 0) {
            Write-Warn "有 $pendingWebhookUpdates 個待處理的 Webhook Updates"
        }
    }
} catch {
    Write-Fail "getWebhookInfo 請求失敗: $($_.Exception.Message)"
    $results["Phase3"] = "ERROR"
}

# ════════════════════════════════════════════════════════════
# Phase 4: 程式碼層面診斷
# ════════════════════════════════════════════════════════════
Write-Header "Phase 4: 程式碼層面診斷"

# 4-A: 確認 bot.js 啟動等待時間
Write-Info "檢查 bot.js 中的啟動等待時間..."
$BotJsFile = Join-Path $ProjectRoot "src\bot.js"
if (Test-Path $BotJsFile) {
    $botJsContent = Get-Content $BotJsFile -Raw
    
    # 尋找 setTimeout 等待時間
    $waitMatch = [regex]::Matches($botJsContent, "setTimeout\(r,\s*(\d+)\)")
    foreach ($m in $waitMatch) {
        $ms = [int]$m.Groups[1].Value
        if ($ms -lt 30000) {
            Write-Warn "bot.js 啟動等待時間 ${ms}ms < 30000ms (Telegram Long Polling timeout)"
        } else {
            Write-Pass "bot.js 啟動等待時間 ${ms}ms >= 30000ms ✓"
        }
    }
    
    # 確認 Recovery 邏輯
    if ($botJsContent -match "polling_error") {
        Write-Pass "polling_error 事件處理器存在"
    } else {
        Write-Fail "未找到 polling_error 事件處理器"
    }
    
    if ($botJsContent -match "attempt.*3") {
        Write-Info "Recovery 重試邏輯：3 次嘗試"
    }
} else {
    Write-Fail "找不到 src\bot.js"
}

# 4-B: 確認 index.js Lock 機制
Write-Info "檢查 index.js 中的 Lock 機制..."
$IndexJsFile = Join-Path $ProjectRoot "src\index.js"
if (Test-Path $IndexJsFile) {
    $indexJsContent = Get-Content $IndexJsFile -Raw
    if ($indexJsContent -match "bot\.lock") {
        Write-Pass "Lock 檔案機制存在"
        Write-Warn "注意：此 Lock 僅在同一主機有效，無法跨 Docker 容器偵測"
    }
} else {
    Write-Fail "找不到 src\index.js"
}

# 4-C: 檢查 better-sqlite3 原生模組（ELF header 問題）
Write-Info "檢查 better-sqlite3 原生模組..."
$SqliteNode = Join-Path $ProjectRoot "node_modules\better-sqlite3\build\Release\better_sqlite3.node"
if (Test-Path $SqliteNode) {
    # 讀取前 4 bytes 確認是否為 ELF (Linux) 格式
    $bytes = [System.IO.File]::ReadAllBytes($SqliteNode) | Select-Object -First 4
    $isElf = ($bytes[0] -eq 0x7F -and $bytes[1] -eq 0x45 -and $bytes[2] -eq 0x4C -and $bytes[3] -eq 0x46) # 0x7F E L F
    $isMz  = ($bytes[0] -eq 0x4D -and $bytes[1] -eq 0x5A) # M Z = Windows PE
    
    if ($isElf) {
        Write-Warn "better-sqlite3 是 Linux ELF 格式，在 Docker 外不可用（這是預期的）"
        Write-Info "若在 Docker 內出現錯誤，需在容器內執行: npm rebuild better-sqlite3"
    } elseif ($isMz) {
        Write-Pass "better-sqlite3 是 Windows PE 格式"
        Write-Warn "注意：此二進制在 Docker(Linux) 容器內無法使用，需在 Docker 內 npm rebuild"
    } else {
        Write-Warn "無法識別 better-sqlite3 二進制格式"
    }
} else {
    Write-Warn "找不到 better-sqlite3 原生模組（尚未安裝？）"
}

# ════════════════════════════════════════════════════════════
# Phase 5: Docker 日誌分析（若容器有在運行）
# ════════════════════════════════════════════════════════════
Write-Header "Phase 5: Docker 日誌分析"

if ($dockerRunning) {
    Write-Info "擷取最近 30 行 Docker 日誌..."
    try {
        $logs = docker logs minioc --tail 30 2>&1
        $logs | ForEach-Object {
            if ($_ -match "409") {
                Write-Fail "日誌中發現 409: $_"
            } elseif ($_ -match "Polling started|Bot connected|Bot started") {
                Write-Pass "$_"
            } elseif ($_ -match "ERROR|FAIL|Error") {
                Write-Warn "$_"
            } else {
                Write-Info "$_"
            }
        }
    } catch {
        Write-Warn "無法讀取 Docker 日誌: $_"
    }
} else {
    Write-Info "無 Docker 容器運行，跳過日誌分析"
    
    # 嘗試讀取本地 bot.log
    $BotLog = Join-Path $ProjectRoot "bot.log"
    if (Test-Path $BotLog) {
        Write-Info "讀取本地 bot.log 最後 20 行..."
        $localLogs = Get-Content $BotLog -Tail 20
        $localLogs | ForEach-Object {
            if ($_ -match "409") {
                Write-Fail "日誌中發現 409: $_"
            } elseif ($_ -match "ELF") {
                Write-Warn "ELF 格式錯誤（需在 Docker 內執行）: $_"
            } elseif ($_ -match "Polling started|Bot connected") {
                Write-Pass "$_"
            } else {
                Write-Info "$_"
            }
        }
    }
}

# ════════════════════════════════════════════════════════════
# 診斷摘要
# ════════════════════════════════════════════════════════════
Write-Header "診斷摘要"

Write-Host ""
Write-Host "  Phase 1 (多實例)  : " -NoNewline
switch ($results["Phase1"]) {
    "CONFLICT" { Write-Host "⚡ 多實例衝突！" -ForegroundColor Red }
    "SINGLE"   { Write-Host "✅ 單一實例" -ForegroundColor Green }
    "NONE"     { Write-Host "⚠️  無運行中的實例" -ForegroundColor Yellow }
}

Write-Host "  Phase 2 (getUpdates): " -NoNewline
switch ($results["Phase2"]) {
    "OK"         { Write-Host "✅ 正常" -ForegroundColor Green }
    "409"        { Write-Host "❌ 409 Conflict" -ForegroundColor Red }
    "ERROR"      { Write-Host "⚠️  API 錯誤" -ForegroundColor Yellow }
    "HTTP_ERROR" { Write-Host "⚠️  HTTP 錯誤" -ForegroundColor Yellow }
}

Write-Host "  Phase 3 (Webhook)   : " -NoNewline
switch ($results["Phase3"]) {
    "NO_WEBHOOK"  { Write-Host "✅ 無 Webhook" -ForegroundColor Green }
    "HAS_WEBHOOK" { Write-Host "⚠️  有 Webhook 設定！" -ForegroundColor Yellow }
    "ERROR"       { Write-Host "⚠️  檢查失敗" -ForegroundColor Yellow }
}

Write-Host ""
Write-Host "── 建議行動 ──" -ForegroundColor Cyan

if ($results["Phase1"] -eq "CONFLICT") {
    Write-Host "  → 停止本地 Node 進程或 Docker 容器中的其中一個" -ForegroundColor Yellow
}
if ($results["Phase2"] -eq "409") {
    Write-Host "  → 停止所有實例，等待 35 秒後再重啟（見 fix_409.ps1）" -ForegroundColor Yellow
}
if ($results["Phase3"] -eq "HAS_WEBHOOK") {
    Write-Host "  → 執行 fix_409.ps1 以清除 Webhook" -ForegroundColor Yellow
}
if ($results["Phase2"] -eq "OK" -and $results["Phase1"] -ne "CONFLICT") {
    Write-Host "  → 狀態正常，可以安全重啟 Bot" -ForegroundColor Green
}

Write-Host ""
Write-Host "══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  驗證完成。修復請執行: .\fix_409.ps1" -ForegroundColor Cyan
Write-Host "══════════════════════════════════════" -ForegroundColor Cyan
