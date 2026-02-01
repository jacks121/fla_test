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

  it('records create event', async () => {
    const { db, app, token } = await setupWithToken();
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'create',
        actorId: 'emp-01',
        payload: { type: '品种A', stage: '萌发', count: 2, trayId: 'T-01' },
      });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('create');
    expect(res.body.outputIds.length).toBe(2);
    expect(res.body.meta.plantType).toBe('品种A');
    const dishes = db.prepare('SELECT * FROM dishes').all();
    expect(dishes.length).toBe(12);
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
