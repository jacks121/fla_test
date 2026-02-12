# FLA 花苗流程管理系统 — 架构规划文档

> 版本：1.0.0 | 更新日期：2026-02-12

---

## 1. 现有架构分析

### 1.1 当前架构概况

系统分为两层：Vanilla JS 前端 + Express/SQLite 后端。前端通过 Vite 开发/构建，后端直接用 Node 运行。整体是一个典型的小型单页应用，但随着功能增长，已暴露出多处结构性问题。

### 1.2 主要问题与技术债务

#### 前端

| 编号 | 问题 | 严重程度 | 说明 |
|------|------|---------|------|
| F1 | **main.js 巨型文件** | 高 | 881 行，包含所有 Tab 渲染、事件绑定、状态管理、API 调用、表单校验。任何改动都需阅读全文件。 |
| F2 | **HTML 字符串拼接渲染** | 中 | 大量 `innerHTML = \`...\`` 字符串模板，难以维护、无类型提示、潜在 XSS 风险（虽然当前数据受控）。 |
| F3 | **全局可变 state 对象** | 中 | `const state = { meta, dishes, events, myEvents }` 是模块顶层可变对象，任何函数都可直接读写，无变更通知机制。 |
| F4 | **UI 逻辑与业务逻辑混杂** | 高 | 表单校验、API 调用、DOM 操作、状态更新、Toast 提示全部交织在同一个事件处理函数中（如 `submit.addEventListener` 中嵌套 80+ 行逻辑）。 |
| F5 | **重复代码模式** | 中 | 每个 Tab 的 `renderXxxTab()` 都重复了：wireHelpers、wireScanButtons、submit handler 中的 try/catch/handleAuthError/toast/refreshEventsAndDishes/renderEventLog/renderMyHistory 序列。 |
| F6 | **无组件复用机制** | 中 | 扫码输入、队列管理、chip 列表等 UI 片段通过函数生成 HTML 字符串，但事件绑定分散在各 render 函数中，无法真正复用。 |
| F7 | **login.html 内联脚本** | 低 | 登录页逻辑直接写在 `<script>` 标签中，与 main.js 的 API 调用方式不一致（直接用 fetch 而非 api.js）。 |
| F8 | **CSS 全部在一个文件** | 低 | styles.css 460 行，所有页面（主页、登录、管理）的样式混在一起，无逻辑分组。 |

#### 后端

| 编号 | 问题 | 严重程度 | 说明 |
|------|------|---------|------|
| B1 | **app.js 路由与业务混合** | 中 | 路由定义、请求解析、权限检查、SQL 查询（如 `GET /api/plants` 直接 `db.prepare`）、限流逻辑全在一个 155 行文件中。 |
| B2 | **domain.js 职责过重** | 中 | 包含所有领域操作 + SQL 持久化 + 事件生成，是 221 行的密集事务代码。新增操作类型需修改此文件。 |
| B3 | **SQL 注入风险** | 中 | `GET /api/plants` 和 `GET /api/dishes` 使用 `LIKE '%${q}%'` 参数化查询（实际用了 `?` 占位符），但 `GET /api/events` 动态拼接 SQL 字符串，虽然也用了参数化，可读性差。 |
| B4 | **错误处理不统一** | 中 | 有的路由 catch 后返回 `{ error: message }`，有的直接 throw。无统一错误码体系。 |
| B5 | **无请求校验层** | 中 | 所有 POST 请求的 payload 校验散布在 domain 函数内部，无法在路由层提前拒绝畸形请求。 |
| B6 | **内存限流器无清理** | 低 | `loginAttempts` Map 只增不减，长时间运行会内存泄漏。 |
| B7 | **seed.js 与 db.js 耦合** | 低 | 种子数据的插入逻辑在 db.js 中，但种子数据定义在 seed.js 中，职责边界不清。 |

#### 前后端共同

