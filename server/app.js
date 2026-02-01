// server/app.js
import express from 'express';
import cors from 'cors';
import { createDomain } from './domain.js';
import { createAuth } from './auth.js';
import { parseEvent } from './db.js';
import { seedMeta } from './seed.js';

export function createApp({ db, distDir }) {
  const app = express();
  const domain = createDomain(db);
  const auth = createAuth(db);
  app.use(cors());
  app.use(express.json());

  // Serve static files BEFORE auth middleware
  if (distDir) {
    app.use(express.static(distDir));
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Simple in-memory login rate limiter
  const loginAttempts = new Map();
  const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
  const RATE_LIMIT_MAX = 5;

  function checkLoginRate(ip) {
    const now = Date.now();
    const record = loginAttempts.get(ip);
    if (!record || now - record.start > RATE_LIMIT_WINDOW) {
      loginAttempts.set(ip, { start: now, count: 1 });
      return true;
    }
    record.count++;
    return record.count <= RATE_LIMIT_MAX;
  }

  app.post('/api/login', (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkLoginRate(ip)) {
      return res.status(429).json({ error: '登录尝试过多，请稍后再试' });
    }
    const { username, password } = req.body || {};
    try {
      const session = auth.login({ username, password });
      res.json(session);
    } catch (err) {
      res.status(400).json({ error: err.message || 'Bad credentials' });
    }
  });

  app.use(auth.authenticate);

  app.post('/api/logout', (req, res) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    auth.logout(token);
    res.json({ ok: true });
  });

  app.get('/api/admin/users', auth.requireAdmin, (_req, res) => {
    const users = db.prepare('SELECT id, username, role FROM users').all();
    res.json(users);
  });

  app.get('/api/meta', (_req, res) => {
    const locations = db.prepare('SELECT * FROM locations').all();
    const trays = db.prepare('SELECT * FROM trays').all();
    res.json({
      locations,
      trays,
      statusEnum: seedMeta.statusEnum,
      stages: seedMeta.stages,
      types: seedMeta.types,
    });
  });

  app.get('/api/plants', (req, res) => {
    const q = (req.query.query || '').toString();
    const list = q
      ? db.prepare('SELECT * FROM plants WHERE id LIKE ? OR type LIKE ?').all(`%${q}%`, `%${q}%`)
      : db.prepare('SELECT * FROM plants').all();
    res.json(list);
  });

  app.get('/api/dishes', (req, res) => {
    const q = (req.query.query || '').toString();
    const list = q
      ? db.prepare('SELECT * FROM dishes WHERE id LIKE ?').all(`%${q}%`)
      : db.prepare('SELECT * FROM dishes').all();
    res.json(list);
  });

  app.get('/api/events', (req, res) => {
    const { type, actorId, from, to } = req.query;
    let sql = 'SELECT * FROM events WHERE 1=1';
    const params = [];
    if (type) { sql += ' AND type = ?'; params.push(type); }
    if (actorId) { sql += ' AND actorId = ?'; params.push(actorId); }
    if (from) { sql += ' AND ts >= ?'; params.push(from); }
    if (to) { sql += ' AND ts <= ?'; params.push(to); }
    sql += ' ORDER BY ts DESC';
    const rows = db.prepare(sql).all(...params);
    res.json(rows.map(parseEvent));
  });

  app.post('/api/events/undo', (req, res) => {
    try {
      const actorId = req.user.id;
      const event = domain.undo({ actorId });
      res.json(event);
    } catch (err) {
      res.status(400).json({ error: err.message || 'Bad request' });
    }
  });

  app.post('/api/events', (req, res) => {
    const { type, actorId, payload } = req.body || {};
    try {
      const actor = req.user.id;
      let event;
      switch (type) {
        case 'create':
          event = domain.create({ ...payload, actorId: actor });
          break;
        case 'split':
          event = domain.split({ ...payload, actorId: actor });
          break;
        case 'merge':
          event = domain.merge({ ...payload, actorId: actor });
          break;
        case 'place':
          event = domain.place({ ...payload, actorId: actor });
          break;
        case 'status':
          event = domain.updateStatus({ ...payload, actorId: actor });
          break;
        case 'transfer':
          event = domain.transfer({ ...payload, actorId: actor });
          break;
        default:
          return res.status(400).json({ error: 'Invalid event type' });
      }
      res.json(event);
    } catch (err) {
      res.status(400).json({ error: err.message || 'Bad request' });
    }
  });

  return app;
}
