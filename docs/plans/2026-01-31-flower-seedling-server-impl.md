# Flower Seedling Server Implementation (Current State)

更新日期：2026-02-01

## 目标
提供一个最小可用后端，支持 POC 所有流程事件与登录鉴权。

## 当前实现概览
- 框架：Express（ESM）
- 数据：lowdb JSON（默认 `server/data.json`）
- 鉴权：`/api/login` 返回 token，其他接口需 Bearer token
- 事件类型：split / merge / place / status / transfer
- 测试：Vitest + Supertest

## 文件结构
- `server/index.js`：启动入口
- `server/app.js`：路由与鉴权
- `server/auth.js`：内存 session
- `server/db.js`：lowdb 初始化
- `server/seed.js`：种子数据
- `server/domain.js`：事件逻辑

## API 列表

### Auth
- `POST /api/login`
  - body: `{ username, password }`
  - 返回：`{ token, user }`

### Health
- `GET /api/health`（无需鉴权）

### Meta / Entities
- `GET /api/meta`
- `GET /api/plants?query=`
- `GET /api/dishes?query=`

### Events
- `GET /api/events?type=&actorId=&from=&to=`
- `POST /api/events`
  - body: `{ type, actorId, payload }`
  - payload:
    - split: `{ parentDishId, trayId, count }`
    - merge: `{ parentDishIds[], trayId, targetDishId? }`
    - place: `{ trayId, locationId }`
    - status: `{ dishId, status }`
    - transfer: `{ fromDishId, toDishId }`

## 启动方式

```bash
npm run dev:server
```

## 已知限制
- session 存内存，服务重启即失效
- 无角色权限/细粒度控制
- 仅 POC 级校验