| 编号 | 问题 | 说明 |
|------|------|------|
| C1 | **双重领域实现** | `src/lib/domain.js`（客户端 Map 版）与 `server/domain.js`（服务端 SQL 版）实现相似逻辑但完全独立，容易不一致。客户端版本仅用于测试。 |
| C2 | **无统一常量定义** | 品种、阶段、状态等枚举值在 seed.js、main.js、domain.js 中分别硬编码。 |
| C3 | **测试覆盖不均** | 后端有较好的集成测试；前端仅有 domain/merge/history 的单元测试，main.js 的 UI 逻辑完全无测试。 |

---

## 2. 前端架构规划

### 2.1 设计目标

- 保持 Vanilla JS，不引入 React/Vue 等框架
- 将 main.js 拆分为可独立维护的模块
- 建立简单的状态管理和组件通信机制
- 提高可测试性

### 2.2 组件拆分策略

采用**轻量级组件模式**：每个组件是一个 ES Module，导出 `render(container)` 函数和必要的生命周期方法。组件不使用 Shadow DOM 或 Custom Elements（保持简单），仅通过约定的模式组织代码。

```
组件 = {
  render(container, props)   // 渲染 DOM 到容器，绑定事件
  destroy()                   // 清理事件监听（可选）
}
```

#### 组件拆分清单

| 组件 | 文件 | 职责 |
|------|------|------|
| SplitTab | `src/tabs/split-tab.js` | 创建/拆分/合并标签页 |
| PlaceTab | `src/tabs/place-tab.js` | 上架标签页 |
| StatusTab | `src/tabs/status-tab.js` | 状态标签页 |
| TransferTab | `src/tabs/transfer-tab.js` | 转移标签页 |
| EventLog | `src/components/event-log.js` | 事件日志列表（含展开详情） |
| MyHistory | `src/components/my-history.js` | 我的录入历史列表 |
| ScanInput | `src/components/scan-input.js` | 扫码输入框（单次/连续） |
| ChipQueue | `src/components/chip-queue.js` | 可增删的 chip 队列 |
| Toast | `src/components/toast.js` | 全局 Toast 提示 |
| AppShell | `src/app-shell.js` | 顶层壳：Header、TabBar、离线检测、路由分发 |

### 2.3 状态管理方案

替换当前全局 `state` 对象，引入一个简单的 **Store 模式**（发布-订阅）：

```js
// src/store.js
export function createStore(initialState) {
  let state = { ...initialState };
  const listeners = new Set();

  return {
    getState() { return state; },
    setState(partial) {
      state = { ...state, ...partial };
      listeners.forEach(fn => fn(state));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
}
```

**状态结构保持不变**：`{ meta, dishes, events, myEvents }`。

**使用方式**：
- 组件在 `render()` 时调用 `store.subscribe()` 注册更新回调
- 组件在 `destroy()` 时取消订阅
- API 操作完成后通过 `store.setState()` 更新状态，自动通知所有订阅者

### 2.4 事件/消息系统

组件间通信采用**事件总线**（Event Bus）：

```js
// src/event-bus.js
export function createEventBus() {
  const handlers = new Map();
  return {
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(fn);
      return () => handlers.get(event).delete(fn);
    },
    emit(event, data) {
      handlers.get(event)?.forEach(fn => fn(data));
    }
  };
}
```

**预定义事件**：

| 事件名 | 触发时机 | 数据 |
|--------|---------|------|
| `tab:switch` | 切换标签页 | `{ tab: string }` |
| `event:created` | 事件提交成功 | `{ event: object }` |
| `auth:expired` | 401 响应 | 无 |
| `toast` | 需要显示提示 | `{ message, type }` |

### 2.5 DOM 渲染策略

维持当前的 HTML 字符串模板渲染方式（成本最低），但做以下改进：

1. **模板函数提取**：将 HTML 模板从渲染逻辑中提取到 `src/templates/` 目录，每个模板是纯函数 `(data) => htmlString`
2. **局部更新**：对于列表类组件（EventLog、ChipQueue），提供 `update()` 方法做局部 DOM 更新，避免整体 `innerHTML` 重建
3. **事件委托**：在容器级别使用事件委托，减少重复的 `querySelectorAll + forEach` 模式

### 2.6 前端文件目录结构

