import Database from 'better-sqlite3';
import { seedLocations, seedTrays, seedPlants, seedDishes } from './seed.js';
import { hashPassword } from './password.js';

const schema = `
  CREATE TABLE IF NOT EXISTS plants (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    stage TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT '正常',
    dishId TEXT
  );
  CREATE TABLE IF NOT EXISTS dishes (
    id TEXT PRIMARY KEY,
    plantId TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    actorId TEXT NOT NULL,
    ts TEXT NOT NULL,
    inputIds TEXT NOT NULL DEFAULT '[]',
    outputIds TEXT NOT NULL DEFAULT '[]',
    meta TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE IF NOT EXISTS locations (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS trays (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    userName TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'operator',
    createdAt TEXT NOT NULL,
    expiresAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'operator'
  );
`;

export function parseEvent(row) {
  if (!row) return null;
  return {
    ...row,
    inputIds: JSON.parse(row.inputIds),
    outputIds: JSON.parse(row.outputIds),
    meta: JSON.parse(row.meta),
  };
}

export function createDb({ file = 'server/data.sqlite', memory = false } = {}) {
  const db = new Database(memory ? ':memory:' : file);
  db.pragma('journal_mode = WAL');
  db.exec(schema);

  const count = db.prepare('SELECT COUNT(*) as c FROM plants').get().c;
  if (count === 0) {
    const seedAll = db.transaction(() => {
      const insLoc = db.prepare('INSERT INTO locations (id, label) VALUES (?, ?)');
      const insTray = db.prepare('INSERT INTO trays (id, label) VALUES (?, ?)');
      const insPlant = db.prepare(
        'INSERT INTO plants (id, type, stage, status, dishId) VALUES (?, ?, ?, ?, ?)'
      );
      const insDish = db.prepare('INSERT INTO dishes (id, plantId) VALUES (?, ?)');
      for (const l of seedLocations) insLoc.run(l.id, l.label);
      for (const t of seedTrays) insTray.run(t.id, t.label);
      for (const p of seedPlants) insPlant.run(p.id, p.type, p.stage, p.status, p.dishId);
      for (const d of seedDishes) insDish.run(d.id, d.plantId);
      const insUser = db.prepare(
        'INSERT INTO users (id, username, passwordHash, role) VALUES (?, ?, ?, ?)'
      );
      insUser.run('admin-001', 'admin', hashPassword('admin'), 'admin');
      insUser.run('user-001', 'demo', hashPassword('demo'), 'operator');
    });
    seedAll();
  }

  return db;
}
