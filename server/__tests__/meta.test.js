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
