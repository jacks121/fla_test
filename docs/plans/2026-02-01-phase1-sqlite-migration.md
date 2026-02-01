# Phase 1: SQLite Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace lowdb (JSON file) with SQLite (better-sqlite3) for data persistence, and persist auth sessions in SQLite instead of memory.

**Architecture:** Rewrite the server data layer (db.js, auth.js, domain.js, app.js) to use better-sqlite3. The API contract (request/response shapes) stays identical — only internals change. All domain writes are wrapped in SQLite transactions. The frontend is untouched.

**Tech Stack:** better-sqlite3 (synchronous SQLite bindings for Node), vitest + supertest for testing.

---

### Task 1: Install better-sqlite3, update .gitignore

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

**Step 1: Install better-sqlite3**

Run: `npm install better-sqlite3`
Expected: package.json dependencies updated

**Step 2: Add SQLite files to .gitignore**

Append to `.gitignore`:
```
*.sqlite
backups/
```

**Step 3: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: add better-sqlite3 dependency"
```

---

### Task 2: Rewrite server/db.js (SQLite schema + seeding)

**Files:**
- Create: `server/__tests__/db.test.js`
- Rewrite: `server/db.js`

**Step 1: Write the test**

```js
// server/__tests__/db.test.js
import { describe, it, expect } from 'vitest';
import { createDb, parseEvent } from '../db.js';

describe('createDb', () => {
  it('creates tables and seeds data', () => {
    const db = createDb({ memory: true });
    expect(db.prepare('SELECT COUNT(*) as c FROM plants').get().c).toBe(10);
    expect(db.prepare('SELECT COUNT(*) as c FROM dishes').get().c).toBe(10);
    expect(db.prepare('SELECT COUNT(*) as c FROM locations').get().c).toBe(3);
    expect(db.prepare('SELECT COUNT(*) as c FROM trays').get().c).toBe(4);
    expect(db.prepare('SELECT COUNT(*) as c FROM events').get().c).toBe(0);
    expect(db.prepare('SELECT COUNT(*) as c FROM sessions').get().c).toBe(0);
    db.close();
  });

  it('returns plant rows matching seed shape', () => {
    const db = createDb({ memory: true });
    const plant = db.prepare('SELECT * FROM plants WHERE id = ?').get('P-1');
    expect(plant).toEqual({ id: 'P-1', type: '品种A', stage: '萌发', status: '正常', dishId: 'D-1' });
    db.close();
  });
});

