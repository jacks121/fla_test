# Phase 4: 安全与鉴权加固 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace POC's "any password accepted" auth with real password verification, session expiration, role-based access, and a user management CLI.

**Architecture:** Add a `users` table (username, passwordHash, role) to SQLite. Use Node's built-in `crypto.scryptSync` for password hashing (no external dependency needed — bcrypt requires native compilation which complicates deployment). Rewrite `auth.js` to verify credentials against the users table. Add session expiration (7 days). Expose `POST /api/logout`. Protect admin routes with role middleware. Add `npm run add-user` CLI script. Use actorId from authenticated session, not from request body.

**Tech Stack:** Node crypto.scryptSync (password hashing), SQLite, Express middleware

---

### Task 1: Add users table and password hashing utilities

**Files:**
- Modify: `server/db.js` — add `users` table to schema
- Create: `server/password.js` — hashPassword / verifyPassword using scryptSync
- Create: `server/__tests__/password.test.js`

**Step 1: Write the test**

```js
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../password.js';

describe('password', () => {
  it('hashPassword returns a string containing salt and hash', () => {
    const h = hashPassword('test123');
    expect(typeof h).toBe('string');
    expect(h).toContain('.');
  });

  it('verifyPassword returns true for correct password', () => {
    const h = hashPassword('test123');
    expect(verifyPassword('test123', h)).toBe(true);
  });

  it('verifyPassword returns false for wrong password', () => {
    const h = hashPassword('test123');
    expect(verifyPassword('wrong', h)).toBe(false);
  });

  it('different calls produce different hashes (unique salt)', () => {
    const h1 = hashPassword('test123');
    const h2 = hashPassword('test123');
    expect(h1).not.toBe(h2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/password.test.js`
Expected: FAIL — module not found

**Step 3: Implement password.js**

```js
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export function hashPassword(password) {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}.${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split('.');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, KEY_LENGTH);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/password.test.js`
Expected: PASS (4 tests)

**Step 5: Add users table to db.js schema**

Add to the schema string in `server/db.js`, after the sessions table:

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  passwordHash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator'
);
```

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (schema change is additive, no breaks)

**Step 7: Commit**

```bash
git add server/password.js server/__tests__/password.test.js server/db.js
git commit -m "feat: add users table and scrypt password hashing"
```

---

### Task 2: Add user management CLI script

**Files:**
- Create: `server/add-user.js` — CLI: `node server/add-user.js <username> <password> [role]`
- Modify: `package.json` — add `"add-user"` script

**Step 1: Implement add-user.js**

```js
import { createDb } from './db.js';
import { hashPassword } from './password.js';
import { randomUUID } from 'node:crypto';

const [,, username, password, role = 'operator'] = process.argv;

if (!username || !password) {
  console.error('Usage: node server/add-user.js <username> <password> [role]');
  console.error('  role: operator (default) or admin');
  process.exit(1);
}

if (!['operator', 'admin'].includes(role)) {
  console.error('Invalid role. Must be "operator" or "admin".');
  process.exit(1);
}

const db = createDb();
const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (existing) {
  console.error(`User "${username}" already exists.`);
  db.close();
  process.exit(1);
}

const id = randomUUID();
const passwordHash = hashPassword(password);
db.prepare('INSERT INTO users (id, username, passwordHash, role) VALUES (?, ?, ?, ?)').run(
  id, username, passwordHash, role
);
db.close();
console.log(`User "${username}" created with role "${role}".`);
```

**Step 2: Add npm script to package.json**

Add to the `"scripts"` section:
```json
"add-user": "node server/add-user.js"
```

**Step 3: Test manually**

Run: `node server/add-user.js testuser testpass`
Expected: `User "testuser" created with role "operator".`

Run: `node server/add-user.js testuser testpass`
Expected: `User "testuser" already exists.` (exit 1)

Clean up the test user (it went into data.sqlite, which is fine for now — it's dev data).

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 5: Commit**

```bash
git add server/add-user.js package.json
git commit -m "feat: add user management CLI (npm run add-user)"
```

---

### Task 3: Rewrite auth.js for real credential verification + session expiry

**Files:**
- Modify: `server/auth.js` — verify password against users table, add session expiry, add role to session
- Modify: `server/__tests__/auth.test.js` — update tests for new behavior

**Step 1: Write the tests**

Replace the entire test file content:

```js
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createDb } from '../db.js';
import { hashPassword } from '../password.js';
import { randomUUID } from 'node:crypto';

