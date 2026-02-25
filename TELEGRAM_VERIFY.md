# Telegram Bot 驗證檢查清單

## Phase 1: 環境基礎設施驗證

- [x] Docker 容器正常運行
- [x] 容器可以訪問外部網路
- [x] DNS 解析正常 (`api.telegram.org`)

**驗證命令**：
```bash
docker ps
docker exec minioc ping -c 3 8.8.8.8
docker exec minioc nslookup api.telegram.org
```

---

## Phase 2: Token 驗證

- [x] `.env` 中 `TELEGRAM_BOT_TOKEN` 已設定
- [x] Token 格式正確
- [x] Token 有效 (使用 `getMe` API 驗證)

**驗證命令**：
```bash
# 確認 Token 設定
grep TELEGRAM_BOT_TOKEN .env

# 驗證 Token 有效性
docker exec minioc curl -s "https://api.telegram.org/bot$(grep TELEGRAM_BOT_TOKEN .env | cut -d= -f2 | tr -d '\"')/getMe"
```

**結果**：
- Bot: `@opencode1221_bot` (波波神)
- ID: `7896150034`

---

## Phase 3: Telegram API 連接驗證

- [x] 容器內可以調用 `https://api.telegram.org`
- [x] `getMe` API 調用成功
- [x] `getWebhookInfo` 確認無殘留 webhook
- [ ] `getUpdates` 可以正常調用（**有 409 衝突**）

**驗證命令**：
```bash
# 測試 API 連接
docker exec minioc curl -s "https://api.telegram.org/bot${TOKEN}/getMe"

# 檢查 Webhook
docker exec minioc curl -s "https://api.telegram.org/bot${TOKEN}/getWebhookInfo"

# 檢查是否有 409 衝突
docker exec minioc curl -s "https://api.telegram.org/bot${TOKEN}/getUpdates?timeout=1"
```

**結果**：
- ✅ `getMe`: 成功
- ✅ `getWebhookInfo`: 無 webhook
- ❌ `getUpdates`: **409 Conflict**

**409 衝突解決方案**：
1. 確保只有一個 Bot 實例運行
2. 檢查手機/其他設備是否打開 Bot
3. 使用 @BotFather 重新產生 Token
4. 等待 30 分鐘讓 Telegram 自動釋放

---

## Phase 4: Polling 機制驗證

- [ ] Bot 實例創建成功
- [ ] Polling 啟動成功
- [ ] Polling 穩定運行（無 ESOCKETTIMEDOUT）

**驗證命令**：
```bash
docker logs minioc | grep -E "Bot connected|Polling started|listening for messages"
```

**預期結果**：
```
Bot connected: @opencode1221_bot (波波神)
Polling started, waiting for messages...
Bot started and listening for messages
```

---

## Phase 5: 訊息處理驗證

- [ ] Bot 可以接收訊息
- [ ] AI API 調用成功
- [ ] Bot 可以回覆訊息
- [ ] 對話歷史正確保存

**驗證方法**：
1. 發送訊息給 Bot
2. 檢查日誌：`docker logs minioc`
3. 檢查數據庫：`ls -la data/`

---

## 快速驗證腳本

```bash
#!/bin/bash
# Telegram Bot 驗證腳本

echo "=== Phase 1: 基礎設施 ==="
docker ps | grep minioc
docker exec minioc ping -c 1 8.8.8.8 >/dev/null 2>&1 && echo "✅ 網路正常"
docker exec minioc nslookup api.telegram.org >/dev/null 2>&1 && echo "✅ DNS 正常"

echo ""
echo "=== Phase 2: Token ==="
TOKEN=$(grep TELEGRAM_BOT_TOKEN .env | cut -d= -f2 | tr -d '"')
docker exec minioc curl -s "https://api.telegram.org/bot${TOKEN}/getMe" | grep -q "ok:true" && echo "✅ Token 有效"

echo ""
echo "=== Phase 3: API 連接 ==="
docker exec minioc curl -s "https://api.telegram.org/bot${TOKEN}/getWebhookInfo" | grep -q 'url""' && echo "✅ 無 Webhook"
docker exec minioc curl -s "https://api.telegram.org/bot${TOKEN}/getUpdates?timeout=1" | grep -q "ok:true" && echo "✅ 無 409 衝突" || echo "❌ 409 衝突"

echo ""
echo "=== Phase 4: Polling ==="
docker logs minioc 2>&1 | grep -q "Polling started" && echo "✅ Polling 啟動" || echo "❌ Polling 未啟動"

echo ""
echo "=== Phase 5: 訊息 ==="
echo "請發送訊息給 Bot 並檢查日誌"
docker logs minioc --tail 10
```

---

## 常見問題

### 409 Conflict
**原因**：Bot Token 被多個實例使用

**解決**：
1. 關閉所有其他使用該 Token 的應用
2. 重新啟動容器：`docker-compose restart`
3. 等待 30 分鐘讓 Telegram 釋放鎖定
4. 或使用 @BotFather 重新產生 Token

### ESOCKETTIMEDOUT
**原因**：網路連接超時

**解決**：
1. 檢查 DNS 設置（添加 8.8.8.8, 1.1.1.1）
2. 增加 timeout 設置
3. 檢查防火牆/代理設置
