import { describe, it, expect } from 'vitest';
import { createDb, parseEvent } from '../db.js';

describe('createDb', () => {
  it('creates tables and seeds data', () => {
    const db = createDb({ memory: true });
    expect(db.prepare('SELECT COUNT(*) as c FROM plants').get().c).toBe(10);
    expect(db.prepare('SELECT COUNT(*) as c FROM dishes').get().c).toBe(10);
    expect(db.prepare('SELECT COUNT(*) as c FROM locations').get().c).toBe(3);
    expect(db.prepare('SELECT COUNT(*) as c FROM trays').get().c).toBe(4);
    expect(db.prepare('SELECT COUNT(*) as c FROM events').get().c).toBe(0);
    expect(db.prepare('SELECT COUNT(*) as c FROM sessions').get().c).toBe(0);
    db.close();
  });

  it('returns plant rows matching seed shape', () => {
    const db = createDb({ memory: true });
    const plant = db.prepare('SELECT * FROM plants WHERE id = ?').get('P-1');
    expect(plant).toEqual({ id: 'P-1', type: '品种A', stage: '萌发', status: '正常', dishId: 'D-1' });
    db.close();
  });
});

describe('parseEvent', () => {
  it('deserializes JSON columns', () => {
    const row = {
      id: 'e1', type: 'split', actorId: 'u1', ts: '2026-01-01T00:00:00.000Z',
      inputIds: '["P-1"]', outputIds: '["P-2","P-3"]', meta: '{"trayId":"T-01"}',
    };
    const event = parseEvent(row);
    expect(event.inputIds).toEqual(['P-1']);
    expect(event.outputIds).toEqual(['P-2', 'P-3']);
    expect(event.meta).toEqual({ trayId: 'T-01' });
  });

  it('returns null for null input', () => {
    expect(parseEvent(null)).toBeNull();
  });
});
