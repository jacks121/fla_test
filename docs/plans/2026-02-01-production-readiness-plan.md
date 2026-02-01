# 花苗流程自动化：POC → 生产化完整计划

更新日期：2026-02-01

## 背景与约束

- 用户规模：小团队（<10 人），单花房/实验室
- 部署：兼顾局域网内部署和云服务器两种方式
- 扫码：先做手机摄像头扫二维码
- 数据可靠性：实用主义（SQLite + 定期备份）
- 当前状态：POC 已完成四个核心流程演示，但不具备生产可用性

---

## Phase 1：数据层升级

**目标**：把 lowdb JSON 换成 SQLite，解决数据可靠性和并发问题。

### 1.1 lowdb → SQLite（better-sqlite3）

- 安装 better-sqlite3，替换 lowdb
- 建表结构：

```sql
CREATE TABLE plants (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '正常',
  dish_id TEXT
);

CREATE TABLE dishes (
  id TEXT PRIMARY KEY,
  plant_id TEXT REFERENCES plants(id)
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  input_ids TEXT,    -- JSON array
  output_ids TEXT,   -- JSON array
  meta TEXT          -- JSON object
);

CREATE TABLE locations (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL
);

CREATE TABLE trays (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

- events 表保持 append-only，inputIds/outputIds/meta 用 JSON 字段存储
- 写一次性迁移脚本：读 data.json → 写入 SQLite

### 1.2 Session 持久化

- 把内存 Map sessions 改为读写 sessions 表
- 服务重启后登录状态不丢失
- 可选：增加 session 过期时间（如 7 天）

### 1.3 server/db.js 重构

- createDb() 返回封装好的 db 对象，提供 get/insert/update/query 方法
- 测试模式仍用内存 SQLite（`:memory:`）
- domain.js 中的数组操作改为 SQL 查询

### 1.4 数据备份

- 提供 `npm run backup` 脚本：复制 .sqlite 文件到 backups/ 目录，带时间戳
- 部署时用 cron 每天定时执行

**交付物**：数据库迁移完成，现有测试全部通过，data.json 不再使用。

---

## Phase 2：功能补全

**目标**：补齐生产缺失的业务流程。

### 2.1 创建/入库流程

当前系统缺少"第一批苗从哪来"的入口，只能拆分已有种子数据。

- 新增事件类型 `create`
- POST /api/events payload：`{ type: "create", payload: { type, stage, count, trayId } }`
- 服务端：批量生成 plant + dish，返回 create 事件
- 前端：在拆分/合并 Tab 的模式选择中增加"创建"选项，输入品种、阶段、数量、盘子编号
- 种子数据改为空数据库 + 引导用户通过创建流程初始化

### 2.2 撤销功能

前端 undo 按钮已存在但禁用。

- 服务端：新增 `POST /api/events/undo`
  - 查找当前用户最近一条事件
  - 根据事件类型反转副作用（split → 删除子 plant/dish；merge → 删除合并结果；transfer → 还原 dish 绑定；status → 还原旧状态）
  - 插入一条 type=undo 的事件记录
  - 限制：只能撤销自己的操作，仅限最近 1 步，5 分钟内
- 前端：启用 undo 按钮，显示"将撤销：XXX"确认弹窗

### 2.3 批量上架优化

当前上架是"一盘一位"逐条提交，效率低。

- 改为"位置锁定 + 多盘连扫"模式：
  - 先选/扫位置码 → 位置锁定显示在顶部
  - 连续扫/选多个盘子，每扫一个立即显示在列表中
  - 点"完成上架"一次性提交（或逐条提交，前端批量调用）
- 后端无需改动（仍然是多条 place 事件），改动集中在前端交互

### 2.4 输入校验加强

- 前端：
  - 扫码/输入后立即校验 ID 是否存在于本地 state
  - 重复操作警告（同一皿 30 秒内重复提交）
  - 转移时校验旧皿存在、新皿为空
- 服务端：
  - domain 函数已有基本校验，补充：合并时父皿不能包含目标皿、拆分数量上限

**交付物**：创建、撤销、批量上架流程可用，校验覆盖常见错误。

---

## Phase 3：手机扫码接入

**目标**：用手机摄像头扫真实二维码，替代手动输入。

### 3.1 二维码扫描库集成

- 集成 html5-qrcode 库（轻量、纯浏览器端、支持摄像头调用）
- 封装为 `src/lib/scanner.js` 模块：
  - `startScan(onResult)` — 打开摄像头、识别二维码、回调返回文本
  - `stopScan()` — 关闭摄像头
- 扫码 UI：每个输入框旁增加"扫码"图标按钮，点击后弹出摄像头视图
- 扫码结果自动填入对应输入框，然后关闭摄像头

### 3.2 二维码生成与打印

- 新增管理页面 `/admin.html`（或 Tab）：
  - 批量生成培养皿二维码（内容为 dish ID）
  - 批量生成位置二维码（内容为 location ID）
  - 渲染为可打印的网格布局（每页 N 个标签）
  - 使用 qrcode 库（如 qrcode-generator）在前端生成 SVG
- 二维码内容格式：纯文本 ID（如 `D-42`、`rack-A1`），简单可靠
- 支持 window.print() 直接打印

### 3.3 连续扫码模式

- 批量场景（上架、合并的父皿队列）支持"连续扫码"：
  - 摄像头保持打开
  - 每扫到一个码，自动加入队列并发出提示音/震动
  - 重复码自动跳过并警告
  - 手动点"完成"结束扫码

**交付物**：所有输入框支持扫码填入，可打印标签，批量场景支持连续扫。

---

## Phase 4：安全与鉴权加固

**目标**：达到生产环境的基本安全要求。

### 4.1 密码与登录

- 服务端预配置用户列表（存 SQLite users 表），包含 username + bcrypt 密码哈希
- 拒绝无效凭证（当前任意密码都能登录）
- 登录失败限速（同一 IP 5 次/分钟）
- 提供 `npm run add-user <username> <password>` CLI 脚本管理用户

### 4.2 Session 安全

- Session token 增加过期时间（默认 7 天）
- 登出时删除服务端 session 记录
- 前端 token 过期后自动跳转登录页

### 4.3 HTTPS

- 局域网部署：用 mkcert 生成本地 CA 证书，Vite 和 Express 都启用 HTTPS（摄像头 API 要求 HTTPS 或 localhost）
- 云部署：反向代理（nginx/caddy）+ Let's Encrypt
- 提供部署文档说明两种方式的配置步骤

### 4.4 基本权限

- 小团队不需要复杂 RBAC，但区分两个角色：操作员（正常使用）和管理员（可访问 admin 页面、管理用户）
- users 表增加 role 字段（operator / admin）
- admin 路由增加角色校验中间件

**交付物**：真实密码验证、session 过期、HTTPS 配置文档、基本角色区分。

---

## Phase 5：前端体验打磨

**目标**：适配真实使用场景的体验问题。

### 5.1 离线提示与断线恢复

- 检测网络状态（navigator.onLine + fetch 失败）
- 断网时顶部显示"离线"横幅，禁止提交操作
- 恢复网络后自动重新加载数据
- 不做离线队列（小团队 + 局域网场景下断网概率低，复杂度不值得）

### 5.2 操作反馈优化

- 提交成功后 toast 增加事件摘要（如"拆分 D-1 → 3 份"）
- 扫码成功震动反馈（navigator.vibrate）
- 提交按钮 loading 状态（当前已有，保持）

### 5.3 事件日志增强

- "我的历史"支持按类型筛选
- 事件日志支持按时间范围筛选
- 点击事件可展开详情（完整 meta 信息）

### 5.4 响应式适配

- 当前已是移动优先设计，检查 iPad/平板横屏布局
- 管理员打印页面适配桌面浏览器

**交付物**：离线提示、操作反馈、日志筛选、响应式适配。

---

## Phase 6：测试与质量保障

**目标**：生产上线前的测试覆盖。

### 6.1 服务端测试补全

- 为新增的 create、undo 事件类型编写测试
- 校验逻辑的边界测试（重复 ID、空输入、超大数量）
- SQLite 迁移后的数据库集成测试
- 用户认证测试（错误密码拒绝、session 过期）

### 6.2 前端测试

- 扫码模块 mock 测试（scanner.js 的回调逻辑）
- API client 对 401 响应的处理测试
- normalizeParentIds、filterEventsByActor 已有测试，保持

### 6.3 端到端手动测试清单

编写测试清单文档，覆盖：
- 完整流程：登录 → 创建 → 拆分 → 合并 → 上架 → 状态 → 转移 → 撤销
- 扫码流程：单次扫码 → 连续扫码 → 重复码警告
- 异常流程：断网提交 → 过期 token → 无效 ID
- 多用户：两人同时操作不冲突

**交付物**：测试覆盖新功能，手动测试清单。

---

## Phase 7：部署与运维

**目标**：可重复、可维护的部署流程。

### 7.1 构建与打包

- `npm run build` 生成前端静态文件到 dist/
- Express 服务同时承担静态文件服务（生产模式下 serve dist/）
- 合并为单进程部署：一个 Node 进程同时提供 API 和前端

### 7.2 局域网部署方案

```
花房局域网
├── 服务器/NAS（运行 Node + PM2）
│   ├── Express 监听 443（HTTPS）
│   ├── SQLite 数据文件
│   └── cron 每日备份
└── 手机（同一 WiFi，浏览器访问 https://<服务器IP>）
```

- PM2 守护进程，崩溃自动重启
- ecosystem.config.js 配置
- 提供一键部署脚本：`npm run deploy`（build + restart PM2）

### 7.3 云服务器部署方案

```
云服务器
├── Caddy / Nginx（反向代理 + HTTPS + 自动证书）
├── Node + PM2
├── SQLite 数据文件
└── cron 每日备份 → 对象存储
```

- 提供 Dockerfile（可选，方便云部署）
- 提供 docker-compose.yml（Node + Caddy）

### 7.4 部署文档

编写 `docs/deployment.md`，覆盖：
- 局域网部署步骤（含 mkcert HTTPS）
- 云服务器部署步骤（含 Caddy 配置）
- 备份与恢复操作
- 常见问题排查

**交付物**：单进程部署、PM2 配置、部署文档、备份脚本。

---

## 实施顺序与依赖关系

```
Phase 1（数据层）──→ Phase 2（功能补全）──→ Phase 3（扫码）
                  └──→ Phase 4（安全）     └──→ Phase 5（体验）
                                                    │
                                           Phase 6（测试）
                                                    │
                                           Phase 7（部署）
```

- Phase 1 是一切的前提（数据库换掉后其他才能在稳定基础上开发）
- Phase 2 和 Phase 4 可并行
- Phase 3 依赖 Phase 2（扫码需要填入已有输入框）
- Phase 5 依赖 Phase 2 和 3
- Phase 6 贯穿各阶段但集中在后期
- Phase 7 最后执行

## 不做的事情（YAGNI）

以下在当前阶段明确不做，避免过度工程化：

- 离线队列/离线操作（小团队局域网场景，断网概率低）
- 复杂 RBAC 权限系统（只需 operator/admin 两个角色）
- 微服务/消息队列（单进程 SQLite 完全够用）
- 原生 App / PWA 离线缓存（浏览器访问即可）
- 多语言国际化（用户全部中文）
- 高级报表与数据分析（事件数据在 SQLite 中，需要时直接查询）
- 蓝牙扫码枪支持（手机摄像头先跑起来）
