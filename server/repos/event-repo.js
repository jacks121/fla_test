import { randomUUID } from 'node:crypto';
import { parseEvent } from '../db.js';

export function createEventRepo(db) {
  const stmts = {
    insert: db.prepare(
      'INSERT INTO events (id, type, actorId, ts, inputIds, outputIds, meta) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ),
    findLastByActor: db.prepare(
      'SELECT * FROM events WHERE actorId = ? ORDER BY rowid DESC LIMIT 1'
    ),
  };

  return {
    insert(event) {
      stmts.insert.run(
        event.id, event.type, event.actorId, event.ts,
        JSON.stringify(event.inputIds),
        JSON.stringify(event.outputIds),
        JSON.stringify(event.meta)
      );
      return event;
    },
    createAndInsert({ type, actorId, inputIds = [], outputIds = [], meta = {} }) {
      const event = {
        id: randomUUID(),
        type,
        actorId,
        ts: new Date().toISOString(),
        inputIds,
        outputIds,
        meta,
      };
      return this.insert(event);
    },
    findLastByActor(actorId) {
      const row = stmts.findLastByActor.get(actorId);
      return parseEvent(row);
    },
    findAll({ type, actorId, from, to } = {}) {
      let sql = 'SELECT * FROM events WHERE 1=1';
      const params = [];
      if (type) { sql += ' AND type = ?'; params.push(type); }
      if (actorId) { sql += ' AND actorId = ?'; params.push(actorId); }
      if (from) { sql += ' AND ts >= ?'; params.push(from); }
      if (to) { sql += ' AND ts <= ?'; params.push(to); }
      sql += ' ORDER BY ts DESC';
      const rows = db.prepare(sql).all(...params);
      return rows.map(parseEvent);
    },
  };
}