describe('parseEvent', () => {
  it('deserializes JSON columns', () => {
    const row = {
      id: 'e1', type: 'split', actorId: 'u1', ts: '2026-01-01T00:00:00.000Z',
      inputIds: '["P-1"]', outputIds: '["P-2","P-3"]', meta: '{"trayId":"T-01"}',
    };
    const event = parseEvent(row);
    expect(event.inputIds).toEqual(['P-1']);
    expect(event.outputIds).toEqual(['P-2', 'P-3']);
    expect(event.meta).toEqual({ trayId: 'T-01' });
  });

  it('returns null for null input', () => {
    expect(parseEvent(null)).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/db.test.js`
Expected: FAIL — `createDb` returns lowdb instance, not SQLite

**Step 3: Implement server/db.js**

```js
// server/db.js
import Database from 'better-sqlite3';
import { seedLocations, seedTrays, seedPlants, seedDishes } from './seed.js';

const schema = `
  CREATE TABLE IF NOT EXISTS plants (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    stage TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT '正常',
    dishId TEXT
  );
  CREATE TABLE IF NOT EXISTS dishes (
    id TEXT PRIMARY KEY,
    plantId TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    actorId TEXT NOT NULL,
    ts TEXT NOT NULL,
    inputIds TEXT NOT NULL DEFAULT '[]',
    outputIds TEXT NOT NULL DEFAULT '[]',
    meta TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE IF NOT EXISTS locations (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS trays (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    userName TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );
`;

export function parseEvent(row) {
  if (!row) return null;
  return {
    ...row,
    inputIds: JSON.parse(row.inputIds),
    outputIds: JSON.parse(row.outputIds),
    meta: JSON.parse(row.meta),
  };
}

export function createDb({ file = 'server/data.sqlite', memory = false } = {}) {
  const db = new Database(memory ? ':memory:' : file);
  db.pragma('journal_mode = WAL');
  db.exec(schema);

  const count = db.prepare('SELECT COUNT(*) as c FROM plants').get().c;
  if (count === 0) {
    const seedAll = db.transaction(() => {
      const insLoc = db.prepare('INSERT INTO locations (id, label) VALUES (?, ?)');
      const insTray = db.prepare('INSERT INTO trays (id, label) VALUES (?, ?)');
      const insPlant = db.prepare(
        'INSERT INTO plants (id, type, stage, status, dishId) VALUES (?, ?, ?, ?, ?)'
      );
      const insDish = db.prepare('INSERT INTO dishes (id, plantId) VALUES (?, ?)');
      for (const l of seedLocations) insLoc.run(l.id, l.label);
      for (const t of seedTrays) insTray.run(t.id, t.label);
      for (const p of seedPlants) insPlant.run(p.id, p.type, p.stage, p.status, p.dishId);
      for (const d of seedDishes) insDish.run(d.id, d.plantId);
    });
    seedAll();
  }

  return db;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/db.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add server/db.js server/__tests__/db.test.js
git commit -m "feat: rewrite db.js to use SQLite via better-sqlite3"
```

---

### Task 3: Rewrite server/auth.js (SQLite sessions)

**Files:**
- Rewrite: `server/__tests__/auth.test.js`
- Rewrite: `server/auth.js`

**Step 1: Write the test**

The auth tests now create a SQLite db and pass it to createAuth. The HTTP-level tests stay, plus a new unit test for session persistence.

```js
// server/__tests__/auth.test.js
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createDb } from '../db.js';

function setup() {
  const db = createDb({ memory: true });
  const app = createApp({ db });
  return { app, db };
}

describe('POST /api/login', () => {
  it('rejects empty credentials', async () => {
    const { app } = setup();
    const res = await request(app).post('/api/login').send({});
    expect(res.status).toBe(400);
  });

  it('returns token for valid credentials', async () => {
    const { app } = setup();
    const res = await request(app).post('/api/login').send({
      username: 'demo',
      password: 'demo',
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user?.name).toBe('demo');
  });

  it('persists session in database', async () => {
    const { app, db } = setup();
    const res = await request(app).post('/api/login').send({
      username: 'demo',
      password: 'demo',
    });
    const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(res.body.token);
    expect(session).toBeTruthy();
    expect(session.userId).toBe('demo');
  });
});

describe('Auth guard', () => {
  it('rejects write without token', async () => {
    const { app } = setup();
    const res = await request(app).post('/api/events').send({
      type: 'place',
      actorId: 'emp-01',
      payload: { trayId: 'T-01', locationId: 'rack-A1' },
    });
    expect(res.status).toBe(401);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/auth.test.js`
Expected: FAIL — createAuth signature mismatch (now expects db param)

**Step 3: Implement server/auth.js**

```js
// server/auth.js
import { randomUUID } from 'node:crypto';

export function createAuth(db) {
  const insertSession = db.prepare(
    'INSERT INTO sessions (token, userId, userName, createdAt) VALUES (?, ?, ?, ?)'
  );
  const getSession = db.prepare('SELECT * FROM sessions WHERE token = ?');
  const deleteSession = db.prepare('DELETE FROM sessions WHERE token = ?');

  function login({ username, password }) {
    if (!username || !password) throw new Error('账号与口令不能为空');
    const token = randomUUID();
    const user = { id: username, name: username };
    insertSession.run(token, user.id, user.name, new Date().toISOString());
    return { token, user };
  }

  function logout(token) {
    deleteSession.run(token);
  }

  function authenticate(req, res, next) {
    if (req.path === '/api/health' || req.path === '/api/login') return next();
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const session = getSession.get(token);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    req.user = { id: session.userId, name: session.userName };
    next();
  }

  return { login, logout, authenticate };
}
```

**Step 4: Also update app.js to pass db to createAuth** (required for tests to run)

In `server/app.js`, change:
```js
const auth = createAuth();
```
to:
```js
const auth = createAuth(db);
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run server/__tests__/auth.test.js`
Expected: PASS

**Step 6: Commit**

```bash
git add server/auth.js server/__tests__/auth.test.js server/app.js
git commit -m "feat: persist auth sessions in SQLite"
```

---

### Task 4: Rewrite server/domain.js (SQL-based operations)

**Files:**
- Create: `server/__tests__/domain.test.js`
- Rewrite: `server/domain.js`

**Step 1: Write the test**

```js
// server/__tests__/domain.test.js
import { describe, it, expect } from 'vitest';
import { createDb, parseEvent } from '../db.js';
import { createDomain } from '../domain.js';

function setup() {
  const db = createDb({ memory: true });
  const domain = createDomain(db);
  return { db, domain };
}

describe('domain.split', () => {
  it('creates child plants and dishes', () => {
    const { db, domain } = setup();
    const event = domain.split({ parentDishId: 'D-1', trayId: 'T-01', count: 2 });
    expect(event.type).toBe('split');
    expect(event.outputIds).toHaveLength(2);
    expect(event.meta.trayId).toBe('T-01');
    // Verify new dishes in db
    const dishes = db.prepare('SELECT * FROM dishes').all();
    expect(dishes.length).toBe(12); // 10 seed + 2 new
  });

  it('rejects missing parent dish', () => {
    const { domain } = setup();
    expect(() => domain.split({ parentDishId: 'NOPE', trayId: 'T-01', count: 1 }))
      .toThrow('父培养皿不存在');
  });
});

describe('domain.merge', () => {
  it('creates merged plant and dish', () => {
    const { db, domain } = setup();
    const event = domain.merge({ parentDishIds: ['D-1', 'D-2'], trayId: 'T-02' });
    expect(event.type).toBe('merge');
    expect(event.outputIds).toHaveLength(1);
    const dishes = db.prepare('SELECT * FROM dishes').all();
    expect(dishes.length).toBe(11); // 10 seed + 1 merged
  });

  it('rejects occupied target dish', () => {
    const { domain } = setup();
    expect(() => domain.merge({ parentDishIds: ['D-1', 'D-2'], trayId: 'T-02', targetDishId: 'D-3' }))
      .toThrow('培养皿已被占用');
  });
});

describe('domain.place', () => {
  it('records placement event', () => {
    const { domain } = setup();
    const event = domain.place({ trayId: 'T-03', locationId: 'rack-A1' });
    expect(event.type).toBe('place');
    expect(event.meta.trayId).toBe('T-03');
    expect(event.meta.locationId).toBe('rack-A1');
  });
});

describe('domain.updateStatus', () => {
  it('updates plant status', () => {
    const { db, domain } = setup();
    domain.updateStatus({ dishId: 'D-1', status: '感染' });
    const plant = db.prepare("SELECT * FROM plants WHERE dishId = 'D-1'").get();
    expect(plant.status).toBe('感染');
  });
});

describe('domain.transfer', () => {
  it('moves plant to new dish', () => {
    const { db, domain } = setup();
    const event = domain.transfer({ fromDishId: 'D-1', toDishId: 'D-X1' });
    expect(event.type).toBe('transfer');
    // Old dish gone, new dish exists
    expect(db.prepare('SELECT * FROM dishes WHERE id = ?').get('D-1')).toBeUndefined();
    expect(db.prepare('SELECT * FROM dishes WHERE id = ?').get('D-X1')).toBeTruthy();
    // Plant references new dish
    const plant = db.prepare('SELECT * FROM plants WHERE id = ?').get('P-1');
    expect(plant.dishId).toBe('D-X1');
  });

  it('rejects occupied target dish', () => {
    const { domain } = setup();
    expect(() => domain.transfer({ fromDishId: 'D-1', toDishId: 'D-2' }))
      .toThrow('目标培养皿已占用');
  });
});

describe('event persistence', () => {
  it('all domain operations insert events into db', () => {
    const { db, domain } = setup();
    domain.split({ parentDishId: 'D-1', trayId: 'T-01', count: 1 });
    domain.place({ trayId: 'T-03', locationId: 'rack-A1' });
    const rows = db.prepare('SELECT * FROM events').all();
    expect(rows.length).toBe(2);
    const parsed = parseEvent(rows[0]);
    expect(Array.isArray(parsed.inputIds)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/domain.test.js`
Expected: FAIL — domain.js still uses lowdb array operations

**Step 3: Implement server/domain.js**

```js
// server/domain.js
import { randomUUID } from 'node:crypto';

function ts() {
  return new Date().toISOString();
}

export function createDomain(db) {
  const stmts = {
    findPlantById: db.prepare('SELECT * FROM plants WHERE id = ?'),
    findDishById: db.prepare('SELECT * FROM dishes WHERE id = ?'),
    dishExists: db.prepare('SELECT 1 FROM dishes WHERE id = ?'),
    insertPlant: db.prepare(
      'INSERT INTO plants (id, type, stage, status, dishId) VALUES (?, ?, ?, ?, ?)'
    ),
    insertDish: db.prepare('INSERT INTO dishes (id, plantId) VALUES (?, ?)'),
    insertEvent: db.prepare(
      'INSERT INTO events (id, type, actorId, ts, inputIds, outputIds, meta) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ),
    updatePlantStatus: db.prepare('UPDATE plants SET status = ? WHERE id = ?'),
    updatePlantDishId: db.prepare('UPDATE plants SET dishId = ? WHERE id = ?'),
    deleteDish: db.prepare('DELETE FROM dishes WHERE id = ?'),
    maxPlantNum: db.prepare(
      "SELECT MAX(CAST(SUBSTR(id, 3) AS INTEGER)) as maxNum FROM plants WHERE id LIKE 'P-%'"
    ),
    maxDishNum: db.prepare(
      "SELECT MAX(CAST(SUBSTR(id, 3) AS INTEGER)) as maxNum FROM dishes WHERE id LIKE 'D-%'"
    ),
  };

  function nextPlantId() {
    return `P-${(stmts.maxPlantNum.get().maxNum || 0) + 1}`;
  }

  function nextDishId() {
    return `D-${(stmts.maxDishNum.get().maxNum || 0) + 1}`;
  }

  function persistEvent(event) {
    stmts.insertEvent.run(
      event.id, event.type, event.actorId, event.ts,
      JSON.stringify(event.inputIds),
      JSON.stringify(event.outputIds),
      JSON.stringify(event.meta)
    );
    return event;
  }

  function createEvent({ type, actorId, inputIds = [], outputIds = [], meta = {} }) {
    return persistEvent({ id: randomUUID(), type, actorId, ts: ts(), inputIds, outputIds, meta });
  }

  const split = db.transaction(({ parentDishId, trayId, count, actorId = 'emp-01' }) => {
    const parentDish = stmts.findDishById.get(parentDishId);
    if (!parentDish) throw new Error('父培养皿不存在');
    const parentPlant = stmts.findPlantById.get(parentDish.plantId);
    if (!parentPlant) throw new Error('父花苗不存在');
    if (!count || count < 1) throw new Error('数量需大于 0');

    const outputIds = [];
    for (let i = 0; i < count; i++) {
      const plantId = nextPlantId();
      const dishId = nextDishId();
      stmts.insertPlant.run(plantId, parentPlant.type, parentPlant.stage, '正常', dishId);
      stmts.insertDish.run(dishId, plantId);
      outputIds.push(plantId);
    }

    return createEvent({
      type: 'split', actorId,
      inputIds: [parentPlant.id], outputIds,
      meta: { trayId, count },
    });
  });

  const merge = db.transaction(({ parentDishIds, trayId, targetDishId, actorId = 'emp-01' }) => {
    if (!Array.isArray(parentDishIds) || parentDishIds.length === 0)
      throw new Error('父培养皿不能为空');
    const parentPlantIds = parentDishIds.map((id) => {
      const dish = stmts.findDishById.get(id);
      if (!dish) throw new Error('父培养皿不存在');
      return dish.plantId;
    });
    const dishId = targetDishId || nextDishId();
    if (stmts.dishExists.get(dishId)) throw new Error('培养皿已被占用');

    const plantId = nextPlantId();
    stmts.insertPlant.run(plantId, '合并苗', '萌发', '正常', dishId);
    stmts.insertDish.run(dishId, plantId);

    return createEvent({
      type: 'merge', actorId,
      inputIds: parentPlantIds, outputIds: [plantId],
      meta: { trayId, targetDishId: dishId },
    });
  });

  function place({ trayId, locationId, actorId = 'emp-01' }) {
    if (!trayId) throw new Error('盘子编号不能为空');
    if (!locationId) throw new Error('上架位置不能为空');
    return createEvent({
      type: 'place', actorId,
      inputIds: [], outputIds: [],
      meta: { trayId, locationId },
    });
  }

  const updateStatus = db.transaction(({ dishId, status, actorId = 'emp-01' }) => {
    const dish = stmts.findDishById.get(dishId);
    if (!dish) throw new Error('培养皿不存在');
    const plant = stmts.findPlantById.get(dish.plantId);
    if (!plant) throw new Error('花苗不存在');
    stmts.updatePlantStatus.run(status, plant.id);
    return createEvent({
      type: 'status', actorId,
      inputIds: [plant.id], outputIds: [],
      meta: { status },
    });
  });

  const transfer = db.transaction(({ fromDishId, toDishId, actorId = 'emp-01' }) => {
    if (!fromDishId || !toDishId) throw new Error('缺少培养皿');
    const fromDish = stmts.findDishById.get(fromDishId);
    if (!fromDish) throw new Error('原培养皿不存在');
    if (stmts.dishExists.get(toDishId)) throw new Error('目标培养皿已占用');
    const plant = stmts.findPlantById.get(fromDish.plantId);
    if (!plant) throw new Error('花苗不存在');
    stmts.deleteDish.run(fromDishId);
    stmts.insertDish.run(toDishId, plant.id);
    stmts.updatePlantDishId.run(toDishId, plant.id);
    return createEvent({
      type: 'transfer', actorId,
      inputIds: [plant.id], outputIds: [],
      meta: { fromDishId, toDishId },
    });
  });

  return { split, merge, place, updateStatus, transfer };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/domain.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add server/domain.js server/__tests__/domain.test.js
git commit -m "feat: rewrite domain.js with SQL operations and transactions"
```

---

### Task 5: Update server/app.js (wire new components)

**Files:**
- Rewrite: `server/app.js`

**Step 1: Implement server/app.js**

Key changes from old app.js:
- Import `parseEvent` from `./db.js` and `seedMeta` from `./seed.js`
- Pass `db` to `createAuth(db)`
- Remove all `await db.read()` / `await db.write()` calls
- GET routes query SQLite directly
- POST /api/events passes `actorId` into domain calls (domain now handles persistence)
- GET /api/events uses SQL WHERE clauses + ORDER BY ts DESC, parses JSON columns

```js
// server/app.js
import express from 'express';
import cors from 'cors';
import { createDomain } from './domain.js';
import { createAuth } from './auth.js';
import { parseEvent } from './db.js';
import { seedMeta } from './seed.js';

export function createApp({ db }) {
  const app = express();
  const domain = createDomain(db);
  const auth = createAuth(db);
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};
    try {
      const session = auth.login({ username, password });
      res.json(session);
    } catch (err) {
      res.status(400).json({ error: err.message || 'Bad credentials' });
    }
  });

  app.use(auth.authenticate);

  app.get('/api/meta', (_req, res) => {
    const locations = db.prepare('SELECT * FROM locations').all();
    const trays = db.prepare('SELECT * FROM trays').all();
    res.json({
      locations,
      trays,
      statusEnum: seedMeta.statusEnum,
      stages: seedMeta.stages,
      types: seedMeta.types,
    });
  });

  app.get('/api/plants', (req, res) => {
    const q = (req.query.query || '').toString();
    const list = q
      ? db.prepare('SELECT * FROM plants WHERE id LIKE ? OR type LIKE ?').all(`%${q}%`, `%${q}%`)
      : db.prepare('SELECT * FROM plants').all();
    res.json(list);
  });

  app.get('/api/dishes', (req, res) => {
    const q = (req.query.query || '').toString();
    const list = q
      ? db.prepare('SELECT * FROM dishes WHERE id LIKE ?').all(`%${q}%`)
      : db.prepare('SELECT * FROM dishes').all();
    res.json(list);
  });

  app.get('/api/events', (req, res) => {
    const { type, actorId, from, to } = req.query;
    let sql = 'SELECT * FROM events WHERE 1=1';
    const params = [];
    if (type) { sql += ' AND type = ?'; params.push(type); }
    if (actorId) { sql += ' AND actorId = ?'; params.push(actorId); }
    if (from) { sql += ' AND ts >= ?'; params.push(from); }
    if (to) { sql += ' AND ts <= ?'; params.push(to); }
    sql += ' ORDER BY ts DESC';
    const rows = db.prepare(sql).all(...params);
    res.json(rows.map(parseEvent));
  });

  app.post('/api/events', (req, res) => {
    const { type, actorId, payload } = req.body || {};
    try {
      const actor = actorId || req.user?.id || 'emp-01';
      let event;
      switch (type) {
        case 'split':
          event = domain.split({ ...payload, actorId: actor });
          break;
        case 'merge':
          event = domain.merge({ ...payload, actorId: actor });
          break;
        case 'place':
          event = domain.place({ ...payload, actorId: actor });
          break;
        case 'status':
          event = domain.updateStatus({ ...payload, actorId: actor });
          break;
        case 'transfer':
          event = domain.transfer({ ...payload, actorId: actor });
          break;
        default:
          return res.status(400).json({ error: 'Invalid event type' });
      }
      res.json(event);
    } catch (err) {
      res.status(400).json({ error: err.message || 'Bad request' });
    }
  });

  return app;
}
```

**Step 2: Run new db/domain/auth tests to verify no regression**

Run: `npx vitest run server/__tests__/db.test.js server/__tests__/domain.test.js server/__tests__/auth.test.js`
Expected: PASS

**Step 3: Commit**

```bash
git add server/app.js
git commit -m "feat: update app.js for SQLite-backed db, auth, and domain"
```

---

### Task 6: Update integration tests

**Files:**
- Rewrite: `server/__tests__/events.test.js`
- Rewrite: `server/__tests__/meta.test.js`
- Rewrite: `src/__tests__/api.test.js`

**Step 1: Update server/__tests__/events.test.js**

Changes: `createDb()` is now sync (remove `await`), db introspection uses SQL instead of `db.data`.

```js
// server/__tests__/events.test.js
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createDb } from '../db.js';

function setup() {
  const db = createDb({ memory: true });
  const app = createApp({ db });
  const loginRes = request(app).post('/api/login').send({
    username: 'demo',
    password: 'demo',
  });
  return { db, app, loginP: loginRes };
}

async function setupWithToken() {
  const { db, app, loginP } = setup();
  const login = await loginP;
  return { db, app, token: login.body.token };
}

describe('POST /api/events', () => {
  it('records split events and creates dishes', async () => {
    const { db, app, token } = await setupWithToken();
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'split',
        actorId: 'emp-01',
        payload: { parentDishId: 'D-1', trayId: 'T-01', count: 2 },
      });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('split');
    expect(res.body.outputIds.length).toBe(2);
    const dishes = db.prepare('SELECT * FROM dishes').all();
    expect(dishes.length).toBeGreaterThan(10);
  });

  it('records merge event', async () => {
    const { app, token } = await setupWithToken();
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'merge',
        actorId: 'emp-01',
        payload: { parentDishIds: ['D-1', 'D-2'], trayId: 'T-02' },
      });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('merge');
    expect(res.body.outputIds.length).toBe(1);
  });

  it('records place event with tray + location', async () => {
    const { app, token } = await setupWithToken();
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'place',
        actorId: 'emp-01',
        payload: { trayId: 'T-03', locationId: 'rack-A1' },
      });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('place');
    expect(res.body.meta.trayId).toBe('T-03');
  });

  it('updates status event', async () => {
    const { db, app, token } = await setupWithToken();
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'status',
        actorId: 'emp-01',
        payload: { dishId: 'D-1', status: '感染' },
      });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('status');
    const plant = db.prepare("SELECT * FROM plants WHERE dishId = 'D-1'").get();
    expect(plant.status).toBe('感染');
  });

  it('records transfer event', async () => {
    const { db, app, token } = await setupWithToken();
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'transfer',
        actorId: 'emp-01',
        payload: { fromDishId: 'D-1', toDishId: 'D-X1' },
      });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('transfer');
    const dish = db.prepare('SELECT * FROM dishes WHERE id = ?').get('D-X1');
    expect(dish).toBeTruthy();
  });
});

describe('GET /api/events', () => {
  it('filters by type', async () => {
    const { app, token } = await setupWithToken();
    await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'place',
        actorId: 'emp-01',
        payload: { trayId: 'T-03', locationId: 'rack-A1' },
      });
    const res = await request(app)
      .get('/api/events?type=place')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.every((e) => e.type === 'place')).toBe(true);
  });
});
```

**Step 2: Update server/__tests__/meta.test.js**

```js
// server/__tests__/meta.test.js
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createDb } from '../db.js';

