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
