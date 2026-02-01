# Phase 7: 部署与运维 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the app production-ready with static file serving, PM2 process management, and deployment documentation.

**Architecture:** Express serves both API routes and Vite-built static files from `dist/`. PM2 manages the Node process with auto-restart. A one-line deploy script handles build + restart. Deployment docs cover both LAN and cloud scenarios.

**Tech Stack:** Express (static middleware), PM2, Vite build

**YAGNI decisions:**
- Docker/docker-compose: Skipped — LAN deployment with PM2 is the primary target. Cloud Docker is out of scope for a flower house POC.
- Caddy/Nginx config files: Skipped — HTTPS setup is deployment-specific; deployment docs mention the approach without bundling config files.
- Cron backup script: Skipped — the existing `npm run backup` works; deployment docs show the crontab entry.

---

### Task 1: Add production static file serving

**Files:**
- Modify: `server/index.js` — serve dist/ static files when built

**Step 1: Update server/index.js to serve static files**

Replace the current `server/index.js`:

```js
import { createDb } from './db.js';
import { createApp } from './app.js';

const port = process.env.PORT || 8787;
const db = createDb();
const app = createApp({ db });

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
```

with:

```js
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createDb } from './db.js';
import { createApp } from './app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');

const port = process.env.PORT || 8787;
const db = createDb();
const app = createApp({ db });

if (existsSync(distDir)) {
  app.use(express.static(distDir));
  console.log('Serving static files from dist/');
}

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
```

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All 95 tests pass (no test changes needed — tests use createApp directly, not index.js)

**Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: serve static files from dist/ in production"
```

---

### Task 2: Add PM2 config and deploy script

**Files:**
- Create: `ecosystem.config.cjs` — PM2 process configuration
- Modify: `package.json` — add deploy script

**Step 1: Create ecosystem.config.cjs**

Create `ecosystem.config.cjs` in the project root:

```js
module.exports = {
  apps: [{
    name: 'fla',
    script: 'server/index.js',
    env: {
      NODE_ENV: 'production',
      PORT: 8787,
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '256M',
  }],
};
```

Note: `.cjs` extension is required because the project uses `"type": "module"` in package.json, and PM2 needs CommonJS config.

**Step 2: Add deploy script to package.json**

Add to the `"scripts"` section in `package.json`:

```json
"deploy": "npm run build && pm2 restart ecosystem.config.cjs || pm2 start ecosystem.config.cjs"
```

This tries `restart` first (for redeployments), falls back to `start` (for first deploy).

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: All 95 tests pass

**Step 4: Commit**

```bash
git add ecosystem.config.cjs package.json
git commit -m "feat: add PM2 config and deploy script"
```

---

### Task 3: Create deployment documentation and .env.example

**Files:**
- Create: `.env.example` — environment variable template
- Create: `docs/deployment.md` — deployment guide

**Step 1: Create .env.example**

Create `.env.example` in the project root:

```
# Server port (default: 8787)
PORT=8787
```

**Step 2: Create docs/deployment.md**

Create `docs/deployment.md`:

````markdown
# FLA 部署指南

## 前提条件

- Node.js >= 18
- PM2 (`npm install -g pm2`)

## 快速部署（局域网）

### 1. 安装依赖

```bash
npm install --production
```

### 2. 构建前端

```bash
npm run build
```

### 3. 添加用户

```bash
npm run add-user admin <password> admin
npm run add-user <operator-name> <password>
```

默认种子用户：`admin/admin`（管理员）、`demo/demo`（操作员）。生产环境请修改密码。

### 4. 启动服务

```bash
npm run deploy
```

这会构建前端并通过 PM2 启动服务。访问 `http://<server-IP>:8787`。

### 5. PM2 管理

```bash
pm2 status          # 查看进程状态
pm2 logs fla        # 查看日志
pm2 restart fla     # 重启
pm2 stop fla        # 停止
pm2 save            # 保存进程列表（开机自启）
pm2 startup         # 生成开机自启脚本
```

## 数据备份

### 手动备份

```bash
npm run backup
```

备份文件保存到 `backups/data-<timestamp>.sqlite`。

### 自动备份（cron）

```bash
crontab -e
```

添加每日凌晨 2 点备份：

```
0 2 * * * cd /path/to/fla && npm run backup >> backups/cron.log 2>&1
```

### 恢复数据

```bash
cp backups/data-<timestamp>.sqlite server/data.sqlite
pm2 restart fla
```

## HTTPS 配置（可选）

### 局域网：mkcert 自签证书

```bash
# 安装 mkcert
brew install mkcert    # macOS
mkcert -install        # 安装根证书
mkcert <server-IP>     # 生成证书
```

然后用 Caddy 或 Nginx 反向代理到 8787 端口。

### 云服务器：Caddy 自动 HTTPS

安装 Caddy 后创建 `/etc/caddy/Caddyfile`：

```
your-domain.com {
    reverse_proxy localhost:8787
}
```

```bash
sudo systemctl restart caddy
```

Caddy 会自动申请和续期 Let's Encrypt 证书。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 8787 | 服务端口 |

## 故障排查

| 问题 | 解决方案 |
|------|----------|
| 端口被占用 | `lsof -i :8787` 查找占用进程，或更改 PORT |
| 数据库锁定 | 确认只有一个 Node 进程访问数据库 |
| PM2 进程不存在 | `pm2 start ecosystem.config.cjs` |
| 前端页面 404 | 检查 `dist/` 目录是否存在，运行 `npm run build` |
| 登录失败 | 检查用户是否存在：`npm run add-user` |
````

**Step 3: Commit**

```bash
git add .env.example docs/deployment.md
git commit -m "docs: add deployment guide and env template"
```

---

## Summary of changes across tasks

| Task | What | Files |
|------|------|-------|
| 1 | Production static file serving | server/index.js |
| 2 | PM2 config + deploy script | ecosystem.config.cjs (new), package.json |
| 3 | Deployment docs + env template | docs/deployment.md (new), .env.example (new) |
