# Flower Seedling POC Implementation (Current State)

更新日期：2026-02-01

## 目标

完成一个可演示的手机端 POC，覆盖拆分/合并、上架、状态、转移四个流程，并接入轻量后端持久化与登录鉴权。

## 当前实现概览

### 前端（SPA）
- 纯前端单页：`index.html` + `src/main.js` + `src/styles.css`
- 登录页：`login.html`（调用后端 `/api/login`）
- 登录后保存 token 与用户信息到 localStorage
- 底部 Tab：拆分/合并、上架、状态、转移
- 事件日志（全部）+ 我的录入历史（仅本人）
- 扫码以输入/按钮模拟
- API Base 可用 `?api=` 覆盖

### 后端（POC 服务）
- Express + lowdb（JSON 文件持久化）
- 事件驱动写入：split / merge / place / status / transfer
- Bearer Token 鉴权（内存 session）

## 启动方式

```bash
npm run dev:server
npm run dev -- --host 0.0.0.0
```

手机访问（示例）：
- 登录页：`http://<本机IP>:5173/login.html`
- 主页：`http://<本机IP>:5173/`
- 指定后端：`?api=http://<本机IP>:8787`

## 登录与鉴权

- `POST /api/login`：任意非空账号/口令都可登录
- 返回 `token` 与 `user`，客户端保存在 localStorage
- 其他 `/api/*` 需要 `Authorization: Bearer <token>`
- token 失效/未登录会被重定向至登录页

**测试账号（示例）**
- demo1 / demo1
- demo2 / demo2

## 现有流程（字段要求）

### 1) 拆分
- 输入：父培养皿 + 盘子编号 + 拆分数量
- 事件：`split`（input 为父 plant，output 为新 plant 列表）

### 2) 合并
- 输入：盘子编号 + 多个父培养皿 + 可选新培养皿编号
- 事件：`merge`（input 为父 plant，output 为新 plant）

### 3) 上架
- 输入：盘子编号 + 上架位置（架/层/位）
- 事件：`place`

### 4) 状态更新
- 输入：培养皿 ID + 状态
- 事件：`status`

### 5) 换皿/转移
- 输入：旧培养皿 ID + 新培养皿 ID
- 事件：`transfer`

## 当前 API 列表（后端已实现）

- `POST /api/login`
- `GET /api/health`（无需鉴权）
- `GET /api/meta`
- `GET /api/plants?query=`
- `GET /api/dishes?query=`
- `GET /api/events?type=&actorId=&from=&to=`
- `POST /api/events`（split/merge/place/status/transfer）

## 数据模型（POC 级）

- plant：`id, type, stage, status, dishId`
- dish：`id, plantId`
- event：`id, type, actorId, ts, inputIds, outputIds, meta`
- meta：`locations, trays, statusEnum, stages, types`

## 已知限制

- 没有真实扫码/打印，仅输入模拟
- 未实现“创建/入库”流程
- 撤销功能未开放
- 会话保存在内存中，服务重启会失效
- 无角色权限/审计细分