describe('GET /api/meta', () => {
  it('returns locations and trays', async () => {
    const db = createDb({ memory: true });
    const app = createApp({ db });
    const login = await request(app).post('/api/login').send({
      username: 'demo',
      password: 'demo',
    });
    const res = await request(app)
      .get('/api/meta')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.locations.length).toBeGreaterThan(0);
    expect(res.body.trays.length).toBeGreaterThan(0);
  });
});
```

**Step 3: Update src/__tests__/api.test.js**

```js
// src/__tests__/api.test.js
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from '../../server/db.js';
import { createApp } from '../../server/app.js';
import { createApi } from '../lib/api.js';

let server;
let baseUrl;

beforeAll(() => {
  const db = createDb({ memory: true });
  const app = createApp({ db });
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  server?.close();
});

describe('api client', () => {
  it('fetches meta data', async () => {
    const api = createApi(baseUrl);
    const login = await api.login({ username: 'demo', password: 'demo' });
    const meta = await api.getMeta(login.token);
    expect(meta.trays.length).toBeGreaterThan(0);
    expect(meta.locations.length).toBeGreaterThan(0);
  });

  it('posts a split event and returns event type', async () => {
    const api = createApi(baseUrl);
    const login = await api.login({ username: 'demo', password: 'demo' });
    const event = await api.postEvent(
      {
        type: 'split',
        actorId: 'user-1',
        payload: { parentDishId: 'D-1', count: 2, trayId: 'T-01' },
      },
      login.token
    );
    expect(event.type).toBe('split');
    expect(event.outputIds.length).toBe(2);
  });
});
```

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add server/__tests__/events.test.js server/__tests__/meta.test.js src/__tests__/api.test.js
git commit -m "test: update all tests for SQLite backend"
```

