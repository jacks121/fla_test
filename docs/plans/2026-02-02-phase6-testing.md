# Phase 6: 测试补全 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fill test coverage gaps for production readiness: server edge cases, API route tests, client error handling, and an E2E manual test checklist.

**Architecture:** All changes are test files only — no production code changes. Server tests use supertest + in-memory SQLite. Client tests use a real test server with the api.js client. E2E checklist is documentation only.

**Tech Stack:** Vitest, Supertest, better-sqlite3 (in-memory)

**YAGNI decisions:**
- Scanner behavior tests: Skipped — requires jsdom + Html5Qrcode mock for a tightly DOM-coupled module. Export test confirms module loads. Real scanner validation needs browser E2E.
- Performance/load tests: Skipped — POC scale doesn't warrant benchmarks.
- Concurrency tests: Skipped — SQLite WAL mode handles this at POC scale.

---

### Task 1: Add domain validation edge case tests

**Files:**
- Modify: `server/__tests__/domain.test.js`

**Step 1: Add edge case tests**

Append these test groups to `server/__tests__/domain.test.js`:

```js
describe('domain.create validation', () => {
  it('rejects missing stage', () => {
    const { domain } = setup();
    expect(() => domain.create({ type: '品种A', count: 1, trayId: 'T-01' }))
      .toThrow('缺少阶段');
  });

  it('rejects missing trayId', () => {
    const { domain } = setup();
    expect(() => domain.create({ type: '品种A', stage: '萌发', count: 1 }))
      .toThrow('缺少盘子编号');
  });
});

describe('domain.place validation', () => {
  it('rejects missing trayId', () => {
    const { domain } = setup();
    expect(() => domain.place({ locationId: 'rack-A1' })).toThrow('盘子编号不能为空');
  });

  it('rejects missing locationId', () => {
    const { domain } = setup();
    expect(() => domain.place({ trayId: 'T-01' })).toThrow('上架位置不能为空');
  });
});

describe('domain.transfer validation', () => {
  it('rejects missing fromDishId', () => {
    const { domain } = setup();
    expect(() => domain.transfer({ toDishId: 'D-X1' })).toThrow('缺少培养皿');
  });

  it('rejects non-existent source dish', () => {
    const { domain } = setup();
    expect(() => domain.transfer({ fromDishId: 'NOPE', toDishId: 'D-X1' }))
      .toThrow('原培养皿不存在');
  });
});

describe('domain.merge validation', () => {
  it('rejects empty parentDishIds array', () => {
    const { domain } = setup();
    expect(() => domain.merge({ parentDishIds: [], trayId: 'T-02' }))
      .toThrow('父培养皿不能为空');
  });

  it('rejects non-existent parent dish', () => {
    const { domain } = setup();
    expect(() => domain.merge({ parentDishIds: ['NOPE'], trayId: 'T-02' }))
      .toThrow('父培养皿不存在');
  });
});

describe('domain.updateStatus validation', () => {
  it('rejects non-existent dish', () => {
    const { domain } = setup();
    expect(() => domain.updateStatus({ dishId: 'NOPE', status: '感染' }))
      .toThrow('培养皿不存在');
  });
});

describe('domain.undo validation', () => {
  it('rejects missing actorId', () => {
    const { domain } = setup();
    expect(() => domain.undo({})).toThrow('缺少操作人');
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run`
Expected: All tests pass (68 existing + 10 new = 78)

**Step 3: Commit**

```bash
git add server/__tests__/domain.test.js
git commit -m "test: add domain validation edge case tests"
```

---

### Task 2: Add API route coverage tests

**Files:**
- Create: `server/__tests__/routes.test.js`

**Step 1: Create route tests**

Create `server/__tests__/routes.test.js`:

