# MiniOC
迷你 OC（Mini OpenCode）

## 已知問題

### Telegram Polling 409 Conflict
- **問題**：使用 Docker 運行時，Telegram Bot 出現 `409 Conflict: terminated by other getUpdates request`
- **原因**：Telegram 伺服器端的 polling 狀態與客戶端不同步
- **解決方案**：
  1. 確保只有一個 Bot 實例運行
  2. 使用 `setWebhook` → `deleteWebhook` 強制重置狀態
  3. 容器重啟後會自動恢復（忽略 409 錯誤）

### Docker 網絡
- 需要使用 `family: 4` 強制 IPv4
- 容器使用 `network_mode: host` 避免 DNS 問題
- **已修復**：在啟動腳本中添加 `--dns-result-order=ipv4first` 強制 IPv4 優先
