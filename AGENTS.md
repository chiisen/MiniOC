# AGENTS.md - MiniOC 项目指南

> [!IMPORTANT]
> 本文件包含在此代码库上工作的 AI 代理的指南。

## 1. 项目概述

MiniOC 是一个使用 OpenCode 作为思考引擎处理用户消息的 Telegram AI 代理。使用 Node.js 构建，使用：
- **运行时**：Node.js（请参阅 `.python-version` 了解版本）
- **数据库**：SQLite (better-sqlite3)
- **机器人**：node-telegram-bot-api
- **配置**：dotenv

## 2. 构建和运行命令

### 安装
```bash
npm install
```

### 开发
```bash
npm run dev    # 启动并监视文件 (--watch)
npm start      # 正常启动
```

### 运行测试
目前未配置测试框架。要添加测试，请安装 Jest：
```bash
npm install --save-dev jest
```

然后添加到 package.json：
```json
"scripts": {
  "test": "jest",
  "test:watch": "jest --watch",
  "test:coverage": "jest --coverage"
}
```

运行单个测试文件：
```bash
npx jest testfilename.test.js
```

运行单个测试：
```bash
npx jest testfilename.test.js -t "test name"
```

## 3. 代码检查与质量

### ESLint
目前没有 ESLint 配置。添加方法：
```bash
npm install --save-dev eslint
npx eslint --init
```

### Prettier
目前没有 Prettier 配置。添加方法：
```bash
npm install --save-dev prettier
```

推荐的 `.prettierrc`：
```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 4,
  "trailingComma": "none",
  "printWidth": 100
}
```

## 4. 代码风格指南

### 语言
- JavaScript（非 TypeScript）

### 导入
- 使用 CommonJS `require()`（项目使用 CommonJS 模块）
- 顺序：内置 → 外部 → 本地
- 示例：
```javascript
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const { processMessage } = require('./ai');
const { getChatHistory } = require('./db');
```

### 格式
- 使用 4 个空格缩进（不是制表符）
- 添加尾随逗号
- 使用分号
- 最大行长度：100 个字符

### 命名约定
- **文件**：snake_case（`bot.js`、`db.js`）
- **函数**：camelCase（`initBot`、`getChatHistory`）
- **常量**：UPPER_SNAKE_CASE（`DB_PATH`、`IPC_DIR`）
- **类**：PascalCase（如果使用）

### 函数
- 保持函数小而专注（最好少于 50 行）
- 对异步操作使用 async/await
- 在异步函数中始终使用 try/catch 处理错误

### 错误处理
- 始终用 try/catch 包装异步操作
- 使用 `console.error()` 记录错误
- 提供有意义的错误消息
- 示例：
```javascript
try {
    await bot.sendMessage(chatId, response);
} catch (error) {
    console.error('❌ Error sending message:', error);
    await bot.sendMessage(chatId, 'Sorry, something went wrong.');
}
```

### 数据库
- 使用预编译语句防止 SQL 注入
- 退出时始终关闭数据库连接
- 为频繁查询的列创建索引

### 环境变量
- 永远不要将密钥提交到版本控制
- 使用 `.env` 进行本地开发（已被 gitignore）
- 在 `.env.example` 中记录所有必需变量
- 必需变量：
  - `TELEGRAM_BOT_TOKEN`
  - `MINIOC_API_KEY`
  - `MINIOC_BASE_URL`（可选）
  - `MINIOC_MODEL`（可选）
  - `OPENCODE_PATH`（可选）

### 日志
- 对重要事件使用带表情符号的 console.log/error：
  - 🤖 机器人初始化
  - ✅ 成功操作
  - 📩 收到的消息
  - 📤 发送的消息
  - ❌ 错误

## 5. 项目结构

```
MiniOC/
├── src/
│   ├── index.js      # 入口点
│   ├── bot.js        # Telegram 机器人处理器
│   ├── ai.js         # OpenCode AI 集成
│   └── db.js         # SQLite 数据库操作
├── data/             # 数据库文件（gitignore）
├── .env              # 环境变量（gitignore）
├── .env.example      # 环境变量模板
├── package.json      # 依赖项
└── README.md         # 项目简介
```

## 6. 添加新功能

1. 在 `src/` 中创建新模块
2. 使用 `module.exports` 导出函数
3. 在其他文件中使用 `require()` 导入
4. 如需要，在 `.env.example` 中添加环境变量

## 7. 数据库架构

```sql
CREATE TABLE conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL,        -- 'user' or 'assistant'
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_id ON conversations(user_id);
CREATE INDEX idx_timestamp ON conversations(timestamp);
```

## 8. Git 约定

- 提交消息应清晰且有描述性
- 不要提交 `.env` 文件或 `node_modules/`
- 提交前运行 `git status`

## 9. 已知限制

- 尚无测试套件
- 不支持 TypeScript
- 不支持 Docker
- 单个数据库文件（无连接池）

## 10. 常用命令

```bash
# 检查 Node 版本
node --version

# 列出已安装的包
npm list

# 更新依赖
npm update

# 清除 npm 缓存
npm cache clean --force
```
