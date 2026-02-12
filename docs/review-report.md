# FLA 花苗流程管理系统 — 代码审核报告

> 审核日期：2026-02-12 | 审核范围：重构后的前后端全部代码

---

## 1. 审核摘要

### 1.1 总体评价

重构工作质量**良好**，成功将原来的巨型单文件架构拆分为清晰的分层结构。后端实现了 routes/services/repos 三层分离，前端实现了 app-shell + tabs + components 的组件化拆分。所有 95 项测试全部通过，生产构建正常。

### 1.2 数据统计

| 指标 | 数值 |
|------|------|
| 测试文件 | 12 |
| 测试用例 | 95 (全部通过) |
| 后端文件 | 30+ (.js) |
| 前端文件 | 30+ (.js/.css) |
| 构建产物大小 | CSS 25KB, JS 397KB (gzip ~115KB) |

---

## 2. 发现的问题列表

### Critical (严重)

#### C1. 后端缺少全局错误处理中间件

**位置**: `server/app.js`

**描述**: `app.js` 定义了 `errorHandler` 中间件（`server/middleware/error-handler.js`），但**从未注册到 Express 应用中**。所有路由中使用 try/catch 手动 `res.status(400).json(...)` 来处理错误。这意味着：
- 如果任何路由处理器抛出未捕获的异常，Express 将返回默认的 500 HTML 错误页面而非 JSON
- `errorHandler` 中间件被创建但完全未使用，成为死代码
- 违背了架构规划中"统一错误处理"的设计目标

**影响**: 意外异常会导致前端收到 HTML 而非 JSON，可能导致 `res.json()` 解析失败。

**修复方案**: 在 `app.js` 中 `createApp()` 函数末尾、`return app;` 之前注册 `errorHandler` 中间件，并将路由中的手动 try/catch 逐步迁移为 `next(err)` 模式。

**状态**: 已修复

---

#### C2. 前端 XSS 风险 — 用户名未转义直接插入 HTML

**位置**: `src/app-shell.js:47`, `src/tabs/more-tab.js:28`

**描述**: `user.name` 来自 localStorage（由服务端登录响应存入），直接通过字符串模板插入 HTML：
```js
${user?.name ? `<span class="app-bar__user">${user.name}</span>` : ''}
```
如果攻击者能控制用户名（例如通过 `npm run add-user` 创建含 `<script>` 标签的用户名），则可导致 XSS。

**影响**: 存储型 XSS。虽然当前 `add-user.js` 没有对用户名做校验，但管理员可创建恶意用户名。

**修复方案**: 创建 `escapeHtml()` 工具函数，在所有用户输入插入 HTML 模板前进行转义。

**状态**: 已修复

---

#### C3. 前端 XSS 风险 — Toast 消息未转义

**位置**: `src/components/toast.js:36`

**描述**: toast 消息直接通过 `innerHTML` 设置：
```js
el.innerHTML = `<span class="toast__icon">...</span><span class="toast__text">${msg}</span>`;
```
当 toast 显示服务端返回的错误消息或用户扫码输入的内容时，如果包含 HTML 标签则会被解析执行。

例如 `src/tabs/scan-tab.js:68`:
```js
toast(`未识别: ${trimmed}`, 'warning');
```
如果 QR 码内容为 `<img src=x onerror=alert(1)>`，则触发 XSS。

**影响**: 反射型 XSS，通过恶意二维码触发。

**修复方案**: 对 toast 中的 `msg` 参数进行 HTML 转义。

**状态**: 已修复

---

#### C4. 前端 XSS 风险 — 事件日志中 meta 数据未转义

**位置**: `src/components/event-log.js:46`

**描述**: 事件详情中直接将 `JSON.stringify(e.meta)` 插入 HTML：
```js
`<div>详情: ${JSON.stringify(e.meta)}</div>`
```
以及 `metaText()` 函数中的 `e.meta.trayId`、`e.meta.fromDishId` 等字段直接拼接到 HTML。

虽然这些数据来自服务端且当前服务端不校验值的格式，如果有人手动构造 API 请求发送含 HTML 的 trayId，这些内容会被浏览器解析。

**影响**: 存储型 XSS，通过构造恶意 API 请求注入。

