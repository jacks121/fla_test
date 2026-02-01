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
