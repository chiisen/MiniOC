# MiniOC
迷你 OC（Mini OpenCode）- 使用 OpenCode 作為思考引擎的 Telegram AI 代理

## 功能

- 🤖 **AI 對話**：使用 OpenCode/MiniMax 作為 AI 思考引擎
- 💾 **對話歷史**：自動儲存對話記錄到 SQLite 資料庫
- 🔄 **自動復原**：遇到 409 錯誤時自動重試連線
- 🔒 **單一實例**：使用檔案鎖防止多重執行

## 快速開始

### 1. 安裝依賴
```bash
npm install
```

### 2. 設定環境變數
複製 `.env.example` 為 `.env` 並填入：
```
TELEGRAM_BOT_TOKEN=你的機器人Token
MINIOC_API_KEY=你的API金鑰
MINIOC_BASE_URL=https://api.minimax.io
MINIOC_MODEL=MiniMax-M2.5
# 或使用免費模型：opencode/minimax-m2.5-free
```

### 3. 啟動機器人
```bash
npm run dev    # 開發模式（自動重啟）
npm start      # 生產模式
```

---

## Docker 部署

### 環境變數

| 變數 | 說明 | 預設值 |
|------|------|--------|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token | - |
| `MINIOC_API_KEY` | MiniMax API 金鑰 | - |
| `MINIOC_BASE_URL` | API 端點 | `https://api.minimax.io` |
| `MINIOC_MODEL` | 模型名稱 | `MiniMax-M2.5` |

**可用模型**：
- `MiniMax-M2.5` - 付費版（需 API Key）
- `MiniMax-M2.5-highspeed` - 付費极速版
- `MiniMax-M2.1` - 付費版
- `opencode/minimax-m2.5-free` - 免費版（透過 OpenCode）

### Docker 指令

```bash
# 構建映像
docker-compose build

# 啟動容器
docker-compose up -d

# 查看日誌
docker logs minioc

# 停止容器
docker-compose down

# 重啟容器
docker-compose restart
```

### Chat 模式（不透過 Telegram）

```bash
# 在 Docker 容器內直接與 AI 對話
docker exec minioc npm run chat -- "Hello"
```

### 驗證 Telegram 連接

參考 [TELEGRAM_VERIFY.md](./TELEGRAM_VERIFY.md) 進行分階段驗證：

## 指令

| 指令 | 說明 |
|------|------|
| `/reset` | 手動重置 Bot 連線（解決 409 衝突） |
| `/test409` | 測試 409 錯誤復原機制 |

## 已知問題

### Telegram Polling 409 Conflict ⚠️ 未修復
- **問題**：Telegram Bot 出現 `409 Conflict: terminated by other getUpdates request`
- **原因**：Telegram 伺服器端的 polling 狀態與客戶端不同步（常發生在重啟後）
- **解決方案**：
  1. 等待約 30 分鐘讓 Telegram 自動釋放鎖定
  2. 發送 `/reset` 指令手動重置
  3. 使用 Webhook 模式代替 Polling

### Docker 網絡 ✅ 已修復
- **問題**：容器網絡問題導致 DNS 解析失敗
- **修復**：在啟動腳本中添加 `--dns-result-order=ipv4first` 強制 IPv4 優先

## 專案結構

```
MiniOC/
├── src/
│   ├── index.js      # 入口點
│   ├── bot.js        # Telegram 機器人處理
│   ├── ai.js         # OpenCode AI 整合
│   ├── db.js         # SQLite 資料庫操作
│   └── logger.js     # 日誌模組
├── data/             # 資料庫與日誌檔案
├── docker-compose.yml
└── package.json
```

## 測試

### 執行測試
```bash
npm test              # 執行所有測試
npm run test:watch    # 監聽模式（檔案變更時自動重新執行）
```

### 涵蓋率報告
```bash
npx jest --coverage
```

### 測試結果
```
Test Suites: 3 passed, 3 total
Tests:       16 passed, 16 total

涵蓋率：
- ai.js:     ~70%
- db.js:     ~73%
- logger.js: ~60%
```

### 測試檔案
| 檔案 | 說明 |
|------|------|
| `db.test.js` | 資料庫操作測試 |
| `ai.js.test.js` | AI 處理測試 |
| `processMessage.test.js` | 訊息處理測試 |

## License

MIT