**修复方案**: 对所有动态插入 HTML 的用户可控数据进行转义。

**状态**: 已修复

---

### Major (重要)

#### M1. 后端 `middleware/auth.js` 中间件未被使用

**位置**: `server/middleware/auth.js`

**描述**: 架构规划中设计了独立的认证中间件 `createAuthMiddleware(auth)`，该文件存在但从未被导入或使用。实际使用的是 `server/auth.js` 中 `createAuth(db)` 返回的 `authenticate` 和 `requireAdmin` 方法。两处代码逻辑完全重复。

**影响**: 死代码，增加维护混淆风险。新开发者可能修改了错误的文件。

**修复方案**: 删除 `server/middleware/auth.js`，或者修改 `app.js` 使用此中间件并从 `auth.js` 中移除 authenticate/requireAdmin。选择后者更符合架构规划（分离关注点）。

**状态**: 已修复（删除死代码文件）

---

#### M2. 拆分操作缺少 trayId 校验

**位置**: `server/services/plant-service.js:27-49`

**描述**: `split` 操作的服务层不校验 `trayId` 是否提供。虽然前端有校验，但 API 可以直接被调用。`create` 操作有 `if (!trayId) throw` 校验，`split` 操作却没有。

**影响**: 可通过直接调用 API 创建缺少 trayId 的拆分事件，导致数据不完整。

**修复方案**: 在 `split` 事务函数开头添加 `if (!trayId) throw new AppError('缺少盘子编号')` 校验。

**状态**: 已修复

---

#### M3. 合并操作缺少 trayId 校验

**位置**: `server/services/plant-service.js:51-73`

**描述**: 与 M2 类似，`merge` 操作不校验 `trayId`。

**修复方案**: 添加 `if (!trayId) throw new AppError('缺少盘子编号')` 校验。

**状态**: 已修复

---

#### M4. 状态更新缺少 status 值的枚举校验

**位置**: `server/services/status-service.js:4`

**描述**: `updateStatus` 接受任意 `status` 值，不校验是否为合法枚举值（正常/感染/变异）。前端虽然通过按钮限制了选择，但 API 可直接调用传入任意字符串。

**影响**: 数据完整性问题，可能存入非法状态值。

**修复方案**: 添加状态值枚举校验。

**状态**: 已修复

---

#### M5. 事件路由中 actorId 来源于 body 的残留

**位置**: `src/tabs/ops/create-page.js:113`, `src/tabs/ops/split-page.js:112`, 等所有前端操作页面

**描述**: 前端在 `postEvent` 调用中仍然发送 `actorId: currentActorId()`，但后端 `routes/events.js:25` 已正确使用 `req.user.id` 覆盖客户端的 actorId。虽然安全性没问题（有测试 `routes.test.js:111-124` 验证了这一点），但前端发送 actorId 是冗余的，容易让人误以为客户端的 actorId 被使用。

**影响**: 代码可读性和维护性问题。

**修复方案**: 此项为 Minor 级别，暂不修改，标记为改进建议。

---

#### M6. 自动生成培养皿 ID 使用 Math.random() 可能冲突

**位置**: `src/tabs/ops/merge-page.js:104`, `src/tabs/ops/transfer-page.js:65`

**描述**: 合并和转移页面的"自动生成编号"按钮使用 `Math.floor(Math.random() * 900 + 100)` 生成 3 位随机数作为 ID，格式为 `ND-XXX`。在大量操作后，这可能产生冲突。

**影响**: 用户体验问题 — 如果生成了已存在的 ID，提交时会报错。虽然可以重新生成，但体验不佳。

**修复方案**: 可以从后端获取下一个可用 ID 或者增大随机范围。此项为 Minor 级别，暂不修改。

---

### Minor (轻微)

#### m1. `server/domain.js` 成为薄包装层

**位置**: `server/domain.js`

**描述**: 重构后 `domain.js` 仅作为 repos 和 services 的组装器，将方法简单暴露出去。它主要服务于现有测试（`server/__tests__/domain.test.js`）。这不算问题，但需注意它和 `app.js` 中的组装逻辑是重复的。

**影响**: 轻微的代码重复。

