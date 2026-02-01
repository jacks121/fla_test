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
    const dishes = db.prepare('SELECT * FROM dishes').all();
    expect(dishes.length).toBe(12);
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
    expect(dishes.length).toBe(11);
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
    expect(db.prepare('SELECT * FROM dishes WHERE id = ?').get('D-1')).toBeUndefined();
    expect(db.prepare('SELECT * FROM dishes WHERE id = ?').get('D-X1')).toBeTruthy();
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