function setup() {
  const db = createDb({ memory: true });
  // seed a test user
  db.prepare('INSERT INTO users (id, username, passwordHash, role) VALUES (?, ?, ?, ?)').run(
    randomUUID(), 'demo', hashPassword('demo123'), 'operator'
  );
  db.prepare('INSERT INTO users (id, username, passwordHash, role) VALUES (?, ?, ?, ?)').run(
    randomUUID(), 'admin', hashPassword('admin123'), 'admin'
  );
  const app = createApp({ db });
  return { app, db };
}

async function loginAs(app, username, password) {
  const res = await request(app).post('/api/login').send({ username, password });
  return res;
}

describe('POST /api/login', () => {
  it('rejects empty credentials', async () => {
    const { app } = setup();
    const res = await request(app).post('/api/login').send({});
    expect(res.status).toBe(400);
  });

  it('rejects wrong password', async () => {
    const { app } = setup();
    const res = await loginAs(app, 'demo', 'wrongpass');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/账号或口令错误/);
  });

  it('rejects non-existent user', async () => {
    const { app } = setup();
    const res = await loginAs(app, 'nobody', 'pass');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/账号或口令错误/);
  });

  it('returns token and user for valid credentials', async () => {
    const { app } = setup();
    const res = await loginAs(app, 'demo', 'demo123');
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.name).toBe('demo');
    expect(res.body.user.role).toBe('operator');
  });

  it('persists session with expiry in database', async () => {
    const { app, db } = setup();
    const res = await loginAs(app, 'demo', 'demo123');
    const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(res.body.token);
    expect(session).toBeTruthy();
    expect(session.expiresAt).toBeTruthy();
  });
});

describe('POST /api/logout', () => {
  it('deletes the session', async () => {
    const { app, db } = setup();
    const login = await loginAs(app, 'demo', 'demo123');
    const token = login.body.token;

    const res = await request(app).post('/api/logout').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
    expect(session).toBeFalsy();
  });
});

