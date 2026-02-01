import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createDb } from '../db.js';
import { hashPassword } from '../password.js';
import { randomUUID } from 'node:crypto';

function setup() {
  const db = createDb({ memory: true });
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
  return request(app).post('/api/login').send({ username, password });
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

  it('allows authenticated requests', async () => {
    const { app } = setup();
    const login = await loginAs(app, 'admin', 'admin123');
    const res = await request(app).get('/api/meta').set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
  });
});
