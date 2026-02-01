// server/migrate-json-to-sqlite.js
import { readFileSync, existsSync } from 'node:fs';
import { createDb } from './db.js';

const jsonPath = process.argv[2] || 'server/data.json';

if (!existsSync(jsonPath)) {
  console.log(`No file found at ${jsonPath}, nothing to migrate.`);
  process.exit(0);
}

const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
const db = createDb({ file: 'server/data.sqlite' });

const migrate = db.transaction(() => {
  // Clear seed data to replace with JSON data
  db.prepare('DELETE FROM events').run();
  db.prepare('DELETE FROM dishes').run();
  db.prepare('DELETE FROM plants').run();
  db.prepare('DELETE FROM locations').run();
  db.prepare('DELETE FROM trays').run();

  if (data.meta?.locations) {
    const ins = db.prepare('INSERT INTO locations (id, label) VALUES (?, ?)');
    for (const l of data.meta.locations) ins.run(l.id, l.label);
  }
  if (data.meta?.trays) {
    const ins = db.prepare('INSERT INTO trays (id, label) VALUES (?, ?)');
    for (const t of data.meta.trays) ins.run(t.id, t.label);
  }
  if (data.plants) {
    const ins = db.prepare(
      'INSERT INTO plants (id, type, stage, status, dishId) VALUES (?, ?, ?, ?, ?)'
    );
    for (const p of data.plants) ins.run(p.id, p.type, p.stage, p.status, p.dishId);
  }
  if (data.dishes) {
    const ins = db.prepare('INSERT INTO dishes (id, plantId) VALUES (?, ?)');
    for (const d of data.dishes) ins.run(d.id, d.plantId);
  }
  if (data.events) {
    const ins = db.prepare(
      'INSERT INTO events (id, type, actorId, ts, inputIds, outputIds, meta) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    for (const e of data.events) {
      ins.run(
        e.id, e.type, e.actorId, e.ts,
        JSON.stringify(e.inputIds || []),
        JSON.stringify(e.outputIds || []),
        JSON.stringify(e.meta || {})
      );
    }
  }
});

migrate();
db.close();

const counts = {
  plants: data.plants?.length || 0,
  dishes: data.dishes?.length || 0,
  events: data.events?.length || 0,
};
console.log(`Migration complete: ${counts.plants} plants, ${counts.dishes} dishes, ${counts.events} events`);
