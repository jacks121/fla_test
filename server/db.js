import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { randomUUID } from 'node:crypto';
import { seedMeta, seedPlants, seedDishes } from './seed.js';

const defaultData = {
  meta: seedMeta,
  plants: seedPlants,
  dishes: seedDishes,
  events: [],
};

export async function createDb({ file = 'server/data.json', memory = false } = {}) {
  const dbFile = memory ? `/tmp/fla-test-${randomUUID()}.json` : file;
  const adapter = new JSONFile(dbFile);
  const db = new Low(adapter, structuredClone(defaultData));
  await db.read();
  if (!db.data) {
    db.data = structuredClone(defaultData);
    await db.write();
  }
  if (!db.data.meta) db.data.meta = structuredClone(seedMeta);
  if (!db.data.plants) db.data.plants = structuredClone(seedPlants);
  if (!db.data.dishes) db.data.dishes = structuredClone(seedDishes);
  if (!db.data.events) db.data.events = [];
  return db;
}
