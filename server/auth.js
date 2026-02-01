import { randomUUID } from 'node:crypto';

export function createAuth(db) {
  const insertSession = db.prepare(
    'INSERT INTO sessions (token, userId, userName, createdAt) VALUES (?, ?, ?, ?)'
  );
  const getSession = db.prepare('SELECT * FROM sessions WHERE token = ?');
  const deleteSession = db.prepare('DELETE FROM sessions WHERE token = ?');

  function login({ username, password }) {
    if (!username || !password) throw new Error('账号与口令不能为空');
    const token = randomUUID();
    const user = { id: username, name: username };
    insertSession.run(token, user.id, user.name, new Date().toISOString());
    return { token, user };
  }

  function logout(token) {
    deleteSession.run(token);
  }

  function authenticate(req, res, next) {
    if (req.path === '/api/health' || req.path === '/api/login') return next();
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const session = getSession.get(token);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    req.user = { id: session.userId, name: session.userName };
    next();
  }

  return { login, logout, authenticate };
}
