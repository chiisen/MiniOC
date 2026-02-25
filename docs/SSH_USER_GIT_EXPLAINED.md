# GitHub SSH 連線為什麼必須使用 `User git`？

在設定 GitHub SSH 連線（例如編輯 `~/.ssh/config`）時，你會發現 `User` 欄位必須設定為 `git`，而不是你的 GitHub 使用者名稱。這背後有明確的系統設計原因。

## 1. 核心機制：共享系統帳號 (Shared System Account)
GitHub 伺服端運行的是 Linux 系統。在正常的 Linux 主機中，每個使用者都有自己的系統帳號。但 GitHub 有數千萬使用者，如果為每個人都建立一個真實的 Linux 系統帳號，管理起來會非常混亂且不安全。

因此，GitHub 採用了**共享帳號**機制：
*   GitHub 伺服器只建立了一個名為 **`git`** 的唯一系統帳號。
*   所有人進行 SSH 連線時，其實都是在嘗試登入這個名為 `git` 的 Linux 使用者。

## 2. 身份識別：公鑰即身分 (Public Key as Identity)
既然大家都用 `git` 這個名字登入，GitHub 如何區分你是誰？

答案就在你的 **SSH 公鑰 (Public Key)**：
1.  當你發起 `ssh git@github.com` 連連時，SSH 協議會出示你的私鑰特徵。
2.  GitHub 的門神程式 (Gatekeeper) 會在資料庫中比對：
    *   「這把鑰匙對應的是哪個 GitHub 帳號？」
    *   如果比對成功（例如對應到 `chiisen`），它就會在後台將你的連線關聯到該帳號，並給予對應的倉庫權限。

## 3. 常見誤區：使用個人使用者名稱
如果你將連線設定改為 `User chiisen`：
*   **結果**：連線會失敗，出現 `Permission denied (publickey)`。
*   **原因**：GitHub 伺服器的作業系統中**根本沒有** `chiisen` 這個 Linux 通訊帳號。它看到一個不認識的人想登入，會直接關閉大門。

## 4. 總結
*   **`User git`**：這是一張「進入 GitHub 機房大樓」的通行證（共通帳號）。
*   **`IdentityFile` (私鑰)**：這是大樓內部的「識別證」，用來證明你在大樓內具備存取特定倉庫的權限。

---
*這份文件是由 AI 助手根據 2026/02/25 的排錯經驗整理而成。*