```js
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createDb } from '../db.js';

function setup() {
  const db = createDb({ memory: true });
  const app = createApp({ db });
  return { db, app };
}

async function setupWithToken(role = 'demo') {
  const { db, app } = setup();
  const login = await request(app).post('/api/login').send({
    username: role === 'admin' ? 'admin' : 'demo',
    password: role === 'admin' ? 'admin' : 'demo',
  });
  return { db, app, token: login.body.token };
}

describe('GET /api/health', () => {
  it('returns ok without auth', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('GET /api/plants', () => {
  it('returns all plants', async () => {
    const { app, token } = await setupWithToken();
    const res = await request(app).get('/api/plants').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(10);
  });

  it('filters by query', async () => {
    const { app, token } = await setupWithToken();
    const res = await request(app).get('/api/plants?query=P-1').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every(p => p.id.includes('P-1') || p.type.includes('P-1'))).toBe(true);
  });
});

describe('GET /api/dishes', () => {
  it('returns all dishes', async () => {
    const { app, token } = await setupWithToken();
    const res = await request(app).get('/api/dishes').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(10);
  });

  it('filters by query', async () => {
    const { app, token } = await setupWithToken();
    const res = await request(app).get('/api/dishes?query=D-1').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every(d => d.id.includes('D-1'))).toBe(true);
  });
});

describe('GET /api/events', () => {
  it('filters by actorId', async () => {
    const { app, token } = await setupWithToken();
    // Create an event first
    await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'place', payload: { trayId: 'T-01', locationId: 'rack-A1' } });

    const res = await request(app)
      .get('/api/events?actorId=user-001')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.every(e => e.actorId === 'user-001')).toBe(true);
  });

  it('returns empty array when no events match filter', async () => {
    const { app, token } = await setupWithToken();
    const res = await request(app)
      .get('/api/events?type=transfer')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/events error handling', () => {
  it('rejects invalid event type', async () => {
    const { app, token } = await setupWithToken();
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'invalid', payload: {} });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid event type/);
  });

  it('returns 400 for domain validation errors', async () => {
    const { app, token } = await setupWithToken();
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'split', payload: { parentDishId: 'NOPE', trayId: 'T-01', count: 1 } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('uses authenticated user as actorId regardless of body', async () => {
    const { app, token } = await setupWithToken();
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'place',
        actorId: 'attacker',
        payload: { trayId: 'T-01', locationId: 'rack-A1' },
      });
    expect(res.status).toBe(200);
    expect(res.body.actorId).not.toBe('attacker');
    expect(res.body.actorId).toBe('user-001');
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run`
Expected: All tests pass (78 + 9 new = 87)

**Step 3: Commit**

```bash
git add server/__tests__/routes.test.js
git commit -m "test: add API route coverage tests"
```

---

### Task 3: Add API client error handling tests

**Files:**
- Modify: `src/__tests__/api.test.js`

**Step 1: Add error handling tests**

Append these test groups to `src/__tests__/api.test.js`:

```js
describe('api client error handling', () => {
  it('throws with status 401 for expired/invalid token', async () => {
    const api = createApi(baseUrl);
    try {
      await api.getMeta('invalid-token');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).toBe(401);
    }
  });

  it('throws with status 400 for bad login', async () => {
    const api = createApi(baseUrl);
    try {
      await api.login({ username: 'demo', password: 'wrong' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/账号或口令错误/);
    }
  });

  it('throws with domain error message for bad event', async () => {
    const api = createApi(baseUrl);
    const login = await api.login({ username: 'demo', password: 'demo' });
    try {
      await api.postEvent(
        { type: 'split', payload: { parentDishId: 'NOPE', trayId: 'T-01', count: 1 } },
        login.token
      );
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toBeTruthy();
    }
  });
});

describe('api client additional methods', () => {
  it('getDishes returns array', async () => {
    const api = createApi(baseUrl);
    const login = await api.login({ username: 'demo', password: 'demo' });
    const dishes = await api.getDishes(undefined, login.token);
    expect(Array.isArray(dishes)).toBe(true);
    expect(dishes.length).toBe(10);
  });

  it('getEvents returns array', async () => {
    const api = createApi(baseUrl);
    const login = await api.login({ username: 'demo', password: 'demo' });
    const events = await api.getEvents(undefined, login.token);
    expect(Array.isArray(events)).toBe(true);
  });

  it('undo throws when no events to undo', async () => {
    const api = createApi(baseUrl);
    const login = await api.login({ username: 'demo', password: 'demo' });
    try {
      await api.undo(login.token);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).toBe(400);
    }
  });

  it('logout succeeds', async () => {
    const api = createApi(baseUrl);
    const login = await api.login({ username: 'demo', password: 'demo' });
    const result = await api.logout(login.token);
    expect(result.ok).toBe(true);
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run`
Expected: All tests pass (87 + 7 new = 94)

