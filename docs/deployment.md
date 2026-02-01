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
