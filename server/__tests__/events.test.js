import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createDb } from '../db.js';

async function setup() {
  const db = await createDb({ memory: true });
  const app = createApp({ db });
  return { db, app };
}

describe('POST /api/events', () => {
  it('records split events and creates dishes', async () => {
    const { db, app } = await setup();
    const res = await request(app).post('/api/events').send({
      type: 'split',
      actorId: 'emp-01',
      payload: { parentDishId: 'D-1', trayId: 'T-01', count: 2 },
    });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('split');
    expect(res.body.outputIds.length).toBe(2);
    await db.read();
    expect(db.data.dishes.length).toBeGreaterThan(10);
  });

  it('records merge event', async () => {
    const { app } = await setup();
    const res = await request(app).post('/api/events').send({
      type: 'merge',
      actorId: 'emp-01',
      payload: { parentDishIds: ['D-1', 'D-2'], trayId: 'T-02' },
    });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('merge');
    expect(res.body.outputIds.length).toBe(1);
  });

  it('records place event with tray + location', async () => {
    const { app } = await setup();
    const res = await request(app).post('/api/events').send({
      type: 'place',
      actorId: 'emp-01',
      payload: { trayId: 'T-03', locationId: 'rack-A1' },
    });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('place');
    expect(res.body.meta.trayId).toBe('T-03');
  });

  it('updates status event', async () => {
    const { db, app } = await setup();
    const res = await request(app).post('/api/events').send({
      type: 'status',
      actorId: 'emp-01',
      payload: { dishId: 'D-1', status: '感染' },
    });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('status');
    await db.read();
    const plant = db.data.plants.find((p) => p.dishId === 'D-1');
    expect(plant.status).toBe('感染');
  });

  it('records transfer event', async () => {
    const { db, app } = await setup();
    const res = await request(app).post('/api/events').send({
      type: 'transfer',
      actorId: 'emp-01',
      payload: { fromDishId: 'D-1', toDishId: 'D-X1' },
    });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('transfer');
    await db.read();
    const dish = db.data.dishes.find((d) => d.id === 'D-X1');
    expect(dish).toBeTruthy();
  });
});

describe('GET /api/events', () => {
  it('filters by type', async () => {
    const { app } = await setup();
    await request(app).post('/api/events').send({
      type: 'place',
      actorId: 'emp-01',
      payload: { trayId: 'T-03', locationId: 'rack-A1' },
    });
    const res = await request(app).get('/api/events?type=place');
    expect(res.status).toBe(200);
    expect(res.body.every((e) => e.type === 'place')).toBe(true);
  });
});
