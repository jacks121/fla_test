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

describe('api client error handling', () => {
  let api;
  let token;

  beforeAll(async () => {
    api = createApi(baseUrl);
    const login = await api.login({ username: 'demo', password: 'demo' });
    token = login.token;
  });

  it('throws with status 401 for expired/invalid token', async () => {
    try {
      await api.getMeta('invalid-token');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).toBe(401);
    }
  });

  it('throws with status 400 for bad login', async () => {
    try {
      await api.login({ username: 'demo', password: 'wrong' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/账号或口令错误/);
    }
  });

  it('throws with domain error message for bad event', async () => {
    try {
      await api.postEvent(
        { type: 'split', payload: { parentDishId: 'NOPE', trayId: 'T-01', count: 1 } },
        token
      );
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toBeTruthy();
    }
  });
});

describe('api client additional methods', () => {
  let api;
  let token;

  beforeAll(async () => {
    api = createApi(baseUrl);
    const login = await api.login({ username: 'demo', password: 'demo' });
    token = login.token;
  });

  it('getDishes returns array', async () => {
    const dishes = await api.getDishes(undefined, token);
    expect(Array.isArray(dishes)).toBe(true);
    expect(dishes.length).toBeGreaterThanOrEqual(10);
  });

  it('getEvents returns array', async () => {
    const events = await api.getEvents(undefined, token);
    expect(Array.isArray(events)).toBe(true);
  });

  it('undo throws when no events to undo', async () => {
    // First undo succeeds (undoes prior split event), second undo throws 400
    await api.undo(token);
    try {
      await api.undo(token);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).toBe(400);
    }
  });

  it('logout succeeds', async () => {
    const result = await api.logout(token);
    expect(result.ok).toBe(true);
  });
});