---

### Task 7: Update server/index.js, remove lowdb

**Files:**
- Modify: `server/index.js`
- Modify: `package.json` (remove lowdb)

**Step 1: Update server/index.js**

```js
// server/index.js
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

**Step 2: Remove lowdb**

Run: `npm uninstall lowdb`

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add server/index.js package.json package-lock.json
git commit -m "chore: update entrypoint for sync createDb, remove lowdb"
```

---

### Task 8: Migration script (data.json → SQLite)

**Files:**
- Create: `server/migrate-json-to-sqlite.js`

**Step 1: Write migration script**

```js
// server/migrate-json-to-sqlite.js
import { readFileSync, existsSync } from 'node:fs';
import { createDb } from './db.js';

const jsonPath = process.argv[2] || 'server/data.json';

if (!existsSync(jsonPath)) {
  console.log(`No file found at ${jsonPath}, nothing to migrate.`);
  process.exit(0);
}

const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
const db = createDb({ file: 'server/data.sqlite' });

const migrate = db.transaction(() => {
  // Clear seed data to replace with JSON data
  db.prepare('DELETE FROM events').run();
  db.prepare('DELETE FROM dishes').run();
  db.prepare('DELETE FROM plants').run();
  db.prepare('DELETE FROM locations').run();
  db.prepare('DELETE FROM trays').run();

  if (data.meta?.locations) {
    const ins = db.prepare('INSERT INTO locations (id, label) VALUES (?, ?)');
    for (const l of data.meta.locations) ins.run(l.id, l.label);
  }
  if (data.meta?.trays) {
    const ins = db.prepare('INSERT INTO trays (id, label) VALUES (?, ?)');
    for (const t of data.meta.trays) ins.run(t.id, t.label);
  }
  if (data.plants) {
    const ins = db.prepare(
      'INSERT INTO plants (id, type, stage, status, dishId) VALUES (?, ?, ?, ?, ?)'
    );
    for (const p of data.plants) ins.run(p.id, p.type, p.stage, p.status, p.dishId);
  }
  if (data.dishes) {
    const ins = db.prepare('INSERT INTO dishes (id, plantId) VALUES (?, ?)');
    for (const d of data.dishes) ins.run(d.id, d.plantId);
  }
  if (data.events) {
    const ins = db.prepare(
      'INSERT INTO events (id, type, actorId, ts, inputIds, outputIds, meta) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    for (const e of data.events) {
      ins.run(
        e.id, e.type, e.actorId, e.ts,
        JSON.stringify(e.inputIds || []),
        JSON.stringify(e.outputIds || []),
        JSON.stringify(e.meta || {})
      );
    }
  }
});

migrate();
db.close();

const counts = {
  plants: data.plants?.length || 0,
  dishes: data.dishes?.length || 0,
  events: data.events?.length || 0,
};
console.log(`Migration complete: ${counts.plants} plants, ${counts.dishes} dishes, ${counts.events} events`);
```