```
src/
  main.js                     # 入口：初始化 store/bus/api，启动 AppShell
  admin.js                    # 标签打印页入口（保持独立）
  login.js                    # 登录页逻辑（从 login.html 内联脚本提取）
  store.js                    # 状态管理（createStore）
  event-bus.js                # 事件总线（createEventBus）
  app-shell.js                # 顶层壳：Header、TabBar 切换、离线检测
  tabs/
    split-tab.js              # 创建/拆分/合并
    place-tab.js              # 上架
    status-tab.js             # 状态
    transfer-tab.js           # 转移
  components/
    event-log.js              # 事件日志列表
    my-history.js             # 我的录入历史
    scan-input.js             # 扫码输入框
    chip-queue.js             # chip 队列
    toast.js                  # Toast 提示
  lib/
    api.js                    # HTTP 客户端（保持不变）
    scanner.js                # 扫码封装（保持不变）
    merge.js                  # 合并队列工具（保持不变）
    history.js                # 事件过滤工具（保持不变）
    domain.js                 # 客户端领域逻辑（保持不变，仅测试用）
    mockData.js               # 测试种子数据（保持不变）
    constants.js              # 共享常量（品种、阶段、状态枚举；事件类型标签映射）
    auth.js                   # 认证工具（token 读写、用户信息、clearAuth）
    submit.js                 # withSubmit 提交防抖封装
  styles/
    base.css                  # 重置、变量、排版
    layout.css                # 布局：app-header、tab-bar、action-row
    components.css             # 卡片、输入框、按钮、chip、toast
    pages.css                 # 登录页、管理页特有样式
    print.css                 # 打印样式
  styles.css                  # 入口，@import 上述文件
```

---

## 3. 后端架构规划

### 3.1 设计目标

- 路由层、服务层、数据层清晰分离
- 统一错误处理和请求校验
- 便于新增事件类型而不修改核心路由

### 3.2 分层架构

```
请求 → 中间件（CORS、JSON 解析、认证）
     → 路由层（参数提取、调用服务层）
     → 服务层（业务逻辑、事务编排）
     → 数据层（SQL 操作、数据映射）
```

### 3.3 路由层重构

将 app.js 中的路由按资源拆分为独立路由模块：

| 路由模块 | 路径前缀 | 职责 |
|---------|---------|------|
| `routes/auth.js` | `/api/login`, `/api/logout` | 认证相关 |
| `routes/events.js` | `/api/events` | 事件 CRUD + 撤销 |
| `routes/plants.js` | `/api/plants` | 花苗查询 |
| `routes/dishes.js` | `/api/dishes` | 培养皿查询 |
| `routes/meta.js` | `/api/meta` | 元数据 |
| `routes/admin.js` | `/api/admin/*` | 管理员接口 |

`app.js` 简化为中间件注册 + 路由挂载 + 错误处理。

### 3.4 服务层拆分

将 domain.js 按操作类型拆分：

| 模块 | 文件 | 职责 |
|------|------|------|
| EventService | `services/event-service.js` | 事件调度：根据 type 分发到具体处理函数 |
| PlantService | `services/plant-service.js` | create、split、merge 操作 |
| StatusService | `services/status-service.js` | updateStatus 操作 |
| TransferService | `services/transfer-service.js` | transfer 操作 |
| UndoService | `services/undo-service.js` | undo 操作 |
| QueryService | `services/query-service.js` | 只读查询（plants/dishes/events 列表） |

### 3.5 数据层

保持当前 db.js 的 `createDb()` 模式，但将预编译语句（prepared statements）按实体组织：

| 模块 | 文件 | 职责 |
|------|------|------|
| PlantRepo | `repos/plant-repo.js` | plants 表 CRUD |
| DishRepo | `repos/dish-repo.js` | dishes 表 CRUD |
| EventRepo | `repos/event-repo.js` | events 表 CRUD |

每个 Repo 导出工厂函数 `createXxxRepo(db)`，返回操作对象。

### 3.6 中间件设计

| 中间件 | 文件 | 职责 |
|--------|------|------|
| errorHandler | `middleware/error-handler.js` | 统一错误响应格式 |
| validateBody | `middleware/validate.js` | 请求体校验（基于 schema 对象） |
| rateLimiter | `middleware/rate-limiter.js` | 登录限流（带过期清理） |
| authenticate | `middleware/auth.js`（从 auth.js 提取） | Token 认证 |
| requireAdmin | `middleware/auth.js` | 管理员权限检查 |