describe('Session expiry', () => {
  it('rejects expired session', async () => {
    const { app, db } = setup();
    const login = await loginAs(app, 'demo', 'demo123');
    const token = login.body.token;

    // manually set expiresAt to past
    db.prepare('UPDATE sessions SET expiresAt = ?').run('2020-01-01T00:00:00.000Z');

    const res = await request(app).get('/api/meta').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

describe('Auth guard', () => {
  it('rejects request without token', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/meta');
    expect(res.status).toBe(401);
  });

  it('sets req.user with role from session', async () => {
    const { app } = setup();
    const login = await loginAs(app, 'admin', 'admin123');
    const res = await request(app).get('/api/meta').set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run server/__tests__/auth.test.js`
Expected: FAIL — old auth accepts any password, no expiry, no logout route

**Step 3: Rewrite auth.js**

Replace `server/auth.js` entirely:

```js
import { randomUUID } from 'node:crypto';
import { verifyPassword } from './password.js';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function createAuth(db) {
  const insertSession = db.prepare(
    'INSERT INTO sessions (token, userId, userName, role, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const getSession = db.prepare('SELECT * FROM sessions WHERE token = ?');
  const deleteSession = db.prepare('DELETE FROM sessions WHERE token = ?');
  const findUser = db.prepare('SELECT * FROM users WHERE username = ?');

  function login({ username, password }) {
    if (!username || !password) throw new Error('账号与口令不能为空');
    const user = findUser.get(username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new Error('账号或口令错误');
    }
    const token = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    insertSession.run(token, user.id, user.username, user.role, now.toISOString(), expiresAt.toISOString());
    return { token, user: { id: user.id, name: user.username, role: user.role } };
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
    if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
      deleteSession.run(token);
      return res.status(401).json({ error: 'Session expired' });
    }
    req.user = { id: session.userId, name: session.userName, role: session.role };
    next();
  }

  return { login, logout, authenticate };
}
```

**Step 4: Add role and expiresAt columns to sessions table in db.js**

Update the sessions table in the schema:

```sql
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  userName TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator',
  createdAt TEXT NOT NULL,
  expiresAt TEXT NOT NULL
);
```

**Step 5: Add logout route to app.js**

Add this route right after the `app.use(auth.authenticate)` line:

```js
app.post('/api/logout', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  auth.logout(token);
  res.json({ ok: true });
});
```

**Step 6: Fix actorId in POST /api/events and POST /api/events/undo**

In `server/app.js`, the `POST /api/events` route currently allows `actorId` from request body. Change to always use the authenticated user:

In the POST /api/events handler, replace:
```js
const actor = actorId || req.user?.id || 'emp-01';
```
with:
```js
const actor = req.user.id;
```

In the POST /api/events/undo handler, replace:
```js
const actorId = req.user?.id || 'emp-01';
```
with:
```js
const actorId = req.user.id;
```

**Step 7: Run auth tests**

Run: `npx vitest run server/__tests__/auth.test.js`
Expected: All auth tests pass

**Step 8: Fix other test files that rely on old auth behavior**

The other test files (events.test.js, domain.test.js, etc.) call `POST /api/login` with arbitrary credentials. They need to seed a test user first. Update each test file's `setup()` function to insert a user into the users table.

In `server/__tests__/events.test.js`, update setup:
```js
import { hashPassword } from '../password.js';
import { randomUUID } from 'node:crypto';

function setup() {
  const db = createDb({ memory: true });
  db.prepare('INSERT INTO users (id, username, passwordHash, role) VALUES (?, ?, ?, ?)').run(
    randomUUID(), 'demo', hashPassword('demo'), 'operator'
  );
  const app = createApp({ db });
  return { app, db };
}
```

And update the login call to use the seeded password. Find where it does:
```js
.send({ username: 'demo', password: 'demo' })
```
This now works because the password is 'demo' and the hash is for 'demo'.

Do the same for `server/__tests__/meta.test.js`.

**Step 9: Run ALL tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 10: Commit**

```bash
git add server/auth.js server/db.js server/app.js server/__tests__/auth.test.js server/__tests__/events.test.js server/__tests__/meta.test.js
git commit -m "feat: real password verification, session expiry, logout endpoint"
```

---

### Task 4: Add admin role middleware and protect admin routes

**Files:**
- Modify: `server/auth.js` — add `requireAdmin` middleware
- Modify: `server/app.js` — protect admin-specific routes (future admin API routes)
- Modify: `server/__tests__/auth.test.js` — add role-guard tests

**Step 1: Write the tests**

Add to `server/__tests__/auth.test.js`:

```js
describe('Admin role guard', () => {
  it('allows admin to access admin routes', async () => {
    const { app } = setup();
    const login = await loginAs(app, 'admin', 'admin123');
    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
  });

  it('rejects operator from admin routes', async () => {
    const { app } = setup();
    const login = await loginAs(app, 'demo', 'demo123');
    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(403);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run server/__tests__/auth.test.js`
Expected: FAIL — no /api/admin/users route

**Step 3: Add requireAdmin middleware to auth.js**

Add to the returned object in `createAuth`:

```js
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}

return { login, logout, authenticate, requireAdmin };
```

**Step 4: Add admin user-list route to app.js**

Add after the logout route:

```js
app.get('/api/admin/users', auth.requireAdmin, (_req, res) => {
  const users = db.prepare('SELECT id, username, role FROM users').all();
  res.json(users);
});
```

**Step 5: Run tests**

Run: `npx vitest run server/__tests__/auth.test.js`
Expected: All auth tests pass

**Step 6: Run ALL tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 7: Commit**

```bash
git add server/auth.js server/app.js server/__tests__/auth.test.js
git commit -m "feat: add admin role middleware and user list endpoint"
```

---

### Task 5: Add login rate limiting

**Files:**
- Modify: `server/app.js` — add simple in-memory rate limiter for /api/login
- Modify: `server/__tests__/auth.test.js` — add rate limit test

**Step 1: Write the test**

Add to `server/__tests__/auth.test.js`:

```js
describe('Login rate limiting', () => {
  it('blocks after 5 failed attempts', async () => {
    const { app } = setup();
    for (let i = 0; i < 5; i++) {
      await loginAs(app, 'demo', 'wrongpass');
    }
    const res = await loginAs(app, 'demo', 'demo123');
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/过多/);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/auth.test.js`
Expected: FAIL — no rate limiting, returns 200

**Step 3: Add rate limiter to app.js**

Add before the login route:

```js
// Simple in-memory login rate limiter
const loginAttempts = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 5;

function checkLoginRate(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now - record.start > RATE_LIMIT_WINDOW) {
    loginAttempts.set(ip, { start: now, count: 1 });
    return true;
  }
  record.count++;
  return record.count <= RATE_LIMIT_MAX;
}
```

Update the login route:

```js
app.post('/api/login', (req, res) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  if (!checkLoginRate(ip)) {
    return res.status(429).json({ error: '登录尝试过多，请稍后再试' });
  }
  const { username, password } = req.body || {};
  try {
    const session = auth.login({ username, password });
    res.json(session);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Bad credentials' });
  }
});
```

**Step 4: Run tests**

Run: `npx vitest run server/__tests__/auth.test.js`
Expected: All auth tests pass

**Step 5: Run ALL tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 6: Commit**

```bash
git add server/app.js server/__tests__/auth.test.js
git commit -m "feat: add login rate limiting (5 attempts per minute per IP)"
```

---

### Task 6: Add api.logout to frontend + seed default admin user

**Files:**
- Modify: `src/lib/api.js` — add `logout(token)` method
- Modify: `src/main.js` — use `api.logout()` on logout button click
- Modify: `server/db.js` — seed a default admin user when DB is first created

**Step 1: Add logout to api.js**

Add to the return object in `createApi`:

```js
logout(token) {
  return request('/api/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }, token);
},
```

**Step 2: Update logout button in main.js**

Find the logoutBtn listener in the `bootstrap` function. Change:

```js
logoutBtn.addEventListener('click', () => {
  clearAuth();
  window.location.href = './login.html';
});
```

to:

```js
logoutBtn.addEventListener('click', async () => {
  try {
    await api.logout(authToken());
  } catch {
    // ignore errors — clear locally regardless
  }
  clearAuth();
  window.location.href = './login.html';
});
```

**Step 3: Seed default admin user in db.js**

In `server/db.js`, inside the `if (count === 0)` seed block, add user seeding. Import hashPassword:

```js
import { hashPassword } from './password.js';
```

In the seed transaction, after seeding plants/dishes, add:

```js
const insUser = db.prepare(
  'INSERT INTO users (id, username, passwordHash, role) VALUES (?, ?, ?, ?)'
);
insUser.run('admin-001', 'admin', hashPassword('admin'), 'admin');
insUser.run('user-001', 'demo', hashPassword('demo'), 'operator');
```

**Step 4: Update CLAUDE.md**

Add to CLAUDE.md under Commands section:
```
- `npm run add-user -- <username> <password> [role]` — Add a user (role: operator|admin)
```

Update the Auth flow section to note that login now requires a real user with correct password, default users are admin/admin and demo/demo.

**Step 5: Run ALL tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/lib/api.js src/main.js server/db.js CLAUDE.md package.json
git commit -m "feat: frontend logout API, seed default users, update docs"
```

---

## Summary of changes across tasks

| Task | What | Files |
|------|------|-------|
| 1 | Users table + password hashing | db.js, password.js, test |
| 2 | add-user CLI script | add-user.js, package.json |
| 3 | Real auth + session expiry + logout | auth.js, app.js, db.js, tests |
| 4 | Admin role middleware + user list API | auth.js, app.js, test |
| 5 | Login rate limiting | app.js, test |
| 6 | Frontend logout + seed users + docs | api.js, main.js, db.js, CLAUDE.md |