**Step 3: Commit**

```bash
git add src/__tests__/api.test.js
git commit -m "test: add API client error handling and method coverage"
```

---

### Task 4: Create E2E manual test checklist

**Files:**
- Create: `docs/plans/2026-02-02-e2e-test-checklist.md`

**Step 1: Write the checklist**

Create `docs/plans/2026-02-02-e2e-test-checklist.md`:

```markdown
# E2E Manual Test Checklist

Run through these scenarios on a phone/tablet before deployment.

## Login Flow
- [ ] Open app → redirects to login.html
- [ ] Enter wrong password → shows error
- [ ] Enter correct credentials (demo/demo) → redirects to main app
- [ ] User name shows in header pill
- [ ] Click 退出 → redirects to login page, token cleared

## Create (创建)
- [ ] Select 创建 mode → type/stage/count/tray fields appear
- [ ] Fill in all fields → submit → toast "创建成功"
- [ ] Event appears in event log and my history
- [ ] New dishes appear in dish helper buttons

## Split (拆分)
- [ ] Select 拆分 mode → parent/tray/count fields appear
- [ ] Scan parent dish QR → input filled
- [ ] Submit → toast "拆分成功"
- [ ] Undo → toast "撤销成功", created dishes removed

## Merge (合并)
- [ ] Select 合并 mode → tray/target/parent queue fields appear
- [ ] Add 2+ parents via input or continuous scan
- [ ] Chip row shows queued parents with remove buttons
- [ ] Submit → toast "合并成功"

## Place (上架)
- [ ] Lock location → location badge shown, tray input enabled
- [ ] Add trays via input or continuous scan
- [ ] Submit → toast "上架 N 个盘子"
- [ ] Change location → resets queue

## Status (状态)
- [ ] Scan or enter dish ID → select status → submit
- [ ] Plant status updated

## Transfer (转移)
- [ ] Enter old dish + new dish → submit → toast "已转移"

## Undo (撤销)
- [ ] Click 撤销 → confirmation dialog
- [ ] Confirm → last operation reversed
- [ ] Click 撤销 again → "不能连续撤销" or no more operations

## QR Scanning
- [ ] Single scan: tap 扫码 → camera opens → scan QR → camera closes, input filled
- [ ] Continuous scan (连扫): tap 连扫 → camera stays open → scan multiple codes → each added to queue
- [ ] Duplicate code → toast warning, not added twice
- [ ] Close button closes camera overlay

## Offline Behavior
- [ ] Disable network → red "离线中" banner appears
- [ ] Tap submit while offline → toast "当前离线，无法提交"
- [ ] Re-enable network → banner disappears, state refreshes

## Event Log
- [ ] Type filter dropdown filters event list
- [ ] Click event → expands detail (ID, actor, metadata)
- [ ] Click again → collapses

## My History
- [ ] Shows only current user's events
- [ ] Type filter dropdown works
- [ ] Click to expand/collapse works

## Responsive
- [ ] On phone (< 768px): single-column, 540px max-width
- [ ] On tablet (≥ 768px): wider layout, 720px max-width, 2-column form grid

## Admin
- [ ] Click 标签 link → admin.html
- [ ] Generate dish QR codes → grid of QR labels appears
- [ ] Print → clean print layout, 5 columns
```

**Step 2: Commit**

```bash
git add docs/plans/2026-02-02-e2e-test-checklist.md
git commit -m "docs: add E2E manual test checklist"
```

---

## Summary of changes across tasks

| Task | What | Files | Tests Added |
|------|------|-------|-------------|
| 1 | Domain validation edge cases | domain.test.js | +10 |
| 2 | API route coverage | routes.test.js (new) | +9 |
| 3 | API client error handling + methods | api.test.js | +7 |
| 4 | E2E manual test checklist | e2e-test-checklist.md (new) | 0 (docs) |

**Total new tests: 26 (from 68 → 94)**