### 3.7 统一错误处理

```js
// middleware/error-handler.js
// 所有路由的 catch 都抛 AppError，由此中间件统一处理

class AppError extends Error {
  constructor(message, statusCode = 400, code = 'BAD_REQUEST') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}
```

错误响应格式统一为：

```json
{
  "error": "错误消息（面向用户）",
  "code": "ERROR_CODE（面向程序）"
}
```

### 3.8 后端文件目录结构

```
server/
  index.js                    # 入口：启动 HTTP/HTTPS 服务器
  app.js                      # Express 实例：中间件注册 + 路由挂载 + 错误处理
  db.js                       # 数据库初始化（保持不变）
  seed.js                     # 种子数据定义（保持不变）
  password.js                 # 密码哈希工具（保持不变）
  add-user.js                 # CLI 添加用户（保持不变）
  backup.js                   # 数据库备份（保持不变）
  migrate-json-to-sqlite.js   # 迁移脚本（保持不变）
  errors.js                   # AppError 类定义 + 错误码常量
  routes/
    auth.js                   # POST /api/login, POST /api/logout
    events.js                 # GET/POST /api/events, POST /api/events/undo
    plants.js                 # GET /api/plants
    dishes.js                 # GET /api/dishes
    meta.js                   # GET /api/meta
    admin.js                  # GET /api/admin/users
  services/
    event-service.js          # 事件调度
    plant-service.js          # 创建/拆分/合并
    status-service.js         # 状态更新
    transfer-service.js       # 转移
    undo-service.js           # 撤销
    query-service.js          # 只读查询
  repos/
    plant-repo.js             # plants 表操作
    dish-repo.js              # dishes 表操作
    event-repo.js             # events 表操作
  middleware/
    error-handler.js          # 统一错误处理
    validate.js               # 请求体校验
    rate-limiter.js           # 登录限流
    auth.js                   # 认证 + 权限中间件
  __tests__/                  # 测试文件（保持现有结构）
```

---

## 4. 设计原则在本项目的具体应用

### 4.1 单一职责（SRP）

| 当前问题 | 重构方案 |
|---------|---------|
| main.js 负责所有 UI 渲染、状态管理、事件处理 | 按 Tab 拆分为独立模块，每个模块只管自己的渲染和事件 |
| server/domain.js 包含所有领域操作 + SQL + 事件生成 | 拆分为 services（业务逻辑）和 repos（数据操作） |
| app.js 包含路由 + 限流 + 认证 + SQL 查询 | 路由按资源拆分，限流/认证提取为中间件 |

**每个文件的职责边界**：
- **Tab 组件**：渲染自己的表单 UI，收集用户输入，调用 API，处理结果
- **通用组件**：提供可复用的 UI 片段（ScanInput、ChipQueue），不包含业务逻辑
- **Store**：持有状态，通知订阅者，不包含任何 API 调用或 DOM 操作
- **路由**：参数提取、调用 service、返回响应，不包含业务逻辑
- **Service**：业务规则校验、事务编排，不直接操作 SQL
- **Repo**：纯 SQL 操作，不包含业务规则

### 4.2 开闭原则（OCP）

**新增事件类型的扩展方式**：

当前 app.js 中的 `switch (type)` 和 domain.js 中每个操作都需修改两个文件。重构后：

1. 在 `services/` 中新建一个 service 文件
2. 在 `event-service.js` 的事件类型注册表（Map/Object）中注册新处理函数
3. 前端新建一个 Tab 组件，在 `app-shell.js` 的 Tab 列表中注册

```js
// services/event-service.js
const handlers = {
  create: plantService.create,
  split: plantService.split,
  merge: plantService.merge,
  place: placeService.place,
  status: statusService.updateStatus,
  transfer: transferService.transfer,
};

export function dispatch(type, payload) {
  const handler = handlers[type];
  if (!handler) throw new AppError(`不支持的事件类型: ${type}`, 400, 'INVALID_EVENT_TYPE');
  return handler(payload);
}

// 新增事件类型只需：handlers.newType = newService.handle;
```

