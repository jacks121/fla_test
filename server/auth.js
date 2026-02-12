import { randomUUID } from 'node:crypto';
import { verifyPassword } from './password.js';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function createAuth(db) {
  const insertSession = db.prepare(
    'INSERT INTO sessions (token, userId, userName, role, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const selectSession = db.prepare('SELECT * FROM sessions WHERE token = ?');
  const deleteSession = db.prepare('DELETE FROM sessions WHERE token = ?');
  const findUser = db.prepare('SELECT * FROM users WHERE username = ?');

  function login({ username, password }) {
    if (!username || !password) throw new Error('账号与口令不能为空');
    const user = findUser.get(username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new Error('账号或口令错误');
    }
    const token = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    insertSession.run(token, user.id, user.username, user.role, now.toISOString(), expiresAt.toISOString());
    return { token, user: { id: user.id, name: user.username, role: user.role } };
  }

  function logout(token) {
    deleteSession.run(token);
  }

  function getSession(token) {
    return selectSession.get(token);
  }

  // Backward-compatible middleware (used by tests that call auth.authenticate directly)
  function authenticate(req, res, next) {
    if (req.path === '/api/health' || req.path === '/api/login') return next();
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const session = getSession(token);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
      deleteSession.run(token);
      return res.status(401).json({ error: 'Session expired' });
    }
    req.user = { id: session.userId, name: session.userName, role: session.role };
    next();
  }

  function requireAdmin(req, res, next) {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: '需要管理员权限' });
    }
    next();
  }

  return { login, logout, getSession, authenticate, requireAdmin };
}