**建议**: 保持现状，它确保了 domain 层测试的独立性，是合理的设计。

---

#### m2. 历史记录固定 50 条限制

**位置**: `src/tabs/history-tab.js:42`

**描述**: 历史 Tab 硬编码 `filtered.slice(0, 50)`，但 UX 规划中提到了"无限滚动加载"。当前实现为静态截取。

**建议**: 可作为后续优化，当前 POC 阶段可接受。

---

#### m3. 总览页使用 dishes.length 作为花苗总数

**位置**: `src/tabs/overview-tab.js:8`

**描述**: `const totalPlants = state.dishes?.length || 0;` 使用培养皿数量作为"培养皿总数"显示。这在当前一对一关系下是正确的，但标签显示为"培养皿总数"更准确（已正确标注）。

---

#### m4. 前端 GET dishes API 返回的数据缺少花苗详情

**位置**: `server/repos/dish-repo.js:11`

**描述**: dishes 查询只返回 `{id, plantId}`，不包含花苗的品种、阶段、状态信息。前端拆分/状态/转移页面的 `showPlantInfo()` 函数只能显示 `dish.id` 和 `dish.plantId`，无法显示品种和阶段。这与 UX 规划中"显示父培养皿信息卡片（品种、阶段、当前状态）"不符。

**建议**: 后续可增加 JOIN 查询或提供 dish 详情接口。当前功能正确但信息不够丰富。

---

#### m5. CSS 中 `#scan-overlay` 层级可能与 dialog 冲突

**位置**: `src/styles/pages.css:93`

**描述**: 扫码覆盖层 z-index 为 `calc(var(--z-overlay) + 10)` = 60，dialog-overlay 为 `var(--z-overlay)` = 50。如果在 dialog 打开时同时触发扫码，扫码层会正确覆盖在 dialog 之上，这是期望行为。

---

#### m6. batch 状态巡检模式的"确认提交全部"按钮功能不完整

**位置**: `src/tabs/ops/status-page.js:193-256`

**描述**: 批量巡检模式下，每扫一个培养皿就立即提交到服务端（第 201-215 行），然后"确认提交全部"按钮实际只是刷新数据和显示汇总页面。这意味着：
1. 该按钮的 `disabled` 初始状态和文案暗示需要"确认提交"，但实际每条已经提交了
2. 如果某条提交失败，用户可能认为还没有提交

**建议**: 将按钮文案改为"查看汇总"更准确，或改为批量收集后统一提交。

---

## 3. 业务逻辑对照检查

### 3.1 创建操作

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 品种下拉选择 | OK | 从 meta API 获取 |
| 阶段下拉选择 | OK | 从 meta API 获取 |
| 数量 1-50 限制 | OK | 前后端均校验 |
| 盘子编号 | OK | 支持扫码和手输 |
| 自增 ID 生成 | OK | plantRepo.nextId() / dishRepo.nextId() |
| 默认状态"正常" | OK | 硬编码 '正常' |
| 事务包裹 | OK | db.transaction() |

### 3.2 拆分操作

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 父皿存在性验证 | OK | |
| 子代继承品种阶段 | OK | |
| 子代默认状态"正常" | OK | |
| 数量限制 1-50 | OK | |
| trayId 校验 | **已修复** | 原缺失 |

### 3.3 合并操作

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 至少一个父皿 | OK | |
| 目标皿不与父皿重复 | OK | |
| 目标皿不可已被占用 | OK | |
| 产物品种"合并苗" | OK | |
| 产物阶段"萌发" | OK | |
| 产物状态"正常" | OK | |
| trayId 校验 | **已修复** | 原缺失 |
| 队列管理 (连扫/手输/粘贴/移除/清空) | OK | |

### 3.4 上架操作

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 两阶段工作流 | OK | 锁定位置 -> 添加盘子 |
| 每个盘子分别创建 place 事件 | OK | |
| 不修改花苗数据 | OK | 纯元数据事件 |
| 重复盘子提示 | OK | |
| 连续扫码支持 | OK | |

### 3.5 状态更新

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 培养皿存在性验证 | OK | |
| 保存旧状态 | OK | meta.oldStatus |
| 直接更新花苗 status | OK | |
| 状态值枚举校验 | **已修复** | 原缺失 |
| 批量巡检模式 | OK | 新增功能 |

