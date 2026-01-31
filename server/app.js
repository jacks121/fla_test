import express from 'express';
import cors from 'cors';
import { createDomain } from './domain.js';

export function createApp({ db }) {
  const app = express();
  const domain = createDomain(db);
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/meta', async (_req, res) => {
    await db.read();
    res.json(db.data.meta);
  });

  app.get('/api/plants', async (req, res) => {
    await db.read();
    const q = (req.query.query || '').toString();
    const list = q
      ? db.data.plants.filter((p) => p.id.includes(q) || p.type.includes(q))
      : db.data.plants;
    res.json(list);
  });

  app.get('/api/dishes', async (req, res) => {
    await db.read();
    const q = (req.query.query || '').toString();
    const list = q ? db.data.dishes.filter((d) => d.id.includes(q)) : db.data.dishes;
    res.json(list);
  });

  app.get('/api/events', async (req, res) => {
    await db.read();
    const { type, actorId, from, to } = req.query;
    let events = [...db.data.events];
    if (type) events = events.filter((e) => e.type === type);
    if (actorId) events = events.filter((e) => e.actorId === actorId);
    if (from) events = events.filter((e) => e.ts >= from);
    if (to) events = events.filter((e) => e.ts <= to);
    res.json(events);
  });

  app.post('/api/events', async (req, res) => {
    const { type, actorId, payload } = req.body || {};
    try {
      await db.read();
      let event;
      switch (type) {
        case 'split':
          event = domain.split(payload);
          break;
        case 'merge':
          event = domain.merge(payload);
          break;
        case 'place':
          event = domain.place(payload);
          break;
        case 'status':
          event = domain.updateStatus(payload);
          break;
        case 'transfer':
          event = domain.transfer(payload);
          break;
        default:
          return res.status(400).json({ error: 'Invalid event type' });
      }
      event.actorId = actorId || event.actorId;
      db.data.events.unshift(event);
      await db.write();
      res.json(event);
    } catch (err) {
      res.status(400).json({ error: err.message || 'Bad request' });
    }
  });

  return app;
}