### 4.3 依赖倒置（DIP）

**模块间依赖关系**（箭头表示依赖方向）：

```
前端：
  Tab 组件 → store（读状态）
  Tab 组件 → event-bus（发事件）
  Tab 组件 → api.js（调接口）
  Tab 组件 → 通用组件（ScanInput、ChipQueue）
  AppShell → Tab 组件（按 tab 名动态选择）
  AppShell → store, event-bus

后端：
  routes → services（调用业务方法）
  services → repos（调用数据方法）
  services → errors.js（抛业务错误）
  repos → db（SQL 执行）
  app.js → routes, middleware
```

**依赖注入方式**：
- 后端通过工厂函数传入 `db` 对象：`createPlantRepo(db)`、`createPlantService(repos)` 等
- 前端通过模块导入的 store/bus 单例通信，组件本身不持有 API 或 store 引用，而是通过参数注入

### 4.4 DRY（消除重复）

| 重复模式 | 消除方案 |
|---------|---------|
| 每个 Tab 的 `wireHelpers` + `wireScanButtons` 调用 | 在 ScanInput、ChipQueue 组件内部自动完成事件绑定 |
| 每个 submit handler 的 `try/catch/handleAuthError/toast/refresh` 序列 | 提取为 `submitAction(fn)` 高阶函数，统一处理提交流程 |
| 品种、阶段、状态枚举在多处硬编码 | 统一到 `src/lib/constants.js` 和 `server/seed.js`（后端唯一来源），前端从 `/api/meta` 获取 |
| `renderEventItem` 和事件过滤逻辑在 EventLog 和 MyHistory 中重复 | 提取 EventLog 为通用组件，通过 props（过滤函数、标题）区分 |
| 前后端 domain.js 双重实现 | 保留服务端为唯一权威实现；客户端 domain.js 仅保留用于单元测试，明确标注不用于生产 |

---

## 5. 命名规范

### 5.1 文件名

| 类型 | 格式 | 示例 |
|------|------|------|
| 前端组件 | `kebab-case.js` | `split-tab.js`, `scan-input.js` |
| 后端模块 | `kebab-case.js` | `event-service.js`, `plant-repo.js` |
| 测试文件 | `<模块名>.test.js` | `split-tab.test.js`, `event-service.test.js` |
| CSS 文件 | `kebab-case.css` | `base.css`, `components.css` |
| 配置文件 | 保持现有命名 | `vite.config.js`, `package.json` |

### 5.2 函数名

| 类型 | 格式 | 示例 |
|------|------|------|
| 工厂函数 | `createXxx` | `createStore()`, `createApi()`, `createPlantRepo(db)` |
| 渲染函数 | `renderXxx` | `renderSplitTab(container)` |
| 事件处理 | `handleXxx` 或 `onXxx` | `handleSubmit()`, `onTabSwitch()` |
| 布尔判断 | `isXxx` / `hasXxx` | `isAuthenticated()`, `hasDish()` |
| 数据获取 | `getXxx` / `findXxx` | `getPlantById()`, `findDishById()` |
| 数据修改 | 动词开头 | `insertPlant()`, `deleteDish()`, `updateStatus()` |

### 5.3 变量名

| 类型 | 格式 | 示例 |
|------|------|------|
| 普通变量 | `camelCase` | `parentDishId`, `trayList` |
| 常量 | `UPPER_SNAKE_CASE` | `SESSION_TTL_MS`, `RATE_LIMIT_MAX` |
| DOM 元素引用 | `xxxEl` 后缀 | `submitEl`, `queueEl` |
| 组件实例 | `xxxComponent` | `splitTabComponent` |

### 5.4 CSS 类名

采用 **BEM-lite** 命名：

| 类型 | 格式 | 示例 |
|------|------|------|
| 块 | `kebab-case` | `.event-log`, `.scan-input` |
| 元素 | `block__element` | `.event-log__item`, `.scan-input__button` |
| 修饰符 | `block--modifier` | `.event-log--filtered`, `.tab--active` |
| 状态 | `.is-xxx` | `.is-expanded`, `.is-offline` |