### 3.6 转移操作

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 旧皿必须存在 | OK | |
| 新皿不可存在 | OK | |
| 删旧建新 | OK | |
| 更新花苗 dishId | OK | |

### 3.7 撤销操作

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 只能撤销自己的操作 | OK | actorId 来自 session |
| 不能连续撤销 | OK | |
| 5 分钟窗口 | OK | |
| create/split/merge 撤销 | OK | 删除 outputIds 对应的花苗和皿 |
| status 撤销 | OK | 恢复 oldStatus |
| transfer 撤销 | OK | 删新皿、恢复旧皿 |
| place 撤销 | OK | 无操作 |

### 3.8 认证流程

| 检查项 | 状态 | 说明 |
|--------|------|------|
| scrypt 密码哈希 | OK | |
| timingSafeEqual | OK | |
| 7 天会话过期 | OK | |
| 登录限速 5次/分钟/IP | OK | 带过期清理 |
| 通用错误消息 | OK | |
| 管理员路由保护 | OK | |
| actorId 服务端覆盖 | OK | |

---

## 4. 架构评价

### 4.1 后端架构

**优点**:
- routes/services/repos 三层分离清晰
- 依赖注入模式（工厂函数传入 db/repos）便于测试
- AppError 类统一错误定义
- 事务使用 `db.transaction()` 保证原子性
- 限流器带自动清理（解决了原架构文档中提到的 B6 问题）

**需改进**:
- errorHandler 中间件需要实际注册（已修复）
- 部分校验逻辑缺失（已修复）

### 4.2 前端架构

**优点**:
- main.js 从 881 行拆分为 20+ 个小模块
- store + event-bus 的发布-订阅模式简洁有效
- tab 组件各自独立，职责清晰
- scan-input、chip-queue 等通用组件可复用
- withSubmit 封装避免了重复的提交防抖代码
- 离线检测功能保留并增强（脉冲动画）

**需改进**:
- HTML 模板中对用户可控数据缺乏转义（已修复）

### 4.3 CSS 架构

**优点**:
- 从单文件拆分为 base/layout/components/pages/print 五个模块
- CSS 自定义属性体系完整
- BEM-lite 命名基本一致
- 响应式设计（手机 540px / 平板 720px）
- 安全区适配（env(safe-area-inset-bottom)）
- 打印样式独立

---

## 5. 修复记录

| 问题 | 严重性 | 修复说明 |
|------|--------|----------|
| C1 | Critical | 在 app.js 中注册 errorHandler 中间件 |
| C2/C3/C4 | Critical | 创建 escapeHtml 工具函数，在 app-shell、more-tab、toast、event-log、scan-tab、chip-queue、各操作页面中对用户可控数据进行转义 |
| M1 | Major | 删除未使用的 server/middleware/auth.js |
| M2 | Major | split 操作添加 trayId 校验 |
| M3 | Major | merge 操作添加 trayId 校验 |
| M4 | Major | status 操作添加状态枚举校验 |

---

## 6. 测试验证

修复后重新运行：
- `npm test` — 12 个测试文件，95 项用例全部通过
- `npm run build` — 构建成功 (CSS 25KB, JS 398KB, gzip ~116KB)

### 修改文件清单

**新增文件：**
- `src/lib/escape.js` — escapeHtml 工具函数

**删除文件：**
- `server/middleware/auth.js` — 死代码

**修改文件：**
- `server/app.js` — 注册 errorHandler 中间件
- `server/services/plant-service.js` — split/merge 添加 trayId 校验
- `server/services/status-service.js` — 添加状态枚举校验
- `src/app-shell.js` — escapeHtml(user.name)
- `src/tabs/more-tab.js` — escapeHtml(user.name)
- `src/tabs/scan-tab.js` — escapeHtml(dishId) in action sheet
- `src/tabs/overview-tab.js` — escapeHtml(outputIds)
- `src/components/toast.js` — escapeHtml(msg)
- `src/components/event-log.js` — escapeHtml(meta fields, inputIds, outputIds)
- `src/components/chip-queue.js` — escapeHtml(id) in chip text and data attributes
