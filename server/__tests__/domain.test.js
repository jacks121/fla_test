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

describe('domain.create', () => {
  it('creates plants and dishes in batch', () => {
    const { db, domain } = setup();
    const event = domain.create({ type: '品种A', stage: '萌发', count: 3, trayId: 'T-01' });
    expect(event.type).toBe('create');
    expect(event.outputIds).toHaveLength(3);
    expect(event.meta.plantType).toBe('品种A');
    const dishes = db.prepare('SELECT * FROM dishes').all();
    expect(dishes.length).toBe(13); // 10 seed + 3 new
  });

  it('rejects missing type', () => {
    const { domain } = setup();
    expect(() => domain.create({ stage: '萌发', count: 1, trayId: 'T-01' }))
      .toThrow('缺少品种');
  });

  it('rejects count < 1', () => {
    const { domain } = setup();
    expect(() => domain.create({ type: '品种A', stage: '萌发', count: 0, trayId: 'T-01' }))
      .toThrow('数量需大于 0');
  });
});

describe('domain.undo', () => {
  it('undoes a split by deleting created plants/dishes', () => {
    const { db, domain } = setup();
    const splitEvent = domain.split({ parentDishId: 'D-1', trayId: 'T-01', count: 2, actorId: 'user-1' });
    const undoEvent = domain.undo({ actorId: 'user-1' });
    expect(undoEvent.type).toBe('undo');
    expect(undoEvent.meta.undoneEventId).toBe(splitEvent.id);
    expect(undoEvent.meta.undoneEventType).toBe('split');
    for (const pid of splitEvent.outputIds) {
      expect(db.prepare('SELECT * FROM plants WHERE id = ?').get(pid)).toBeUndefined();
    }
    const dishes = db.prepare('SELECT * FROM dishes').all();
    expect(dishes.length).toBe(10);
  });

  it('undoes a create by deleting created plants/dishes', () => {
    const { db, domain } = setup();
    domain.create({ type: '品种A', stage: '萌发', count: 2, trayId: 'T-01', actorId: 'user-1' });
    domain.undo({ actorId: 'user-1' });
    const dishes = db.prepare('SELECT * FROM dishes').all();
    expect(dishes.length).toBe(10);
  });

  it('undoes a merge by deleting merged plant/dish', () => {
    const { db, domain } = setup();
    domain.merge({ parentDishIds: ['D-1', 'D-2'], trayId: 'T-02', actorId: 'user-1' });
    domain.undo({ actorId: 'user-1' });
    const dishes = db.prepare('SELECT * FROM dishes').all();
    expect(dishes.length).toBe(10);
  });

  it('undoes a status change by restoring old status', () => {
    const { db, domain } = setup();
    domain.updateStatus({ dishId: 'D-1', status: '感染', actorId: 'user-1' });
    domain.undo({ actorId: 'user-1' });
    const plant = db.prepare("SELECT * FROM plants WHERE dishId = 'D-1'").get();
    expect(plant.status).toBe('正常');
  });

  it('undoes a transfer by restoring old dish', () => {
    const { db, domain } = setup();
    domain.transfer({ fromDishId: 'D-1', toDishId: 'D-X1', actorId: 'user-1' });
    domain.undo({ actorId: 'user-1' });
    expect(db.prepare('SELECT * FROM dishes WHERE id = ?').get('D-1')).toBeTruthy();
    expect(db.prepare('SELECT * FROM dishes WHERE id = ?').get('D-X1')).toBeUndefined();
    const plant = db.prepare('SELECT * FROM plants WHERE id = ?').get('P-1');
    expect(plant.dishId).toBe('D-1');
  });

  it('rejects consecutive undo', () => {
    const { domain } = setup();
    domain.split({ parentDishId: 'D-1', trayId: 'T-01', count: 1, actorId: 'user-1' });
    domain.undo({ actorId: 'user-1' });
    expect(() => domain.undo({ actorId: 'user-1' })).toThrow('不能连续撤销');
  });

  it('rejects undo with no events', () => {
    const { domain } = setup();
    expect(() => domain.undo({ actorId: 'user-1' })).toThrow('没有可撤销的操作');
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