> 注意：现有 CSS 类名（如 `.card`, `.chip`, `.toast`）在重构初期可保留不变，逐步迁移到 BEM 命名。

---

## 6. 测试策略

### 6.1 测试分层

| 层级 | 工具 | 目标 | 覆盖范围 |
|------|------|------|---------|
| 单元测试 | Vitest | 纯函数、工具模块 | constants、merge、history、store、event-bus、repos |
| 组件测试 | Vitest + jsdom | 前端组件渲染与交互 | Tab 组件、通用组件 |
| 集成测试 | Vitest + Supertest | API 端到端 | routes + services + repos |
| E2E 测试 | 待定（Playwright） | 关键用户流程 | 登录、创建、拆分、撤销 |

### 6.2 测试文件组织

```
src/
  __tests__/
    merge.test.js              # 保留
    history.test.js            # 保留
    api.test.js                # 保留
    scanner.test.js            # 保留
    store.test.js              # 新增
    event-bus.test.js          # 新增
  tabs/__tests__/
    split-tab.test.js          # 新增
    place-tab.test.js          # 新增
    status-tab.test.js         # 新增
    transfer-tab.test.js       # 新增
  components/__tests__/
    chip-queue.test.js         # 新增
    event-log.test.js          # 新增

server/
  __tests__/
    events.test.js             # 保留
    meta.test.js               # 保留
    auth.test.js               # 保留
    db.test.js                 # 保留
    domain.test.js             # 保留
    routes.test.js             # 保留
    password.test.js           # 保留
  services/__tests__/
    plant-service.test.js      # 新增
    undo-service.test.js       # 新增
  repos/__tests__/
    plant-repo.test.js         # 新增
    dish-repo.test.js          # 新增
    event-repo.test.js         # 新增
```

### 6.3 测试原则

1. **服务端测试**：每个测试用 `createDb({ memory: true })` 创建隔离数据库，保持现有模式
2. **前端组件测试**：使用 jsdom 环境，创建容器 div，调用组件 `render(container, props)`，断言 DOM 结构和交互
3. **重构期间**：先保证现有测试全部通过，再逐步添加新测试
4. **新功能**：先写测试，再实现

---

## 7. 约束条件

### 7.1 必须保持

| 约束 | 说明 |
|------|------|
| Vanilla JS 前端 | 不引入 React、Vue、Svelte 等 UI 框架 |
| Express 后端 | 不更换为 Fastify、Koa 等 |
| SQLite (better-sqlite3) | 不更换数据库 |
| 现有 API 接口兼容 | 所有 `/api/*` 的请求/响应格式保持不变 |
| 现有 HTML 入口 | `index.html`、`login.html`、`admin.html` 三个入口保持不变 |
| 现有测试全部通过 | 重构过程中不得破坏现有测试 |

### 7.2 可以引入

| 包/工具 | 用途 | 理由 |
|---------|------|------|
| 无 | — | 当前依赖已足够支撑重构。如无明确需求不引入新依赖。 |

### 7.3 重构策略

采用**渐进式重构**，分阶段执行：

| 阶段 | 内容 | 前置条件 |
|------|------|---------|
| 阶段 1 | 提取 `constants.js`、`auth.js`（前端）、`submit.js` 等工具模块 | 无 |
| 阶段 2 | 拆分 main.js 为 app-shell + 4 个 Tab 组件 | 阶段 1 |
| 阶段 3 | 引入 store.js 和 event-bus.js，替换全局 state | 阶段 2 |
| 阶段 4 | 提取通用组件（ScanInput、ChipQueue、EventLog、Toast） | 阶段 2 |
| 阶段 5 | 后端路由拆分（routes/） | 无，可与前端并行 |
| 阶段 6 | 后端 services + repos 拆分 | 阶段 5 |
| 阶段 7 | 统一错误处理 + 请求校验中间件 | 阶段 6 |
| 阶段 8 | CSS 拆分 | 无，可独立执行 |
| 阶段 9 | 补充前端组件测试 | 阶段 4 |

每个阶段完成后运行全量测试，确保不引入回归。
