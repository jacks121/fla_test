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
