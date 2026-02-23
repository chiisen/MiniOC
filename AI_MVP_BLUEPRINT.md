# Telegram AI Agent - 最小可執行版本 (MVP) 藍圖

> [!IMPORTANT]
> **給接手開發的 AI Agent**: 
> 這是一個全新的 Telegram Bot 中介層專案。請嚴格遵守本藍圖的架構與技術棧進行開發。
> **不要去猜測或引入任何舊有系統的複雜隔離機制。一切以「最少代碼、最快運行」為準。**

## 1. 專案目標與定位
本專案旨在打造一個輕量級的 Telegram Bot 作為使用者介面，並在後端呼叫 `opencode` CLI 作為思考引擎。
系統必須能在單一環境（如宿主機或單一 Docker 容器內）執行，不依賴動態生成容器。

## 2. 核心技術棧
- **開發語言**: 純 **JavaScript (Node.js)** — *請勿使用 TypeScript*，以降低編譯與環境建置的複雜度。
- **通訊模組**: `node-telegram-bot-api` (採用 Long Polling 長輪詢)。
- **資料庫**: `better-sqlite3` (用於儲存使用者對話歷史與系統狀態)。
- **AI 引擎**: `opencode` CLI 工具。

## 3. 架構設計與執行流程
系統簡化為「收、想、發」的線性流程。捨棄了任何跨容器通訊與複雜的排程佇列，專注於完成核心對話功能。

1. **接收訊息 (Telegram Bot)**:
   - 監聽 Telegram 使用者訊息。
   - 將訊息內容與對話上下文寫入 SQLite 或暫存區。

2. **呼叫 AI 引擎 (單一環境 Node.js Process)**:
   - 使用 Node.js 的 `child_process.spawn` 或 `child_process.exec`。
   - 透過注入**環境變數**讓 `opencode` 連線至自訂大模型 (如 MinMax M2.5)：
     確保啟動選項中包含 `MINIOC_BASE_URL` (相容位址) 與 `MINIOC_API_KEY`。
   - 直接在背景呼叫 `npx opencode` (務必帶上 `--yes` 或相關非互動式參數，避免 CLI 卡死)。
   - **互動機制 (Stdin & IPC)**: 將需要 AI 處理的對話上下文透過 `stdin` (標準輸入) 餵給 `opencode`，或是將 Prompt 寫入暫存檔案後讓 `opencode` 讀取。

3. **處理結果與回覆**:
   - `opencode` 執行完畢後，透過檔案系統 (寫入約定的 IPC 資料夾) 或完整的 `stdout` 攔截，取得思考結果。
   - 將結果解析後，使用 Telegram Bot API 發送回原生對話框。

## 4. 全域規則與提示詞
為了讓 `opencode` 系統能正確理解其角色與限制，所有的代理人(Agent) 行為規範、安全限制或角色設定，統一集中存放於工作目錄下的：
`.opencode/rules/AGENTS.md`
- 主程式在呼叫 `opencode` 之前，應確保該檔案存在並符合最新規範。

## 5. 開發步驟建議 (給開發 Agent)
1. **初始化**: `npm init -y` 並安裝所需套件 (`node-telegram-bot-api`, `better-sqlite3`)。
2. **實作第一階段**: 寫死一段 Prompt，從 Node.js 觸發 `opencode` 並成功拿回文字結果。
3. **實作第二階段**: 串接 Telegram Bot 收發訊息，不接資料庫。
4. **實作第三階段**: 加入 SQLite，為對話加入 History (歷史記憶) 功能。
