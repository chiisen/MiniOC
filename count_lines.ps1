<#
.SYNOPSIS
    計算專案中的程式碼與檔案行數
.DESCRIPTION
    此腳本會遞迴掃描目錄，排除特定資料夾（如 node_modules），並計算指定副檔名的行數。
#>

# 參數設定
$TargetDirectory = ".\"
$IncludeExtensions = @(".js", ".json", ".md", ".ps1")
$IncludeFiles = @(".env", ".env.example")
$ExcludeFolders = @("node_modules", ".git")

Write-Host "📊 開始計算程式碼行數..." -ForegroundColor Cyan

$totalLines = 0
$totalFiles = 0
$fileStats = @()

# 取得目前根目錄以顯示相對路徑
$basePath = (Resolve-Path $TargetDirectory).Path

Get-ChildItem -Path $TargetDirectory -File -Recurse | Where-Object {
    $ext = $_.Extension
    $name = $_.Name
    $dir = $_.DirectoryName

    # 1. 檢查副檔名或特定檔案名稱
    $isIncluded = ($IncludeExtensions -contains $ext) -or ($IncludeFiles -contains $name)
    if (-not $isIncluded) { return $false }

    # 2. 檢查是否在排除的資料夾中
    foreach ($ex in $ExcludeFolders) {
        # 匹配資料夾名稱，避免把檔名也過濾掉
        if ($dir -match "[\\/]$ex([\\/]|$)") { return $false }
    }

    return $true
} | ForEach-Object {
    $lineCount = 0
    if ($_.Length -gt 0) {
        # 使用 Measure-Object 來計算行數
        $lineCount = (Get-Content $_.FullName -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
    }
    
    $totalLines += $lineCount
    $totalFiles++

    # 紀錄統計資料
    $relativePath = $_.FullName.Replace($basePath + "\", "")
    $fileStats += [PSCustomObject]@{
        File  = $relativePath
        Lines = $lineCount
    }
}

# 按照行數由大到小排序並顯示
$fileStats | Sort-Object Lines -Descending | Format-Table -AutoSize

Write-Host "================================" -ForegroundColor Green
Write-Host "🎯 統計結果" -ForegroundColor Green
Write-Host "📂 總檔案數: $totalFiles 個" -ForegroundColor White
Write-Host "📝 總行數  : $totalLines 行" -ForegroundColor White
Write-Host "================================" -ForegroundColor Green