**Step 2: Add npm script**

Add to package.json scripts:
```json
"migrate": "node server/migrate-json-to-sqlite.js"
```

**Step 3: Test migration** (manual — only if server/data.json exists locally)

Run: `npm run migrate`
Expected: Prints migration counts, creates server/data.sqlite

**Step 4: Commit**

```bash
git add server/migrate-json-to-sqlite.js package.json
git commit -m "feat: add JSON-to-SQLite migration script"
```

---

### Task 9: Backup script + final cleanup

**Files:**
- Create: `server/backup.js`
- Modify: `package.json` (add script)
- Modify: `CLAUDE.md` (update commands)

**Step 1: Write backup script**

```js
// server/backup.js
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const src = process.argv[2] || 'server/data.sqlite';
const dir = 'backups';
mkdirSync(dir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const dest = join(dir, `data-${timestamp}.sqlite`);

const db = new Database(src, { readonly: true });
db.backup(dest).then(() => {
  db.close();
  console.log(`Backup saved to ${dest}`);
}).catch((err) => {
  db.close();
  console.error('Backup failed:', err.message);
  process.exit(1);
});
```

**Step 2: Add npm script**

Add to package.json scripts:
```json
"backup": "node server/backup.js"
```

**Step 3: Update CLAUDE.md**

Add/update the commands section to include:
- `npm run migrate` — Migrate data.json to SQLite (one-time)
- `npm run backup` — Backup SQLite database to backups/ directory

Update architecture section: replace references to lowdb/JSON with SQLite/better-sqlite3.

**Step 4: Run full test suite one final time**

Run: `npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add server/backup.js package.json CLAUDE.md
git commit -m "feat: add backup script, update docs for SQLite migration"
```
